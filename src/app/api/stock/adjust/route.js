import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { clearStockCache } from '@/app/api/stock/route';
import { normalizePlant, isOwnerUser, DEFAULT_PLANT_ID } from '@/lib/plants';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;

    const isOwner = isOwnerUser(employee);
    const isAdmin = employee.role === 'admin' || isOwner;
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Only Admins can perform stock adjustments' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      model_id,
      plant,
      adjustment_type = 'add', // 'add' | 'deduct'
      quantity,
      reason,
    } = body;

    if (!model_id) {
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'Audit reason is required for stock adjustments' },
        { status: 400 }
      );
    }

    const targetPlant = plant
      ? normalizePlant(plant)
      : (normalizePlant(employee.plant) || DEFAULT_PLANT_ID);
    const netDelta = adjustment_type === 'add' ? qty : -qty;

    // Verify model exists
    const { data: model, error: modelErr } = await supabase
      .from('cooler_models')
      .select('id, name, code')
      .eq('id', model_id)
      .single();

    if (modelErr || !model) {
      return NextResponse.json({ error: 'Cooler model not found' }, { status: 404 });
    }

    // Check plant holding if deducting
    if (adjustment_type === 'deduct') {
      const { data: txs } = await supabase
        .from('stock_transactions')
        .select('quantity, plant, notes')
        .eq('model_id', model_id);

      let currentHolding = 0;
      (txs || []).forEach((t) => {
        let p = normalizePlant(t.plant);
        if (!t.plant && t.notes) {
          const match = t.notes.match(/\[Plant:\s*([^\]]+)\]/i);
          if (match && match[1]) p = normalizePlant(match[1]);
        }
        if (p === targetPlant) {
          currentHolding += Number(t.quantity || 0);
        }
      });

      if (currentHolding + netDelta < 0) {
        return NextResponse.json(
          {
            error: `Cannot deduct ${qty} units. Current stock at ${targetPlant} is only ${currentHolding} units.`,
            current_stock: currentHolding,
          },
          { status: 400 }
        );
      }
    }

    const auditNotes = `[Plant: ${targetPlant}] Emergency Adjustment (${adjustment_type.toUpperCase()}): ${reason.trim()}`;

    const txPayload = {
      model_id,
      transaction_type: 'adjustment',
      quantity: netDelta,
      employee_id: employee.id,
      plant: targetPlant,
      notes: auditNotes,
    };

    let { data: newTx, error: insertError } = await supabase
      .from('stock_transactions')
      .insert(txPayload)
      .select()
      .single();

    if (insertError && (insertError.code === 'PGRST204' || insertError.message?.includes('plant'))) {
      const { plant: _p, ...fallbackPayload } = txPayload;
      const fallback = await supabase
        .from('stock_transactions')
        .insert(fallbackPayload)
        .select()
        .single();
      insertError = fallback.error;
      newTx = fallback.data;
    }

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    // Purge in-memory stock cache
    clearStockCache();

    return NextResponse.json({
      success: true,
      message: `Stock successfully ${adjustment_type === 'add' ? 'added' : 'deducted'} for ${model.code} at ${targetPlant}.`,
      transaction: newTx,
      target_plant: targetPlant,
    });
  } catch (err) {
    console.error('API /api/stock/adjust error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
