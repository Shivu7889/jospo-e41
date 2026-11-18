import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getTodayIST } from '@/lib/date';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stock
 * Returns current stock from current_stock view and summary statistics
 * Query params:
 *   - model_id (optional: filter stock view by specific model)
 */
export async function GET(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const modelIdFilter = searchParams.get('model_id');

    const todayStr = getTodayIST();

    // 1. Fetch current stock from current_stock view
    let stockQuery = supabase
      .from('current_stock')
      .select('model_id, model_name, model_code, current_stock')
      .order('model_code', { ascending: true });

    if (modelIdFilter) {
      stockQuery = stockQuery.eq('model_id', modelIdFilter);
    }

    const { data: stockData, error: stockError } = await stockQuery;

    let currentStock = [];
    if (!stockError && stockData) {
      currentStock = stockData.map((row) => ({
        ...row,
        current_stock: Number(row.current_stock ?? 0),
      }));
    } else {
      // Fallback: Query cooler_models and compute sum of stock_transactions
      try {
        let cmQuery = supabase
          .from('cooler_models')
          .select('id, name, code, is_active')
          .eq('is_active', true)
          .order('code', { ascending: true });

        if (modelIdFilter) {
          cmQuery = cmQuery.eq('id', modelIdFilter);
        }

        const { data: models } = await cmQuery;

        const { data: transactions } = await supabase
          .from('stock_transactions')
          .select('model_id, quantity');

        const txMap = {};
        (transactions || []).forEach((tx) => {
          txMap[tx.model_id] = (txMap[tx.model_id] || 0) + (tx.quantity || 0);
        });

        currentStock = (models || []).map((m) => ({
          model_id: m.id,
          model_name: m.name,
          model_code: m.code,
          current_stock: txMap[m.id] || 0,
        }));
      } catch (fbErr) {
        console.error('Stock fallback query error:', fbErr);
      }
    }

    // 2. Fetch summary statistics
    let totalStock = 0;
    let todayProduction = 0;
    let todayDispatch = 0;
    let activeModelsCount = 0;

    // Total Stock (Sum of all active models)
    if (currentStock && !modelIdFilter) {
      totalStock = currentStock.reduce((acc, row) => acc + (row.current_stock || 0), 0);
    } else {
      const { data: allStockTx } = await supabase
        .from('stock_transactions')
        .select('quantity');
      totalStock = (allStockTx || []).reduce((acc, row) => acc + (row.quantity || 0), 0);
    }

    // Today's Production
    const { data: todayProdData } = await supabase
      .from('production_entries')
      .select('quantity')
      .eq('production_date', todayStr);

    todayProduction = (todayProdData || []).reduce(
      (sum, row) => sum + (row.quantity || 0),
      0
    );

    // Today's Confirmed Dispatch
    const { data: todayDispatchData } = await supabase
      .from('dispatches')
      .select('id, dispatch_items(quantity)')
      .eq('dispatch_date', todayStr)
      .eq('status', 'confirmed');

    if (todayDispatchData) {
      for (const d of todayDispatchData) {
        for (const item of d.dispatch_items || []) {
          todayDispatch += item.quantity || 0;
        }
      }
    }

    // Number of active models
    const { count: modelsCount } = await supabase
      .from('cooler_models')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    activeModelsCount = modelsCount ?? currentStock.length;

    return NextResponse.json({
      success: true,
      stats: {
        totalStock: Math.max(0, totalStock),
        todayProduction,
        todayDispatch,
        activeModelsCount,
      },
      currentStock,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('API /api/stock GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch stock overview' },
      { status: 500 }
    );
  }
}
