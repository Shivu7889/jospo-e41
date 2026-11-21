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

    const safeItems = Array.isArray(items)
      ? items.filter((it) => it && it.model_id && Number(it.quantity) > 0)
      : [];

    const isFinal = Boolean(is_final_stop) || !next_plant;
    const nextStopPlant = isFinal ? null : normalizePlant(next_plant);

    // If 0 items are loaded, user must either select a next plant to forward to or mark as final stop
    if (safeItems.length === 0 && !isFinal && !nextStopPlant) {
      return NextResponse.json(
        { error: 'Please specify items to load, or select the next plant to move this vehicle to.' },
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

    const originPlant = normalizePlant(dispatch.from_location);
    const scheduledNextPlant = resolveNextLoadingPlant(dispatch);
    const userPlant = normalizePlant(employee.plant);
    const isOwner = isOwnerUser(employee);
    const isOwnerOrAdmin = isOwner || employee.role === 'admin' || employee.role === 'dispatch';

    // Determine the loading plant (must match user plant unless owner or admin)
    const loadingPlant = normalizePlant(
      (isOwnerOrAdmin && body.loading_plant)
        ? body.loading_plant
        : (body.loading_plant || userPlant || scheduledNextPlant || 'D4')
    );

    // Check if vehicle has already visited or is scheduled to visit loadingPlant
    const hasVisitedPlant =
      loadingPlant === scheduledNextPlant ||
      loadingPlant === normalizePlant(dispatch.second_plant) ||
      loadingPlant === normalizePlant(dispatch.third_plant) ||
      (dispatch.dispatch_items || []).some((it) => (it.loaded_plant ? normalizePlant(it.loaded_plant) : null) === loadingPlant);

    if (currentStatus === 'fully_loaded' && !hasVisitedPlant && !isOwnerOrAdmin) {
      return NextResponse.json(
        { error: 'This vehicle has already completed all loading stops and is fully dispatched.' },
        { status: 400 }
      );
    }

    if (!isOwnerOrAdmin && !hasVisitedPlant && scheduledNextPlant && loadingPlant !== scheduledNextPlant) {
      return NextResponse.json(
        {
          error: `Unauthorized: This vehicle is scheduled for loading at ${scheduledNextPlant} Plant. Your active plant is ${loadingPlant} Plant.`,
        },
        { status: 403 }
      );
    }

    if (loadingPlant === originPlant && !isOwnerOrAdmin) {
      return NextResponse.json(
        { error: `Secondary loading must occur at a different plant than origin plant (${originPlant}).` },
        { status: 400 }
      );
    }

    // 2. Fetch previous items loaded at loadingPlant for this dispatch (to calculate stock deltas)
    const previousPlantItems = (dispatch.dispatch_items || []).filter(
      (it) => (it.loaded_plant ? normalizePlant(it.loaded_plant) : null) === loadingPlant
    );

    const oldTotals = {};
    previousPlantItems.forEach((it) => {
      oldTotals[it.model_id] = (oldTotals[it.model_id] || 0) + Number(it.quantity);
    });

    const newTotals = {};
    safeItems.forEach((it) => {
      newTotals[it.model_id] = (newTotals[it.model_id] || 0) + Number(it.quantity);
    });

    // Advance dispatch mode: Negative stock is allowed when co-loading items

    const nowIso = new Date().toISOString();

    // 3. Remove previous items loaded at loadingPlant from dispatch_items
    if (previousPlantItems.length > 0) {
      const prevIds = previousPlantItems.map((p) => p.id).filter(Boolean);
      if (prevIds.length > 0) {
        await supabase.from('dispatch_items').delete().in('id', prevIds);
      } else {
        await supabase.from('dispatch_items').delete().eq('dispatch_id', id).eq('loaded_plant', loadingPlant);
      }
    }

    // 4. Insert updated line items for loadingPlant into dispatch_items
    if (safeItems.length > 0) {
      for (const item of safeItems) {
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
    }

    // 5. Synchronize stock transactions for loadingPlant (Live Plant Inventory Reconciliation)
    // Deleting previous deductions automatically restores stock for any removed or reduced items to loadingPlant
    await supabase
      .from('stock_transactions')
      .delete()
      .eq('reference_id', id)
      .eq('plant', loadingPlant)
      .eq('transaction_type', 'dispatch');

    // Inserting new deductions debits newly filled items from loadingPlant
    if (safeItems.length > 0) {
      const stockDeductions = safeItems.map((item) => ({
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
    }

    // 6. Handle unloaded items from prior stops (coolers unloaded into loadingPlant warehouse)
    const safeUnloaded = Array.isArray(body.unloaded_items)
      ? body.unloaded_items.filter((u) => u && u.model_id && Number(u.quantity) > 0)
      : [];

    if (safeUnloaded.length > 0) {
      for (const u of safeUnloaded) {
        const qtyToUnload = Math.abs(Number(u.quantity));
        const priorItem = (dispatch.dispatch_items || []).find(
          (it) => it.model_id === u.model_id && (it.loaded_plant ? normalizePlant(it.loaded_plant) : null) !== loadingPlant
        );
        if (priorItem) {
          if (priorItem.quantity <= qtyToUnload) {
            await supabase.from('dispatch_items').delete().eq('id', priorItem.id);
          } else {
            await supabase
              .from('dispatch_items')
              .update({ quantity: priorItem.quantity - qtyToUnload })
              .eq('id', priorItem.id);
          }

          // Credit stock to loadingPlant warehouse
          await supabase.from('stock_transactions').insert({
            model_id: u.model_id,
            transaction_type: 'transfer_in',
            quantity: qtyToUnload,
            reference_id: id,
            employee_id: employee.id,
            plant: loadingPlant,
            notes: `[Co-Load Unloaded] Coolers offloaded into ${loadingPlant} Plant warehouse (Vehicle: ${dispatch.vehicle_number})`,
          });
        }
      }
    }

    // 7. Determine whether vehicle is fully loaded or heading to 3rd plant
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
      loadedPlantTag: safeItems.length > 0 ? loadingPlant : null,
      loadedItemIds: safeItems.map((it) => it.model_id),
    });

    const effectiveNotes = notes
      ? notes.trim()
      : safeItems.length === 0
      ? isFinal
        ? `No coolers loaded at ${loadingPlant} Plant. Vehicle dispatched directly to destination.`
        : `Items not in stock at ${loadingPlant} Plant. Vehicle moved to ${nextStopPlant} Plant for loading.`
      : null;

    const updatePayload = {
      is_coloading: true,
      coloading_status: newStatus,
      next_loading_plant: nextStopPlant,
      remarks: updatedRemarks,
      updated_at: nowIso,
    };

    if (!hasSecondPlant || dispatch.second_plant === loadingPlant) {
      updatePayload.second_plant = loadingPlant;
      updatePayload.second_plant_employee_id = employee.id;
      updatePayload.second_plant_confirmed_at = nowIso;
      if (effectiveNotes) updatePayload.second_plant_notes = effectiveNotes;
    } else if (isThirdPlant || dispatch.third_plant === loadingPlant) {
      updatePayload.third_plant = loadingPlant;
      updatePayload.third_plant_employee_id = employee.id;
      updatePayload.third_plant_confirmed_at = nowIso;
      if (effectiveNotes) updatePayload.third_plant_notes = effectiveNotes;
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
        fallbackPayload.second_plant_notes = effectiveNotes;
      }
      await supabase
        .from('dispatches')
        .update(fallbackPayload)
        .eq('id', id);
    }

    const addedQty = safeItems.reduce((acc, it) => acc + Number(it.quantity), 0);
    const previousQty = (dispatch.dispatch_items || []).reduce((acc, it) => acc + Number(it.quantity), 0);
    const totalVehicleQty = previousQty + addedQty;

    let responseMessage = '';
    if (addedQty === 0) {
      responseMessage = isFinal
        ? `Vehicle ${dispatch.vehicle_number} finalized from ${loadingPlant} Plant with 0 additional items (${totalVehicleQty} total units on board).`
        : `Vehicle ${dispatch.vehicle_number} has been moved from ${loadingPlant} Plant to ${nextStopPlant} Plant for loading (${totalVehicleQty} units on board).`;
    } else {
      responseMessage = isFinal
        ? `Successfully loaded ${addedQty} cooler(s) from ${loadingPlant} Plant! Vehicle ${dispatch.vehicle_number} is now FULLY LOADED (${totalVehicleQty} total units dispatched to party).`
        : `Successfully loaded ${addedQty} cooler(s) from ${loadingPlant} Plant! Vehicle ${dispatch.vehicle_number} has been dispatched to ${nextStopPlant} Plant for final loading (${totalVehicleQty} units loaded so far).`;
    }

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
