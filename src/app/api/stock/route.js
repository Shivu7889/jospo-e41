import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getTodayIST } from '@/lib/date';
import { normalizePlant, isOwnerUser, ALL_PLANTS_ID } from '@/lib/plants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stock
 * Returns stock scoped to plant or consolidated multi-plant matrix
 * Query params:
 *   - model_id (optional: filter stock view by specific model)
 *   - plant (optional: 'ALL', 'E41 G2', 'D4', 'C116')
 */
export async function GET(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;
    const { searchParams } = new URL(request.url);
    const modelIdFilter = searchParams.get('model_id');
    const plantParam = searchParams.get('plant');

    const isOwner = isOwnerUser(employee);
    // If user is not owner, lock to employee's assigned plant
    const targetPlant = isOwner
      ? (plantParam ? (plantParam === ALL_PLANTS_ID ? ALL_PLANTS_ID : normalizePlant(plantParam)) : ALL_PLANTS_ID)
      : normalizePlant(employee?.plant);

    const todayStr = getTodayIST();

    // 1. Fetch active cooler models
    let cmQuery = supabase
      .from('cooler_models')
      .select('id, name, code, description, is_active')
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (modelIdFilter) {
      cmQuery = cmQuery.eq('id', modelIdFilter);
    }

    const { data: models, error: modelsErr } = await cmQuery;
    if (modelsErr) throw modelsErr;

    // 2. Fetch stock transactions with plant info
    let txQuery = supabase
      .from('stock_transactions')
      .select('model_id, quantity, plant, notes');

    let { data: transactions, error: txErr } = await txQuery;
    if (txErr && (txErr.message?.includes('plant') || txErr.code === 'PGRST204')) {
      // Fallback if plant column doesn't exist yet
      const fbTx = await supabase.from('stock_transactions').select('model_id, quantity, notes');
      transactions = fbTx.data || [];
    }

    // Map transactions into plant breakdown & total per model
    const stockMapByPlant = {
      'E41 G2': {},
      'D4': {},
      'C116': {},
      total: {},
    };

    (transactions || []).forEach((tx) => {
      const mid = tx.model_id;
      const qty = Number(tx.quantity) || 0;
      let p = normalizePlant(tx.plant);

      // Check notes for fallback plant tag if plant column was missing
      if (!tx.plant && tx.notes) {
        const match = tx.notes.match(/\[Plant:\s*([^\]]+)\]/i);
        if (match && match[1]) {
          p = normalizePlant(match[1]);
        }
      }

      if (!stockMapByPlant[p]) stockMapByPlant[p] = {};
      stockMapByPlant[p][mid] = (stockMapByPlant[p][mid] || 0) + qty;
      stockMapByPlant.total[mid] = (stockMapByPlant.total[mid] || 0) + qty;
    });

    // Format currentStock array based on targetPlant
    const currentStock = (models || []).map((m) => {
      const e41Qty = stockMapByPlant['E41 G2'][m.id] || 0;
      const d4Qty = stockMapByPlant['D4'][m.id] || 0;
      const c116Qty = stockMapByPlant['C116'][m.id] || 0;
      const totalQty = stockMapByPlant.total[m.id] || 0;

      let effectiveStock = totalQty;
      if (targetPlant === 'E41 G2') effectiveStock = e41Qty;
      else if (targetPlant === 'D4') effectiveStock = d4Qty;
      else if (targetPlant === 'C116') effectiveStock = c116Qty;

      return {
        model_id: m.id,
        model_name: m.name,
        model_code: m.code,
        current_stock: effectiveStock,
        plant_breakdown: {
          'E41 G2': e41Qty,
          'D4': d4Qty,
          'C116': c116Qty,
          total: totalQty,
        },
      };
    });

    // 3. Fetch summary statistics scoped to targetPlant
    let totalStock = currentStock.reduce((acc, row) => acc + (row.current_stock || 0), 0);

    // Today's Production
    let prodQuery = supabase
      .from('production_entries')
      .select('quantity, plant, remarks')
      .eq('production_date', todayStr);

    const { data: todayProdData } = await prodQuery;
    let todayProduction = 0;
    (todayProdData || []).forEach((row) => {
      let p = normalizePlant(row.plant);
      if (!row.plant && row.remarks) {
        const match = row.remarks.match(/\[Plant:\s*([^\]]+)\]/i);
        if (match && match[1]) p = normalizePlant(match[1]);
      }
      if (targetPlant === ALL_PLANTS_ID || p === targetPlant) {
        todayProduction += row.quantity || 0;
      }
    });

    // Today's Confirmed Dispatch
    let dispQuery = supabase
      .from('dispatches')
      .select('id, from_location, remarks, dispatch_items(quantity)')
      .eq('dispatch_date', todayStr)
      .eq('status', 'confirmed');

    const { data: todayDispatchData } = await dispQuery;
    let todayDispatch = 0;
    (todayDispatchData || []).forEach((d) => {
      let p = normalizePlant(d.from_location);
      if (!d.from_location && d.remarks) {
        const match = d.remarks.match(/\[Plant:\s*([^\]]+)\]/i);
        if (match && match[1]) p = normalizePlant(match[1]);
      }
      if (targetPlant === ALL_PLANTS_ID || p === targetPlant) {
        (d.dispatch_items || []).forEach((item) => {
          todayDispatch += item.quantity || 0;
        });
      }
    });

    return NextResponse.json(
      {
        success: true,
        target_plant: targetPlant,
        currentStock,
        stats: {
          totalStock: Math.max(0, totalStock),
          todayProduction,
          todayDispatch,
          activeModelsCount: models.length,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /api/stock GET error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
