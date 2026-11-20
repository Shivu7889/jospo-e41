import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import {
  formatDispatchRemarks,
  resolveDispatchType,
  isCoLoadingDispatch,
  resolveCoLoadingStatus,
  resolveNextLoadingPlant,
  resolveSecondPlant,
  resolveItemLoadedPlant,
} from '@/lib/dispatch';
import { normalizePlant } from '@/lib/plants';

export const dynamic = 'force-dynamic';

// GET: Get single dispatch by id with line items and employee info
export async function GET(request, { params }) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { id } = params;

    let { data, error } = await supabase
      .from('dispatches')
      .select(`
        *,
        dispatch_items(
          id,
          quantity,
          model_id,
          loaded_plant,
          loaded_by,
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

    if (error && (error.code === 'PGRST204' || error.message?.includes('loaded_plant'))) {
      const fallbackQuery = await supabase
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
      data = fallbackQuery.data;
      error = fallbackQuery.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    console.error('API /dispatch/[id] GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Update dispatch (header info, co-loading route, or line items with stock sync)
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
      .select('id, status, remarks, dispatch_type, from_location, destination, destination_plant, transfer_status, is_coloading, coloading_status, next_loading_plant, second_plant, third_plant, vehicle_number')
      .eq('id', id)
      .single();

    if (checkError && checkError.code === 'PGRST204') {
      const fallbackCheck = await supabase
        .from('dispatches')
        .select('id, status, remarks, from_location, destination, vehicle_number')
        .eq('id', id)
        .single();
      existing = fallbackCheck.data;
      checkError = fallbackCheck.error;
    }

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Dispatch record not found' }, { status: 404 });
    }

    const isOwnerOrAdmin = auth.employee.role === 'admin' || auth.employee.role === 'owner';
    const isDispatchStaff = auth.employee.role === 'dispatch';

    if (!isOwnerOrAdmin && !isDispatchStaff) {
      return NextResponse.json(
        { error: 'You do not have permission to modify dispatches.' },
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
      is_coloading,
      coloading_status,
      next_loading_plant,
      second_plant,
      third_plant,
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

    // Co-loading fields
    const effectiveIsCoLoading = is_coloading !== undefined ? Boolean(is_coloading) : isCoLoadingDispatch(existing);
    const effectiveCoLoadingStatus = coloading_status !== undefined
      ? coloading_status
      : (effectiveIsCoLoading ? resolveCoLoadingStatus(existing) : null);

    let effectiveNextLoadingPlant = null;
    if (effectiveIsCoLoading && effectiveCoLoadingStatus === 'part_loaded') {
      effectiveNextLoadingPlant = next_loading_plant !== undefined
        ? (next_loading_plant ? normalizePlant(next_loading_plant) : null)
        : resolveNextLoadingPlant(existing);
    }

    if (is_coloading !== undefined || coloading_status !== undefined || next_loading_plant !== undefined) {
      updateFields.is_coloading = effectiveIsCoLoading;
      updateFields.coloading_status = effectiveCoLoadingStatus;
      updateFields.next_loading_plant = effectiveNextLoadingPlant;
    }
    if (second_plant !== undefined) updateFields.second_plant = second_plant ? normalizePlant(second_plant) : null;
    if (third_plant !== undefined) updateFields.third_plant = third_plant ? normalizePlant(third_plant) : null;

    const effectiveType = dispatch_type || existing.dispatch_type || resolveDispatchType(existing);
    const effectiveFromPlant = normalizePlant(updateFields.from_location || existing.from_location || 'E41 G2');
    const effectiveDest = updateFields.destination || existing.destination || '';
    const effectiveDestPlant = updateFields.destination_plant !== undefined
      ? (updateFields.destination_plant ? normalizePlant(updateFields.destination_plant) : null)
      : (existing.destination_plant ? normalizePlant(existing.destination_plant) : null);

    if (effectiveType === 'local') {
      const targetPlant = effectiveDestPlant || normalizePlant(effectiveDest);
      if (effectiveFromPlant === targetPlant) {
        return NextResponse.json(
          { error: `Invalid dispatch: Origin plant (${effectiveFromPlant}) and destination plant (${targetPlant}) cannot be the same.` },
          { status: 400 }
        );
      }
    }

    if (
      remarks !== undefined ||
      dispatch_type !== undefined ||
      destination_plant !== undefined ||
      is_coloading !== undefined ||
      coloading_status !== undefined ||
      next_loading_plant !== undefined
    ) {
      let compRemarks = formatDispatchRemarks(
        remarks !== undefined ? remarks : existing.remarks,
        effectiveType,
        {
          isCoLoading: effectiveIsCoLoading,
          status: effectiveCoLoadingStatus,
          nextLoadingPlant: effectiveNextLoadingPlant,
          secondPlant: updateFields.second_plant !== undefined ? updateFields.second_plant : existing.second_plant,
          thirdPlant: updateFields.third_plant !== undefined ? updateFields.third_plant : existing.third_plant,
        }
      );
      const destPlant = destination_plant !== undefined ? destination_plant : (existing.destination_plant || null);
      if (destPlant && effectiveType === 'local') {
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

    // Fallback if destination_plant, transfer_status, is_coloading, or dispatch_type column does not exist
    if (
      updateError &&
      (updateError.message?.includes('destination_plant') ||
        updateError.message?.includes('transfer_status') ||
        updateError.message?.includes('dispatch_type') ||
        updateError.message?.includes('is_coloading') ||
        updateError.message?.includes('coloading_status') ||
        updateError.message?.includes('next_loading_plant') ||
        updateError.message?.includes('second_plant') ||
        updateError.message?.includes('third_plant') ||
        updateError.code === 'PGRST204')
    ) {
      delete updateFields.destination_plant;
      delete updateFields.transfer_status;
      delete updateFields.is_coloading;
      delete updateFields.coloading_status;
      delete updateFields.next_loading_plant;
      delete updateFields.second_plant;
      delete updateFields.third_plant;
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

    // If items are provided, validate and update line items with stock synchronization
    if (Array.isArray(items)) {
      for (const it of items) {
        const qty = Number(it.quantity);
        if (!it.model_id) {
          return NextResponse.json({ error: 'Each item must have a valid model_id' }, { status: 400 });
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          return NextResponse.json({ error: 'Item quantity must be a positive integer' }, { status: 400 });
        }
      }

      // Fetch existing items with details
      const { data: previousItems } = await supabase
        .from('dispatch_items')
        .select('id, model_id, quantity, loaded_plant, loaded_by')
        .eq('dispatch_id', id);

      const originPlant = normalizePlant(updateFields.from_location || existing.from_location || 'E41 G2');

      const lineItems = items.map((it) => {
        const itemPlant = normalizePlant(it.loaded_plant || originPlant);
        return {
          dispatch_id: id,
          model_id: it.model_id,
          quantity: Number(it.quantity),
          loaded_plant: itemPlant,
          loaded_by: it.loaded_by || auth.employee.id,
        };
      });

      // If this dispatch is confirmed, verify warehouse stock availability for any increases
      if (existing.status === 'confirmed') {
        const oldTotals = {};
        (previousItems || []).forEach((p) => {
          const plant = normalizePlant(p.loaded_plant || resolveItemLoadedPlant(p, existing) || originPlant);
          const key = `${p.model_id}__${plant}`;
          oldTotals[key] = (oldTotals[key] || 0) + Number(p.quantity);
        });

        const newTotals = {};
        lineItems.forEach((n) => {
          const key = `${n.model_id}__${n.loaded_plant}`;
          newTotals[key] = (newTotals[key] || 0) + Number(n.quantity);
        });

        for (const [key, newQty] of Object.entries(newTotals)) {
          const oldQty = oldTotals[key] || 0;
          const delta = newQty - oldQty;
          if (delta > 0) {
            const [modelId, plant] = key.split('__');
            const { data: plantSt } = await supabase
              .from('stock_transactions')
              .select('quantity, plant')
              .eq('model_id', modelId);

            let currentWarehouseStock = 0;
            if (plantSt) {
              currentWarehouseStock = plantSt
                .filter((st) => normalizePlant(st.plant || 'E41 G2') === plant)
                .reduce((sum, st) => sum + Number(st.quantity || 0), 0);
            }

            if (currentWarehouseStock < delta) {
              const { data: mData } = await supabase
                .from('cooler_models')
                .select('name, code')
                .eq('id', modelId)
                .single();
              const modelDesc = mData ? `${mData.name} (${mData.code})` : modelId;
              return NextResponse.json(
                {
                  error: `Insufficient stock at plant ${plant} for ${modelDesc}. Available in warehouse: ${currentWarehouseStock}, additional required: ${delta}.`,
                },
                { status: 400 }
              );
            }
          }
        }
      }

      // Safely replace line items
      const { error: delError } = await supabase
        .from('dispatch_items')
        .delete()
        .eq('dispatch_id', id);

      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 400 });
      }

      if (lineItems.length > 0) {
        let { error: insertItemsError } = await supabase
          .from('dispatch_items')
          .insert(lineItems);

        if (insertItemsError && insertItemsError.message?.includes('loaded_plant')) {
          const fallbackItems = lineItems.map(({ loaded_plant, loaded_by, ...rest }) => rest);
          const fbResult = await supabase.from('dispatch_items').insert(fallbackItems);
          insertItemsError = fbResult.error;
        }

        if (insertItemsError) {
          // Rollback: restore previous items
          if (previousItems && previousItems.length > 0) {
            await supabase.from('dispatch_items').insert(previousItems);
          }
          return NextResponse.json({ error: insertItemsError.message }, { status: 400 });
        }
      }

      // If dispatch is confirmed, synchronize stock transactions with exact plant attribution
      if (existing.status === 'confirmed') {
        await supabase
          .from('stock_transactions')
          .delete()
          .eq('reference_id', id)
          .eq('transaction_type', 'dispatch');

        if (lineItems.length > 0) {
          const vNum = updateFields.vehicle_number || existing.vehicle_number || '';
          const stockTxs = lineItems.map((it) => ({
            model_id: it.model_id,
            transaction_type: 'dispatch',
            quantity: -Number(it.quantity),
            reference_id: id,
            employee_id: auth.employee.id,
            plant: it.loaded_plant,
            notes: `[Dispatch Updated] Loaded at ${it.loaded_plant} (Vehicle: ${vNum})`,
          }));

          let { error: stockInsertError } = await supabase
            .from('stock_transactions')
            .insert(stockTxs);

          if (stockInsertError && stockInsertError.message?.includes('plant')) {
            const fallbackTxs = stockTxs.map(({ plant, ...rest }) => ({
              ...rest,
              notes: `[Dispatch Updated] [Plant: ${plant}] (Vehicle: ${vNum})`,
            }));
            await supabase.from('stock_transactions').insert(fallbackTxs);
          }
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
