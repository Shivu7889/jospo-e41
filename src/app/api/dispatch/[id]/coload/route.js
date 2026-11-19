import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import {
  isCoLoadingDispatch,
  resolveCoLoadingStatus,
  resolveNextLoadingPlant,
  formatDispatchRemarks,
  resolveDispatchType,
} from '@/lib/dispatch';
import { normalizePlant, isOwnerUser } from '@/lib/plants';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dispatch/[id]/coload
 * Handles secondary plant loading for a multi-plant co-loading vehicle.
 * Deducts stock from the second plant and marks the dispatch as fully loaded.
 */
export async function POST(request, { params }) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;
    const { id } = params;

    const body = await request.json().catch(() => ({}));
    const { items = [], notes = '' } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Please specify at least one cooler model and quantity to load from this plant.' },
        { status: 400 }
      );
    }

    // 1. Fetch dispatch with existing items
    const { data: dispatch, error: fetchErr } = await supabase
      .from('dispatches')
      .select(`
        *,
        dispatch_items(
          id,
          model_id,
          quantity,
          loaded_plant,
          cooler_models(id, name, code)
        )
      `)
      .eq('id', id)
      .single();

    if (fetchErr || !dispatch) {
      return NextResponse.json({ error: 'Dispatch not found.' }, { status: 404 });
    }

    if (dispatch.status !== 'confirmed') {
      return NextResponse.json(
        { error: `Cannot load items: Dispatch is currently in "${dispatch.status}" status.` },
        { status: 400 }
      );
    }

    const currentStatus = resolveCoLoadingStatus(dispatch);
    if (currentStatus === 'fully_loaded') {
      return NextResponse.json(
        { error: 'This vehicle has already completed secondary loading and is fully dispatched.' },
        { status: 400 }
      );
    }

    const originPlant = normalizePlant(dispatch.from_location);
    const scheduledNextPlant = resolveNextLoadingPlant(dispatch);
    const userPlant = normalizePlant(employee.plant);
    const isOwner = isOwnerUser(employee);

    // Determine the loading plant (must match user plant unless owner)
    const secondPlant = isOwner ? (scheduledNextPlant || userPlant) : userPlant;

    if (!isOwner && scheduledNextPlant && secondPlant !== scheduledNextPlant) {
      return NextResponse.json(
        {
          error: `Unauthorized: This vehicle is scheduled for secondary loading at ${scheduledNextPlant} Plant. Your active plant is ${secondPlant} Plant.`,
        },
        { status: 403 }
      );
    }

    if (secondPlant === originPlant) {
      return NextResponse.json(
        { error: `Secondary loading must occur at a different plant than origin plant (${originPlant}).` },
        { status: 400 }
      );
    }

    // 2. Validate quantities and check stock at secondPlant for each requested item
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) {
        return NextResponse.json(
          { error: `Invalid quantity for model: ${item.model_name || item.model_id}. Must be greater than 0.` },
          { status: 400 }
        );
      }

      // Check stock at secondPlant
      const { data: stockEntries, error: stockCheckErr } = await supabase
        .from('stock_transactions')
        .select('quantity')
        .eq('model_id', item.model_id)
        .eq('plant', secondPlant);

      if (stockCheckErr) {
        console.warn('Stock check query error:', stockCheckErr.message);
      }

      const availableStock = (stockEntries || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
      if (availableStock < qty) {
        return NextResponse.json(
          {
            error: `Insufficient stock at ${secondPlant} Plant for model. Available: ${availableStock}, Requested to load: ${qty}`,
          },
          { status: 400 }
        );
      }
    }

    const nowIso = new Date().toISOString();

    // 3. Insert line items into dispatch_items
    for (const item of items) {
      const itemPayload = {
        dispatch_id: id,
        model_id: item.model_id,
        quantity: Math.abs(Number(item.quantity)),
        loaded_plant: secondPlant,
        loaded_by: employee.id,
      };

      const { error: itemInsertErr } = await supabase
        .from('dispatch_items')
        .insert(itemPayload);

      if (itemInsertErr) {
        console.warn('Direct insert into dispatch_items failed, retrying without loaded_plant column:', itemInsertErr.message);
        // Fallback if migration not run yet
        await supabase.from('dispatch_items').insert({
          dispatch_id: id,
          model_id: item.model_id,
          quantity: Math.abs(Number(item.quantity)),
        });
      }
    }

    // 4. Deduct stock from stock_transactions for the second plant
    const stockDeductions = items.map((item) => ({
      model_id: item.model_id,
      quantity: -Math.abs(Number(item.quantity)),
      transaction_type: 'dispatch',
      reference_id: id,
      employee_id: employee.id,
      plant: secondPlant,
      notes: `[Party Dispatch - Co-Load Stop 2] Loaded at ${secondPlant} Plant (Vehicle: ${dispatch.vehicle_number})${
        notes ? ` - ${notes.trim()}` : ''
      }`,
    }));

    const { error: stockErr } = await supabase
      .from('stock_transactions')
      .insert(stockDeductions);

    if (stockErr) {
      console.warn('Stock transaction insert failed, retrying fallback:', stockErr.message);
      await supabase.from('stock_transactions').insert(
        stockDeductions.map((entry) => ({
          ...entry,
          notes: `[Party Dispatch - Co-Load Stop 2] [Plant: ${secondPlant}] Loaded (Vehicle: ${dispatch.vehicle_number})`,
        }))
      );
    }

    // 5. Update dispatch to 'fully_loaded'
    const updatedRemarks = formatDispatchRemarks(dispatch.remarks, resolveDispatchType(dispatch), {
      isCoLoading: true,
      nextLoadingPlant: scheduledNextPlant || secondPlant,
      status: 'fully_loaded',
      secondPlant: secondPlant,
    });

    const updatePayload = {
      is_coloading: true,
      coloading_status: 'fully_loaded',
      second_plant: secondPlant,
      second_plant_employee_id: employee.id,
      second_plant_confirmed_at: nowIso,
      second_plant_notes: notes ? notes.trim() : null,
      remarks: updatedRemarks,
      updated_at: nowIso,
    };

    let { error: updateErr } = await supabase
      .from('dispatches')
      .update(updatePayload)
      .eq('id', id);

    if (updateErr) {
      console.warn('Direct dispatch update failed, retrying fallback remarks:', updateErr.message);
      await supabase
        .from('dispatches')
        .update({
          remarks: updatedRemarks,
          updated_at: nowIso,
        })
        .eq('id', id);
    }

    const addedQty = items.reduce((acc, it) => acc + Number(it.quantity), 0);
    const previousQty = (dispatch.dispatch_items || []).reduce((acc, it) => acc + Number(it.quantity), 0);
    const totalVehicleQty = previousQty + addedQty;

    return NextResponse.json({
      success: true,
      message: `Successfully loaded ${addedQty} cooler(s) from ${secondPlant} Plant! Vehicle ${dispatch.vehicle_number} is now fully loaded (${totalVehicleQty} total units).`,
      second_plant: secondPlant,
      added_quantity: addedQty,
      total_vehicle_quantity: totalVehicleQty,
      confirmed_at: nowIso,
    });
  } catch (err) {
    console.error('API /dispatch/[id]/coload error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error during co-loading' },
      { status: 500 }
    );
  }
}
