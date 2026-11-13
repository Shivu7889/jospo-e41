import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// GET: Get single dispatch by id with line items and employee info
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const supabase = await createServerSupabase();

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
    const { id } = params;
    const supabase = await createServerSupabase();
    const body = await request.json();

    // Verify existing dispatch status
    const { data: existing, error: checkError } = await supabase
      .from('dispatches')
      .select('status')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Dispatch record not found' }, { status: 404 });
    }

    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot edit dispatch with status "${existing.status}". Only drafts can be modified.` },
        { status: 400 }
      );
    }

    const {
      vehicle_number,
      from_location,
      destination,
      dispatch_date,
      remarks,
      items,
    } = body;

    const updateFields = {};
    if (vehicle_number !== undefined) updateFields.vehicle_number = vehicle_number.trim().toUpperCase();
    if (from_location !== undefined) updateFields.from_location = from_location.trim();
    if (destination !== undefined) updateFields.destination = destination.trim();
    if (dispatch_date !== undefined) updateFields.dispatch_date = dispatch_date;
    if (remarks !== undefined) updateFields.remarks = remarks?.trim() || null;
    updateFields.updated_at = new Date().toISOString();

    // Update dispatch header
    const { data: updatedDispatch, error: updateError } = await supabase
      .from('dispatches')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // If items are provided, replace line items
    if (Array.isArray(items)) {
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
          return NextResponse.json({ error: insertItemsError.message }, { status: 400 });
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

// DELETE: Delete draft dispatch
export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const supabase = await createServerSupabase();

    // Verify existing dispatch status
    const { data: existing, error: checkError } = await supabase
      .from('dispatches')
      .select('status')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Dispatch record not found' }, { status: 404 });
    }

    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot delete dispatch with status "${existing.status}". Only drafts can be deleted.` },
        { status: 400 }
      );
    }

    // Delete dispatch (dispatch_items will cascade delete)
    const { error: deleteError } = await supabase
      .from('dispatches')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json(
      { success: true, message: 'Draft dispatch deleted successfully' },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /dispatch/[id] DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
