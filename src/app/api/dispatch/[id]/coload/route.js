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
    const {
      items = [],
      notes = '',
      is_final_stop = true,
      next_plant = null,
    } = body;

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
        { error: 'This vehicle has already completed all loading stops and is fully dispatched.' },
        { status: 400 }
      );
    }

    const originPlant = normalizePlant(dispatch.from_location);
    const scheduledNextPlant = resolveNextLoadingPlant(dispatch);
    const userPlant = normalizePlant(employee.plant);
    const isOwner = isOwnerUser(employee);

    // Determine the loading plant (must match user plant unless owner)
    const loadingPlant = isOwner
      ? normalizePlant(body.loading_plant || scheduledNextPlant || userPlant)
      : userPlant;

    if (!isOwner && scheduledNextPlant && loadingPlant !== scheduledNextPlant) {
      return NextResponse.json(
        {
          error: `Unauthorized: This vehicle is scheduled for loading at ${scheduledNextPlant} Plant. Your active plant is ${loadingPlant} Plant.`,
        },
        { status: 403 }
      );
    }

    if (loadingPlant === originPlant && !isOwner) {
      return NextResponse.json(
        { error: `Secondary loading must occur at a different plant than origin plant (${originPlant}).` },
        { status: 400 }
      );
    }

    // 2. Validate quantities and check stock at loadingPlant for each requested item
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) {
        return NextResponse.json(
          { error: `Invalid quantity for model: ${item.model_name || item.model_id}. Must be greater than 0.` },
          { status: 400 }
        );
      }

      // Check stock at loadingPlant
      const { data: stockEntries, error: stockCheckErr } = await supabase
        .from('stock_transactions')
        .select('quantity')
        .eq('model_id', item.model_id)
        .eq('plant', loadingPlant);

      if (stockCheckErr) {
        console.warn('Stock check query error:', stockCheckErr.message);
      }

      const availableStock = (stockEntries || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
      if (availableStock < qty) {
        return NextResponse.json(
          {
            error: `Insufficient stock at ${loadingPlant} Plant for model. Available: ${availableStock}, Requested to load: ${qty}`,
          },
          { status: 400 }
        );
      }
    }

    const nowIso = new Date().toISOString();

    // 3. Insert line items into dispatch_items with loaded_plant
    for (const item of items) {
      const itemPayload = {
        dispatch_id: id,
        model_id: item.model_id,
        quantity: Math.abs(Number(item.quantity)),
        loaded_plant: loadingPlant,
        loaded_by: employee.id,
      };

      const { error: itemInsertErr } = await supabase
        .from('dispatch_items')
        .insert(itemPayload);

      if (itemInsertErr) {
        console.warn('Direct insert into dispatch_items failed, retrying fallback:', itemInsertErr.message);
        await supabase.from('dispatch_items').insert({
          dispatch_id: id,
          model_id: item.model_id,
          quantity: Math.abs(Number(item.quantity)),
        });
      }
    }

    // 4. Deduct stock from stock_transactions for loadingPlant
    const stockDeductions = items.map((item) => ({
      model_id: item.model_id,
      quantity: -Math.abs(Number(item.quantity)),
      transaction_type: 'dispatch',
      reference_id: id,
      employee_id: employee.id,
      plant: loadingPlant,
      notes: `[Party Dispatch - Co-Load] Loaded at ${loadingPlant} Plant (Vehicle: ${dispatch.vehicle_number})${
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
          notes: `[Party Dispatch - Co-Load] [Plant: ${loadingPlant}] Loaded (Vehicle: ${dispatch.vehicle_number})`,
        }))
      );
    }

    // 5. Determine whether vehicle is fully loaded or heading to 3rd plant
    const isFinal = Boolean(is_final_stop) || !next_plant;
    const nextStopPlant = isFinal ? null : normalizePlant(next_plant);
    const newStatus = isFinal ? 'fully_loaded' : 'part_loaded';

    // Track Stop 2 vs Stop 3 plant
    const hasSecondPlant = Boolean(dispatch.second_plant);
    const isThirdPlant = hasSecondPlant && dispatch.second_plant !== loadingPlant;

    const secondPlantValue = hasSecondPlant ? dispatch.second_plant : loadingPlant;
    const thirdPlantValue = isThirdPlant ? loadingPlant : (dispatch.third_plant || null);

    const updatedRemarks = formatDispatchRemarks(dispatch.remarks, resolveDispatchType(dispatch), {
      isCoLoading: true,
      nextLoadingPlant: nextStopPlant,
      status: newStatus,
      secondPlant: secondPlantValue,
      thirdPlant: thirdPlantValue,
    });

    const updatePayload = {
      is_coloading: true,
      coloading_status: newStatus,
      next_loading_plant: nextStopPlant,
      remarks: updatedRemarks,
      updated_at: nowIso,
    };

    if (!hasSecondPlant) {
      updatePayload.second_plant = loadingPlant;
      updatePayload.second_plant_employee_id = employee.id;
      updatePayload.second_plant_confirmed_at = nowIso;
      updatePayload.second_plant_notes = notes ? notes.trim() : null;
    } else if (isThirdPlant) {
      updatePayload.third_plant = loadingPlant;
      updatePayload.third_plant_employee_id = employee.id;
      updatePayload.third_plant_confirmed_at = nowIso;
      updatePayload.third_plant_notes = notes ? notes.trim() : null;
    }

    let { error: updateErr } = await supabase
      .from('dispatches')
      .update(updatePayload)
      .eq('id', id);

    if (updateErr) {
      console.warn('Direct dispatch update failed, retrying fallback without third_plant columns:', updateErr.message);
      const fallbackPayload = {
        is_coloading: true,
        coloading_status: newStatus,
        next_loading_plant: nextStopPlant,
        remarks: updatedRemarks,
        updated_at: nowIso,
      };
      if (!hasSecondPlant) {
        fallbackPayload.second_plant = loadingPlant;
        fallbackPayload.second_plant_confirmed_at = nowIso;
      }
      await supabase
        .from('dispatches')
        .update(fallbackPayload)
        .eq('id', id);
    }

    const addedQty = items.reduce((acc, it) => acc + Number(it.quantity), 0);
    const previousQty = (dispatch.dispatch_items || []).reduce((acc, it) => acc + Number(it.quantity), 0);
    const totalVehicleQty = previousQty + addedQty;

    const responseMessage = isFinal
      ? `Successfully loaded ${addedQty} cooler(s) from ${loadingPlant} Plant! Vehicle ${dispatch.vehicle_number} is now FULLY LOADED (${totalVehicleQty} total units dispatched to party).`
      : `Successfully loaded ${addedQty} cooler(s) from ${loadingPlant} Plant! Vehicle ${dispatch.vehicle_number} has been dispatched to ${nextStopPlant} Plant for final loading (${totalVehicleQty} units loaded so far).`;

    return NextResponse.json({
      success: true,
      message: responseMessage,
      loading_plant: loadingPlant,
      added_quantity: addedQty,
      total_vehicle_quantity: totalVehicleQty,
      is_final_stop: isFinal,
      next_loading_plant: nextStopPlant,
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
