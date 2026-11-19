import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { formatDispatchRemarks } from '@/lib/dispatch';

export const dynamic = 'force-dynamic';

// GET: Get single dispatch by id with line items and employee info
export async function GET(request, { params }) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { id } = params;

    const { data, error } = await supabase
      .from('dispatches')
      .select(`
        *,
        dispatch_items(
          id,
          quantity,
          model_id,
          cooler_models(
            id,
            name,
            code,
            qr_data
          )
        ),
        employees!dispatches_employee_id_fkey(
          id,
          name,
          email,
          role
        ),
        cancelled_by_employee:employees!dispatches_cancelled_by_fkey(
          id,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    console.error('API /dispatch/[id] GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Update draft dispatch (header info or items)
export async function PUT(request, { params }) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { id } = params;
    const body = await request.json();

    // Verify existing dispatch status and metadata
    let { data: existing, error: checkError } = await supabase
      .from('dispatches')
      .select('status, remarks, dispatch_type')
      .eq('id', id)
      .single();

    if (checkError && (checkError.message?.includes('dispatch_type') || checkError.code === 'PGRST204')) {
      const fallbackCheck = await supabase
        .from('dispatches')
        .select('status, remarks')
        .eq('id', id)
        .single();
      existing = fallbackCheck.data;
      checkError = fallbackCheck.error;
    }

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Dispatch record not found' }, { status: 404 });
    }

    const isAdmin = auth.employee.role === 'admin' || auth.employee.role === 'owner';

    if (existing.status !== 'draft' && !isAdmin) {
      return NextResponse.json(
        { error: `Cannot edit dispatch with status "${existing.status}". Only Admins can modify non-draft dispatches.` },
        { status: 403 }
      );
    }

    const {
      vehicle_number,
      from_location,
      destination,
      destination_plant,
      dispatch_date,
      remarks,
      dispatch_type,
      transfer_status,
      items,
    } = body;

    const updateFields = {};
    if (vehicle_number !== undefined) updateFields.vehicle_number = vehicle_number.trim().toUpperCase();
    if (from_location !== undefined) updateFields.from_location = from_location.trim();
    if (destination !== undefined) updateFields.destination = destination.trim();
    if (destination_plant !== undefined) updateFields.destination_plant = destination_plant ? destination_plant.trim() : null;
    if (transfer_status !== undefined) updateFields.transfer_status = transfer_status;
    if (dispatch_date !== undefined) updateFields.dispatch_date = dispatch_date;
    if (dispatch_type !== undefined) updateFields.dispatch_type = dispatch_type === 'local' ? 'local' : 'party';

    if (remarks !== undefined || dispatch_type !== undefined || destination_plant !== undefined) {
      const effectiveType = dispatch_type || existing.dispatch_type || (existing.remarks?.includes('[Type: Local]') ? 'local' : 'party');
      let compRemarks = formatDispatchRemarks(remarks !== undefined ? remarks : existing.remarks, effectiveType);
      const destPlant = destination_plant !== undefined ? destination_plant : (existing.destination_plant || null);
      if (destPlant) {
        compRemarks = `[DestPlant: ${destPlant}] ${compRemarks}`.trim();
      }
      updateFields.remarks = compRemarks;
    }
    updateFields.updated_at = new Date().toISOString();

    // Update dispatch header
    let { data: updatedDispatch, error: updateError } = await supabase
      .from('dispatches')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    // Fallback if destination_plant, transfer_status, or dispatch_type column does not exist yet in database
    if (updateError && (updateError.message?.includes('destination_plant') || updateError.message?.includes('transfer_status') || updateError.message?.includes('dispatch_type') || updateError.code === 'PGRST204')) {
      delete updateFields.destination_plant;
      delete updateFields.transfer_status;
      if (updateError.message?.includes('dispatch_type')) {
        delete updateFields.dispatch_type;
      }
      const retryResult = await supabase
        .from('dispatches')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();
      updatedDispatch = retryResult.data;
      updateError = retryResult.error;
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // If items are provided, validate and safely replace line items
    if (Array.isArray(items)) {
      // Validate line items before deleting anything
      for (const it of items) {
        const qty = Number(it.quantity);
        if (!it.model_id) {
          return NextResponse.json({ error: 'Each item must have a valid model_id' }, { status: 400 });
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          return NextResponse.json({ error: 'Item quantity must be a positive integer' }, { status: 400 });
        }
      }

      // Fetch existing items as backup in case replacement fails
      const { data: previousItems } = await supabase
        .from('dispatch_items')
        .select('model_id, quantity')
        .eq('dispatch_id', id);

      // Delete existing line items
      const { error: delError } = await supabase
        .from('dispatch_items')
        .delete()
        .eq('dispatch_id', id);

      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 400 });
      }

      if (items.length > 0) {
        const lineItems = items.map((it) => ({
          dispatch_id: id,
          model_id: it.model_id,
          quantity: Number(it.quantity),
        }));

        const { error: insertItemsError } = await supabase
          .from('dispatch_items')
          .insert(lineItems);

        if (insertItemsError) {
          // Rollback: restore previous items
          if (previousItems && previousItems.length > 0) {
            const rollbackItems = previousItems.map((p) => ({ ...p, dispatch_id: id }));
            await supabase.from('dispatch_items').insert(rollbackItems);
          }
          return NextResponse.json({ error: insertItemsError.message }, { status: 400 });
        }

        // If this dispatch was already confirmed, update stock ledger transactions
        if (existing.status === 'confirmed') {
          await supabase
            .from('stock_transactions')
            .delete()
            .eq('reference_id', id)
            .eq('transaction_type', 'dispatch');

          const stockTxs = items.map((it) => ({
            model_id: it.model_id,
            transaction_type: 'dispatch',
            quantity: -Number(it.quantity),
            reference_id: id,
            employee_id: auth.employee.id,
            notes: 'Dispatch updated by Admin',
          }));
          await supabase.from('stock_transactions').insert(stockTxs);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: updatedDispatch,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /dispatch/[id] PUT error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete dispatch (admin can delete any dispatch and restore stock; dispatch staff can only delete drafts)
export async function DELETE(request, { params }) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { id } = params;

    // Verify existing dispatch status
    const { data: existing, error: checkError } = await supabase
      .from('dispatches')
      .select('status, vehicle_number')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Dispatch record not found' }, { status: 404 });
    }

    const isAdmin = auth.employee.role === 'admin' || auth.employee.role === 'owner';

    if (existing.status !== 'draft' && !isAdmin) {
      return NextResponse.json(
        { error: `Cannot delete dispatch with status "${existing.status}". Only Admins can delete non-draft dispatches.` },
        { status: 403 }
      );
    }

    // If dispatch had stock transactions (confirmed or cancelled), remove them to restore stock
    if (existing.status !== 'draft') {
      const { error: stockDelErr } = await supabase
        .from('stock_transactions')
        .delete()
        .eq('reference_id', id);

      if (stockDelErr) {
        console.warn('Warning deleting stock transactions for dispatch:', stockDelErr);
      }
    }

    // Delete line items first
    await supabase.from('dispatch_items').delete().eq('dispatch_id', id);

    // Delete dispatch
    const { error: deleteError } = await supabase
      .from('dispatches')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        message:
          existing.status === 'confirmed'
            ? `Dispatch ${existing.vehicle_number} deleted and deducted stock restored to inventory.`
            : `Dispatch ${existing.vehicle_number} deleted successfully.`,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /dispatch/[id] DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
