import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch dashboard stats via RPC get_dashboard_stats()
    let stats = {
      total_production_today: 0,
      total_dispatch_today: 0,
      total_stock: 0,
      pending_dispatches: 0,
      total_models: 0,
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_dashboard_stats');

    if (!rpcError && rpcData) {
      stats = {
        total_production_today: Number(rpcData.total_production_today ?? 0),
        total_dispatch_today: Number(rpcData.total_dispatch_today ?? 0),
        total_stock: Number(rpcData.total_stock ?? 0),
        pending_dispatches: Number(rpcData.pending_dispatches ?? 0),
        total_models: Number(rpcData.total_models ?? 0),
      };
    } else {
      // Fallback direct table queries if RPC is not installed or fails
      try {
        const [prodRes, dispRes, stockRes, pendingRes, modelsRes] = await Promise.all([
          supabase
            .from('production_entries')
            .select('quantity')
            .eq('production_date', todayStr),
          supabase
            .from('dispatches')
            .select('id, dispatch_items(quantity)')
            .eq('dispatch_date', todayStr)
            .eq('status', 'confirmed'),
          supabase
            .from('stock_transactions')
            .select('quantity'),
          supabase
            .from('dispatches')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'draft'),
          supabase
            .from('cooler_models')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true),
        ]);

        const prodToday = prodRes.data?.reduce((acc, row) => acc + (row.quantity || 0), 0) || 0;
        let dispToday = 0;
        if (dispRes.data) {
          for (const d of dispRes.data) {
            for (const item of d.dispatch_items || []) {
              dispToday += item.quantity || 0;
            }
          }
        }
        const totalStock = stockRes.data?.reduce((acc, row) => acc + (row.quantity || 0), 0) || 0;

        stats = {
          total_production_today: prodToday,
          total_dispatch_today: dispToday,
          total_stock: totalStock,
          pending_dispatches: pendingRes.count || 0,
          total_models: modelsRes.count || 0,
        };
      } catch (fbError) {
        console.error('Fallback query error:', fbError);
      }
    }

    // 2. Fetch today's production entries
    let todayProduction = [];
    const { data: prodSummary, error: prodErr } = await supabase
      .from('daily_production_summary')
      .select('*')
      .eq('production_date', todayStr)
      .order('model_code', { ascending: true });

    if (!prodErr && prodSummary) {
      todayProduction = prodSummary;
    } else {
      // Fallback query from production_entries with joined cooler_models
      const { data: rawEntries } = await supabase
        .from('production_entries')
        .select('id, quantity, production_date, remarks, cooler_models(id, name, code)')
        .eq('production_date', todayStr);

      if (rawEntries) {
        // Group by model
        const grouped = {};
        for (const entry of rawEntries) {
          const mId = entry.cooler_models?.id || 'unknown';
          if (!grouped[mId]) {
            grouped[mId] = {
              model_id: mId,
              model_name: entry.cooler_models?.name || 'Unknown Model',
              model_code: entry.cooler_models?.code || 'N/A',
              total_quantity: 0,
              entry_count: 0,
            };
          }
          grouped[mId].total_quantity += entry.quantity || 0;
          grouped[mId].entry_count += 1;
        }
        todayProduction = Object.values(grouped);
      }
    }

    // 3. Fetch recent 5 dispatches
    let recentDispatches = [];
    const { data: dispatchesData, error: dispErr } = await supabase
      .from('dispatches')
      .select(`
        id,
        vehicle_number,
        from_location,
        destination,
        dispatch_date,
        status,
        created_at,
        dispatch_items (
          quantity,
          cooler_models (name, code)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!dispErr && dispatchesData) {
      recentDispatches = dispatchesData.map((d) => {
        const totalItems = (d.dispatch_items || []).reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        );
        return {
          ...d,
          total_quantity: totalItems,
        };
      });
    }

    return NextResponse.json({
      success: true,
      stats,
      todayProduction,
      recentDispatches,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('API /api/dashboard error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
