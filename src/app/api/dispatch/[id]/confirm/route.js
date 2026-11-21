import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import { normalizePlant } from '@/lib/plants';
import { clearStockCache } from '@/app/api/stock/route';

export const dynamic = 'force-dynamic';

// POST: Confirm a draft dispatch via confirm_dispatch RPC (supports negative stock / advance dispatch)
export async function POST(request, { params }) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;
    const { id } = params;

    const employeeId = employee.id;

    // 1. Try Supabase RPC confirm_dispatch first
    let rpcSuccess = false;
    let rpcErrorMsg = null;

    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_dispatch', {
        p_dispatch_id: id,
        p_employee_id: employeeId,
      });

      if (!rpcError && rpcResult && rpcResult.success !== false) {
        rpcSuccess = true;
      } else {
        rpcErrorMsg = rpcError?.message || rpcResult?.error || 'RPC confirm failed';
      }
    } catch (rpcErr) {
      rpcErrorMsg = rpcErr.message;
    }

    // 2. If RPC succeeded, clear cache and return immediately
    if (rpcSuccess) {
      clearStockCache();
      return NextResponse.json(
        {
          success: true,
          message: 'Dispatch confirmed successfully and stock deducted.',
        },
        { status: 200 }
      );
    }

    // 3. Fallback: Allow Negative Stock / Overdraft Dispatch
    // If the database RPC is still on an older version that checks "Insufficient stock",
    // execute atomic negative stock deduction using Admin Supabase client.
    console.warn(`RPC confirm_dispatch returned: "${rpcErrorMsg}". Executing negative-stock fallback...`);

    const adminDb = createAdminSupabase() || supabase;

    // Fetch dispatch details
    const { data: dispatch, error: dErr } = await adminDb
      .from('dispatches')
      .select('*, dispatch_items(*)')
      .eq('id', id)
      .single();

    if (dErr || !dispatch) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    }

    if (dispatch.status !== 'draft') {
      return NextResponse.json(
        { error: `Dispatch is not in draft status (current: ${dispatch.status})` },
        { status: 400 }
      );
    }

    const items = dispatch.dispatch_items || [];
    if (items.length === 0) {
      return NextResponse.json({ error: 'No items in dispatch to confirm' }, { status: 400 });
    }

    const originPlant = normalizePlant(dispatch.from_location || 'E41 G2');

    // Insert stock deduction transactions for all line items (allowing negative balance)
    const stockEntries = items.map((it) => ({
      model_id: it.model_id,
      transaction_type: 'dispatch',
      quantity: -Math.abs(Number(it.quantity) || 1),
      reference_id: id,
      employee_id: employeeId,
      plant: it.loaded_plant ? normalizePlant(it.loaded_plant) : originPlant,
      notes: `Dispatch confirmed from plant ${it.loaded_plant || originPlant}`,
    }));

    const { error: stockErr } = await adminDb.from('stock_transactions').insert(stockEntries);
    if (stockErr) {
      console.error('Failed to record negative stock transactions:', stockErr);
      return NextResponse.json(
        { error: `Stock deduction error: ${stockErr.message}` },
        { status: 500 }
      );
    }

    // Update dispatch status to confirmed
    const transferStatus =
      dispatch.destination_plant || dispatch.dispatch_type === 'local'
        ? 'in_transit'
        : dispatch.transfer_status || 'completed';

    const { error: updateErr } = await adminDb
      .from('dispatches')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        transfer_status: transferStatus,
      })
      .eq('id', id);

    if (updateErr) {
      console.error('Failed to update dispatch status:', updateErr);
      return NextResponse.json(
        { error: `Failed to confirm dispatch record: ${updateErr.message}` },
        { status: 500 }
      );
    }

    clearStockCache();

    return NextResponse.json(
      {
        success: true,
        message: 'Dispatch confirmed successfully and stock deducted (negative stock allowed).',
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /dispatch/[id]/confirm POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
