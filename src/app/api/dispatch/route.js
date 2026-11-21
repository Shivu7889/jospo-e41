import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getTodayIST } from '@/lib/date';
import { formatDispatchRemarks } from '@/lib/dispatch';
import { normalizePlant } from '@/lib/plants';
import { createAdminSupabase } from '@/lib/supabase-server';
import { clearStockCache } from '@/app/api/stock/route';

export const dynamic = 'force-dynamic';

// GET: List dispatches with items, models, and employee info
export async function GET(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = supabase
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
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (dateFrom) {
      query = query.gte('dispatch_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('dispatch_date', dateTo);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data || [] }, { status: 200 });
  } catch (err) {
    console.error('API /dispatch GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new dispatch (draft or auto-confirmed)
export async function POST(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;

    const body = await request.json();
    const {
      vehicle_number,
      from_location = 'E41 G2',
      destination,
      destination_plant,
      dispatch_date = getTodayIST(),
      remarks,
      dispatch_type = 'party',
      is_coloading = false,
      next_loading_plant = null,
      items = [],
      auto_confirm = false,
    } = body;

    const normalizedType = dispatch_type === 'local' ? 'local' : 'party';
    const normalizedFromPlant = normalizePlant(from_location || 'E41 G2');
    const destPlant = normalizedType === 'local'
      ? (destination_plant ? normalizePlant(destination_plant) : normalizePlant(destination))
      : null;

    if (normalizedType === 'local' && normalizedFromPlant === destPlant) {
      return NextResponse.json(
        { error: `Invalid dispatch: Origin plant (${normalizedFromPlant}) and destination plant (${destPlant}) cannot be the same.` },
        { status: 400 }
      );
    }

    const isCoLoad = normalizedType === 'party' && Boolean(is_coloading);
    const nextPlant = isCoLoad && next_loading_plant ? next_loading_plant.trim() : null;

    // 1. Validation
    if (!vehicle_number || !vehicle_number.trim()) {
      return NextResponse.json({ error: 'Vehicle number is required' }, { status: 400 });
    }
    if (!destination || !destination.trim()) {
      return NextResponse.json({ error: 'Destination is required' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item must be added to dispatch' }, { status: 400 });
    }

    const employeeId = employee.id;

    // Validate item quantities
    for (const item of items) {
      if (!item.model_id || !item.quantity || Number(item.quantity) <= 0) {
        return NextResponse.json(
          { error: 'All items must have a valid model_id and quantity > 0' },
          { status: 400 }
        );
      }
    }

    // 2. If auto_confirm is requested, verify model existence (negative stock allowed)
    if (auto_confirm) {
      for (const item of items) {
        const { data: stockData, error: stockErr } = await supabase
          .from('cooler_models')
          .select('id, name, code')
          .eq('id', item.model_id)
          .single();

        if (stockErr || !stockData) {
          return NextResponse.json(
            { error: `Could not verify model ID: ${item.model_id}` },
            { status: 400 }
          );
        }
      }
    }

    // 3. Insert dispatch record with dispatch_type, destination_plant, co-loading, and fallback remarks
    const initialTransferStatus = normalizedType === 'local' ? 'in_transit' : 'completed';
    let compiledRemarks = formatDispatchRemarks(remarks, normalizedType, {
      isCoLoading: isCoLoad,
      nextLoadingPlant: nextPlant,
      status: isCoLoad ? 'part_loaded' : null,
    });
    if (destPlant) {
      compiledRemarks = `[DestPlant: ${destPlant}] [TransferStatus: ${initialTransferStatus}] ${compiledRemarks}`.trim();
    }

    const insertPayload = {
      vehicle_number: vehicle_number.trim().toUpperCase(),
      from_location: normalizedFromPlant,
      destination: destination.trim(),
      dispatch_date,
      remarks: compiledRemarks,
      status: 'draft',
      employee_id: employeeId,
      dispatch_type: normalizedType,
      destination_plant: destPlant,
      transfer_status: initialTransferStatus,
      is_coloading: isCoLoad,
      next_loading_plant: nextPlant,
      coloading_status: isCoLoad ? 'part_loaded' : 'not_applicable',
    };

    let { data: dispatchRecord, error: dispatchError } = await supabase
      .from('dispatches')
      .insert(insertPayload)
      .select()
      .single();

    // Fallback if destination_plant, is_coloading, etc. column does not exist yet in Supabase schema cache
    if (
      dispatchError &&
      (dispatchError.message?.includes('destination_plant') ||
        dispatchError.message?.includes('transfer_status') ||
        dispatchError.message?.includes('is_coloading') ||
        dispatchError.message?.includes('next_loading_plant') ||
        dispatchError.message?.includes('coloading_status') ||
        dispatchError.code === 'PGRST204')
    ) {
      delete insertPayload.destination_plant;
      delete insertPayload.transfer_status;
      delete insertPayload.is_coloading;
      delete insertPayload.next_loading_plant;
      delete insertPayload.coloading_status;
      if (dispatchError.message?.includes('dispatch_type')) {
        delete insertPayload.dispatch_type;
      }
      const retryResult = await supabase
        .from('dispatches')
        .insert(insertPayload)
        .select()
        .single();
      dispatchRecord = retryResult.data;
      dispatchError = retryResult.error;
    }

    if (dispatchError) {
      return NextResponse.json({ error: dispatchError.message }, { status: 400 });
    }

    // 4. Insert dispatch_items
    const lineItems = items.map((it) => ({
      dispatch_id: dispatchRecord.id,
      model_id: it.model_id,
      quantity: Number(it.quantity),
      loaded_plant: normalizedFromPlant,
      loaded_by: employeeId,
    }));

    let { error: itemsError } = await supabase
      .from('dispatch_items')
      .insert(lineItems);

    if (itemsError && itemsError.message?.includes('loaded_plant')) {
      // Fallback if loaded_plant column not added yet
      const fallbackItems = items.map((it) => ({
        dispatch_id: dispatchRecord.id,
        model_id: it.model_id,
        quantity: Number(it.quantity),
      }));
      const fbResult = await supabase.from('dispatch_items').insert(fallbackItems);
      itemsError = fbResult.error;
    }

    if (itemsError) {
      // Rollback dispatch header
      await supabase.from('dispatches').delete().eq('id', dispatchRecord.id);
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    // 5. If auto_confirm, confirm dispatch and deduct stock (negative stock allowed)
    if (auto_confirm) {
      let rpcConfirmed = false;
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('confirm_dispatch', {
          p_dispatch_id: dispatchRecord.id,
          p_employee_id: employeeId,
        });
        if (!rpcError && rpcData && rpcData.success !== false) {
          rpcConfirmed = true;
        }
      } catch (e) {}

      if (!rpcConfirmed) {
        // Fallback: Deduct negative stock directly with Admin client
        const adminDb = createAdminSupabase() || supabase;
        const originPlant = normalizePlant(dispatchRecord.from_location || 'E41 G2');
        const stockEntries = lineItems.map((it) => ({
          model_id: it.model_id,
          transaction_type: 'dispatch',
          quantity: -Math.abs(Number(it.quantity) || 1),
          reference_id: dispatchRecord.id,
          employee_id: employeeId,
          plant: it.loaded_plant ? normalizePlant(it.loaded_plant) : originPlant,
          notes: `Dispatch confirmed from plant ${it.loaded_plant || originPlant}`,
        }));

        await adminDb.from('stock_transactions').insert(stockEntries);
        await adminDb
          .from('dispatches')
          .update({
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', dispatchRecord.id);
      }

      dispatchRecord.status = 'confirmed';
      clearStockCache();
    }

    // 6. Return response
    return NextResponse.json(
      {
        success: true,
        data: {
          ...dispatchRecord,
          items: lineItems,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('API /dispatch POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
