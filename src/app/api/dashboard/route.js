import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getTodayIST } from '@/lib/date';
import { getCached, setCached } from '@/lib/serverCache';
import {
  normalizePlant,
  isOwnerUser,
  isModelVisibleInPlantStock,
  ALL_PLANTS_ID,
} from '@/lib/plants';

export const dynamic = 'force-dynamic';

const DASHBOARD_CACHE_TTL = 15 * 1000;

export async function GET(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;

    const { searchParams } = new URL(request.url);
    const plantParam = searchParams.get('plant');
    const forceRefresh = searchParams.get('refresh') === 'true';

    const isOwner = isOwnerUser(employee);
    const isOwnerOrAdmin = isOwner || employee.role === 'admin' || employee.role === 'dispatch';
    const targetPlant = isOwnerOrAdmin
      ? (plantParam ? (plantParam === ALL_PLANTS_ID ? ALL_PLANTS_ID : normalizePlant(plantParam)) : (normalizePlant(employee?.plant) || ALL_PLANTS_ID))
      : normalizePlant(employee?.plant);

    const cacheKey = `dashboard_${targetPlant}`;
    if (!forceRefresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT' },
        });
      }
    }

    const todayStr = getTodayIST();

    // Prepare all 6 queries to execute in ONE parallel batch (cuts dashboard RTT by 75%+)
    const modelsPromise = supabase
      .from('cooler_models')
      .select('id, name, code, description, is_active, manufacturing_plant')
      .eq('is_active', true);

    const txPromise = supabase
      .from('stock_transactions')
      .select('model_id, quantity, plant, notes');

    const prodTodayPromise = supabase
      .from('production_entries')
      .select('quantity, plant, remarks, model_id, cooler_models(name, code)')
      .eq('production_date', todayStr);

    const dispTodayPromise = supabase
      .from('dispatches')
      .select('id, from_location, remarks, dispatch_items(quantity)')
      .eq('dispatch_date', todayStr)
      .eq('status', 'confirmed');

    let pendingQuery = supabase
      .from('dispatches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft');
    if (targetPlant !== ALL_PLANTS_ID) {
      pendingQuery = pendingQuery.eq('from_location', targetPlant);
    }

    let recentQuery = supabase
      .from('dispatches')
      .select(`
        id,
        vehicle_number,
        from_location,
        destination,
        destination_plant,
        transfer_status,
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
    if (targetPlant !== ALL_PLANTS_ID) {
      recentQuery = recentQuery.eq('from_location', targetPlant);
    }

    const [modelsRes, txRes, prodTodayRes, dispTodayRes, pendingRes, recentRes] = await Promise.all([
      modelsPromise,
      txPromise,
      prodTodayPromise,
      dispTodayPromise,
      pendingQuery,
      recentQuery,
    ]);

    // Graceful fallbacks if optional columns (manufacturing_plant / plant / destination_plant) don't exist yet
    let rawModels = modelsRes.data;
    if (modelsRes.error && (modelsRes.error.code === 'PGRST204' || modelsRes.error.message?.includes('manufacturing_plant'))) {
      const fb = await supabase
        .from('cooler_models')
        .select('id, name, code, description, is_active')
        .eq('is_active', true);
      rawModels = fb.data || [];
    }

    let transactions = txRes.data;
    if (txRes.error && (txRes.error.message?.includes('plant') || txRes.error.code === 'PGRST204')) {
      const fb = await supabase.from('stock_transactions').select('model_id, quantity, notes');
      transactions = fb.data || [];
    }

    let prodEntries = prodTodayRes.data;
    if (prodTodayRes.error && (prodTodayRes.error.message?.includes('plant') || prodTodayRes.error.code === 'PGRST204')) {
      const fb = await supabase
        .from('production_entries')
        .select('quantity, remarks, model_id, cooler_models(name, code)')
        .eq('production_date', todayStr);
      prodEntries = fb.data || [];
    }

    let recentData = recentRes.data;
    if (recentRes.error && (recentRes.error.message?.includes('destination_plant') || recentRes.error.message?.includes('transfer_status'))) {
      let fbRecent = supabase
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
      if (targetPlant !== ALL_PLANTS_ID) {
        fbRecent = fbRecent.eq('from_location', targetPlant);
      }
      const fb = await fbRecent;
      recentData = fb.data || [];
    }

    // 1. Calculate Stock & Plant Breakdown
    const stockMapByPlant = { 'E41 G2': {}, 'D4': {}, 'C116': {}, total: {} };
    (transactions || []).forEach((tx) => {
      const mid = tx.model_id;
      const qty = Number(tx.quantity) || 0;
      let p = normalizePlant(tx.plant);
      if (!tx.plant && tx.notes) {
        const match = tx.notes.match(/\[Plant:\s*([^\]]+)\]/i);
        if (match && match[1]) p = normalizePlant(match[1]);
      }
      if (!stockMapByPlant[p]) stockMapByPlant[p] = {};
      stockMapByPlant[p][mid] = (stockMapByPlant[p][mid] || 0) + qty;
      stockMapByPlant.total[mid] = (stockMapByPlant.total[mid] || 0) + qty;
    });

    const visibleModels = (rawModels || []).filter((m) => {
      const plantQty = stockMapByPlant[targetPlant]?.[m.id] || 0;
      return isModelVisibleInPlantStock(m, targetPlant, plantQty);
    });

    let totalStock = 0;
    const plantBreakdown = targetPlant === ALL_PLANTS_ID ? { 'E41 G2': 0, 'D4': 0, 'C116': 0 } : null;

    visibleModels.forEach((m) => {
      const e41Qty = stockMapByPlant['E41 G2'][m.id] || 0;
      const d4Qty = stockMapByPlant['D4'][m.id] || 0;
      const c116Qty = stockMapByPlant['C116'][m.id] || 0;
      const totalQty = stockMapByPlant.total[m.id] || 0;

      if (targetPlant === 'E41 G2') totalStock += e41Qty;
      else if (targetPlant === 'D4') totalStock += d4Qty;
      else if (targetPlant === 'C116') totalStock += c116Qty;
      else totalStock += totalQty;

      if (plantBreakdown) {
        plantBreakdown['E41 G2'] += e41Qty;
        plantBreakdown['D4'] += d4Qty;
        plantBreakdown['C116'] += c116Qty;
      }
    });

    // 2. Calculate Today's Production & Grouped Table
    let totalProductionToday = 0;
    const prodGrouped = {};
    (prodEntries || []).forEach((row) => {
      let p = normalizePlant(row.plant);
      if (!row.plant && row.remarks) {
        const match = row.remarks.match(/\[Plant:\s*([^\]]+)\]/i);
        if (match && match[1]) p = normalizePlant(match[1]);
      }
      if (targetPlant === ALL_PLANTS_ID || p === targetPlant) {
        const qty = Number(row.quantity) || 0;
        totalProductionToday += qty;
        const code = row.cooler_models?.code || 'Unknown';
        if (!prodGrouped[code]) {
          prodGrouped[code] = {
            model_name: row.cooler_models?.name || code,
            model_code: code,
            total_quantity: 0,
            entry_count: 0,
          };
        }
        prodGrouped[code].total_quantity += qty;
        prodGrouped[code].entry_count += 1;
      }
    });

    // 3. Calculate Today's Dispatch
    let totalDispatchToday = 0;
    (dispTodayRes.data || []).forEach((d) => {
      let p = normalizePlant(d.from_location);
      if (!d.from_location && d.remarks) {
        const match = d.remarks.match(/\[Plant:\s*([^\]]+)\]/i);
        if (match && match[1]) p = normalizePlant(match[1]);
      }
      if (targetPlant === ALL_PLANTS_ID || p === targetPlant) {
        (d.dispatch_items || []).forEach((item) => {
          totalDispatchToday += item.quantity || 0;
        });
      }
    });

    // 4. Format Recent Dispatches
    const recentDispatches = (recentData || []).map((d) => ({
      ...d,
      total_quantity: (d.dispatch_items || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
    }));

    const payload = {
      success: true,
      target_plant: targetPlant,
      stats: {
        total_production_today: totalProductionToday,
        total_dispatch_today: totalDispatchToday,
        total_stock: Math.max(0, totalStock),
        pending_dispatches: pendingRes.count || 0,
        total_models: visibleModels.length,
      },
      plantBreakdown,
      todayProduction: Object.values(prodGrouped).sort((a, b) => (b.total_quantity || 0) - (a.total_quantity || 0)),
      recentDispatches,
      timestamp: new Date().toISOString(),
    };

    setCached(cacheKey, payload, DASHBOARD_CACHE_TTL);

    return NextResponse.json(payload);
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
