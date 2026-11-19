import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { resolveDispatchType, cleanDispatchRemarks } from '@/lib/dispatch';
import {
  normalizePlant,
  isOwnerUser,
  resolveDestinationPlant,
  resolveTransferStatus,
  formatPlantRemarks,
} from '@/lib/plants';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dispatch/[id]/accept-transfer
 * Accepts an inbound inter-plant transfer and automatically increments the destination plant's stock.
 */
export async function POST(request, { params }) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;
    const { id } = params;

    const body = await request.json().catch(() => ({}));
    const { notes = '' } = body;

    // 1. Fetch the dispatch with its line items
    const { data: dispatch, error: fetchErr } = await supabase
      .from('dispatches')
      .select(`
        *,
        dispatch_items(
          id,
          model_id,
          quantity,
          cooler_models(id, name, code)
        )
      `)
      .eq('id', id)
      .single();

    if (fetchErr || !dispatch) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    }

    // 2. Validate dispatch is a confirmed local transfer
    const dType = resolveDispatchType(dispatch);
    if (dType !== 'local') {
      return NextResponse.json(
        { error: 'Only local inter-plant transfers can be accepted into plant stock' },
        { status: 400 }
      );
    }

    if (dispatch.status !== 'confirmed') {
      return NextResponse.json(
        { error: `Cannot accept transfer: dispatch is in "${dispatch.status}" status.` },
        { status: 400 }
      );
    }

    const currentStatus = resolveTransferStatus(dispatch);
    if (currentStatus === 'received') {
      return NextResponse.json(
        { error: 'This shipment has already been received and stock added.' },
        { status: 400 }
      );
    }

    // 3. Determine destination plant and check employee permission
    const destPlant = resolveDestinationPlant(dispatch) || normalizePlant(employee.plant);
    const isOwner = isOwnerUser(employee);

    if (!isOwner) {
      const empPlant = normalizePlant(employee.plant);
      if (empPlant !== destPlant) {
        return NextResponse.json(
          {
            error: `Unauthorized: This transfer is destined for ${destPlant} Plant. Your assigned plant is ${empPlant} Plant.`,
          },
          { status: 403 }
        );
      }
    }

    const items = dispatch.dispatch_items || [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Dispatch has no cooler line items to receive' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const originPlant = normalizePlant(dispatch.from_location);

    // 4. Update dispatch transfer status to 'received'
    const updatedRemarks = formatPlantRemarks(dispatch.remarks, {
      plant: originPlant,
      destinationPlant: destPlant,
      transferStatus: 'received',
    });

    let updatePayload = {
      transfer_status: 'received',
      received_at: nowIso,
      received_by: employee.id,
      receipt_notes: notes ? notes.trim() : null,
      remarks: updatedRemarks,
      updated_at: nowIso,
    };

    let { error: updateErr } = await supabase
      .from('dispatches')
      .update(updatePayload)
      .eq('id', id);

    if (updateErr) {
      console.warn('Direct transfer_status update failed, retrying with fallback fields:', updateErr.message);
      // Fallback: If migration not run yet, update remarks with metadata tags
      const { error: fallbackErr } = await supabase
        .from('dispatches')
        .update({
          remarks: updatedRemarks,
          updated_at: nowIso,
        })
        .eq('id', id);

      if (fallbackErr) {
        throw fallbackErr;
      }
    }

    // 5. Insert stock transactions for the destination plant (+quantity)
    const stockEntries = items.map((item) => ({
      model_id: item.model_id,
      quantity: Math.abs(Number(item.quantity) || 0),
      reference_id: dispatch.id,
      employee_id: employee.id,
      plant: destPlant,
      transaction_type: 'transfer_in',
      notes: `[Transfer-In] Received at ${destPlant} from ${originPlant} (Vehicle: ${dispatch.vehicle_number})${
        notes ? ` - ${notes.trim()}` : ''
      }`,
    }));

    let { error: stockErr } = await supabase.from('stock_transactions').insert(stockEntries);

    if (stockErr) {
      console.warn('Insert with transfer_in / plant column failed, retrying with fallback:', stockErr.message);
      // Fallback: Use 'adjustment' type and include plant tag in notes if constraint or column not present yet
      const fallbackEntries = items.map((item) => ({
        model_id: item.model_id,
        quantity: Math.abs(Number(item.quantity) || 0),
        reference_id: dispatch.id,
        employee_id: employee.id,
        transaction_type: 'adjustment',
        notes: `[Transfer-In] [Plant: ${destPlant}] Received from ${originPlant} (Vehicle: ${dispatch.vehicle_number})${
          notes ? ` - ${notes.trim()}` : ''
        }`,
      }));

      const { error: fbStockErr } = await supabase.from('stock_transactions').insert(fallbackEntries);
      if (fbStockErr) {
        throw fbStockErr;
      }
    }

    const totalQty = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);

    return NextResponse.json(
      {
        success: true,
        message: `Transfer verified! Successfully received ${totalQty} coolers into ${destPlant} Plant stock.`,
        destination_plant: destPlant,
        total_quantity: totalQty,
        received_at: nowIso,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /dispatch/[id]/accept-transfer error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error accepting transfer' },
      { status: 500 }
    );
  }
}
