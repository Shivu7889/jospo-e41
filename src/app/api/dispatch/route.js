import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// GET: List dispatches with items, models, and employee info
export async function GET(request) {
  try {
    const supabase = await createServerSupabase();
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
    const supabase = await createServerSupabase();

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const {
      vehicle_number,
      from_location = 'Jospo E41',
      destination,
      dispatch_date = new Date().toISOString().split('T')[0],
      remarks,
      items = [],
      auto_confirm = false,
      employee_id: providedEmployeeId,
    } = body;

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

    // Determine employee ID
    const employeeId = providedEmployeeId || user?.id;
    if (!employeeId) {
      return NextResponse.json({ error: 'User is not authenticated as an employee' }, { status: 401 });
    }

    // Validate item quantities
    for (const item of items) {
      if (!item.model_id || !item.quantity || Number(item.quantity) <= 0) {
        return NextResponse.json(
          { error: 'All items must have a valid model_id and quantity > 0' },
          { status: 400 }
        );
      }
    }

    // 2. If auto_confirm is requested, check stock availability for all items first
    if (auto_confirm) {
      for (const item of items) {
        const { data: stockData, error: stockErr } = await supabase
          .from('current_stock')
          .select('current_stock, model_name, model_code')
          .eq('model_id', item.model_id)
          .single();

        if (stockErr) {
          return NextResponse.json(
            { error: `Could not verify stock for model ID: ${item.model_id}` },
            { status: 400 }
          );
        }

        const available = stockData?.current_stock ?? 0;
        if (available < item.quantity) {
          return NextResponse.json(
            {
              error: `Insufficient stock for ${stockData?.model_code || 'item'} (${stockData?.model_name}). Required: ${item.quantity}, Available: ${available}`,
            },
            { status: 400 }
          );
        }
      }
    }

    // 3. Insert dispatch record
    const { data: dispatchRecord, error: dispatchError } = await supabase
      .from('dispatches')
      .insert({
        vehicle_number: vehicle_number.trim().toUpperCase(),
        from_location: from_location.trim(),
        destination: destination.trim(),
        dispatch_date,
        remarks: remarks?.trim() || null,
        status: 'draft',
        employee_id: employeeId,
      })
      .select()
      .single();

    if (dispatchError) {
      return NextResponse.json({ error: dispatchError.message }, { status: 400 });
    }

    // 4. Insert dispatch_items
    const lineItems = items.map((it) => ({
      dispatch_id: dispatchRecord.id,
      model_id: it.model_id,
      quantity: Number(it.quantity),
    }));

    const { error: itemsError } = await supabase
      .from('dispatch_items')
      .insert(lineItems);

    if (itemsError) {
      // Rollback dispatch header
      await supabase.from('dispatches').delete().eq('id', dispatchRecord.id);
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    // 5. If auto_confirm, invoke confirm_dispatch RPC
    if (auto_confirm) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('confirm_dispatch', {
        p_dispatch_id: dispatchRecord.id,
        p_employee_id: employeeId,
      });

      if (rpcError || (rpcData && rpcData.success === false)) {
        return NextResponse.json(
          {
            error: rpcError?.message || rpcData?.error || 'Failed to auto-confirm dispatch and deduct stock',
            dispatch_id: dispatchRecord.id,
          },
          { status: 400 }
        );
      }

      dispatchRecord.status = 'confirmed';
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
