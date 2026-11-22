import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import { normalizePlant, ALL_PLANTS_ID } from '@/lib/plants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/planning
 * Fetch dispatch plans with planned items and live loaded counts
 * Query params: date, plant, status
 */
export async function GET(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const adminDb = createAdminSupabase() || supabase;

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const plantParam = searchParams.get('plant');
    const statusParam = searchParams.get('status');

    let query = adminDb
      .from('dispatch_plans')
      .select(`
        *,
        dispatch_plan_items (
          id,
          model_id,
          planned_quantity,
          cooler_models (
            id,
            name,
            code,
            qr_data,
            manufacturing_plant
          )
        ),
        created_by_employee:employees!dispatch_plans_created_by_fkey (
          id,
          name,
          email
        ),
        linked_dispatch:dispatches!dispatch_plans_linked_dispatch_id_fkey (
          id,
          vehicle_number,
          status,
          confirmed_at
        )
      `)
      .order('priority', { ascending: false }) // urgent/high first
      .order('created_at', { ascending: false });

    if (dateParam && dateParam !== 'ALL') {
      query = query.eq('plan_date', dateParam);
    }

    if (plantParam && plantParam !== ALL_PLANTS_ID && plantParam !== 'ALL') {
      query = query.eq('plant', normalizePlant(plantParam));
    }

    if (statusParam && statusParam !== 'all') {
      query = query.eq('status', statusParam);
    }

    const { data: plans, error } = await query;

    if (error) {
      // If table does not exist yet in Supabase, return graceful empty list with instructions
      if (error.code === '42P01' || error.message?.includes('dispatch_plans')) {
        return NextResponse.json({
          success: true,
          plans: [],
          tableNotCreated: true,
          message: 'dispatch_plans table not created yet. Please execute sql/add_dispatch_planning.sql in Supabase SQL editor.',
        });
      }
      throw error;
    }

    // Calculate loaded quantities for each plan item if linked to a dispatch
    const linkedDispatchIds = (plans || [])
      .map((p) => p.linked_dispatch_id)
      .filter(Boolean);

    let dispatchItemsMap = {};
    if (linkedDispatchIds.length > 0) {
      const { data: dispItems } = await adminDb
        .from('dispatch_items')
        .select('dispatch_id, model_id, quantity')
        .in('dispatch_id', linkedDispatchIds);

      (dispItems || []).forEach((di) => {
        const key = `${di.dispatch_id}::${di.model_id}`;
        dispatchItemsMap[key] = (dispatchItemsMap[key] || 0) + Number(di.quantity || 0);
      });
    }

    const enrichedPlans = (plans || []).map((plan) => {
      let totalPlanned = 0;
      let totalLoaded = 0;

      const items = (plan.dispatch_plan_items || []).map((item) => {
        totalPlanned += Number(item.planned_quantity || 0);
        const loadedQty = plan.linked_dispatch_id
          ? dispatchItemsMap[`${plan.linked_dispatch_id}::${item.model_id}`] || 0
          : 0;
        totalLoaded += loadedQty;

        return {
          ...item,
          loaded_quantity: loadedQty,
          is_complete: loadedQty >= Number(item.planned_quantity || 0),
        };
      });

      return {
        ...plan,
        dispatch_plan_items: items,
        total_planned_quantity: totalPlanned,
        total_loaded_quantity: totalLoaded,
        completion_percent: totalPlanned > 0 ? Math.min(100, Math.round((totalLoaded / totalPlanned) * 100)) : 0,
      };
    });

    return NextResponse.json({
      success: true,
      plans: enrichedPlans,
      total: enrichedPlans.length,
    });
  } catch (error) {
    console.error('API /api/planning GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch dispatch plans' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/planning
 * Create a new daily dispatch plan
 */
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;
    const adminDb = createAdminSupabase() || supabase;

    const body = await request.json();
    const {
      plan_date,
      plant,
      vehicle_number,
      destination,
      dispatch_type = 'party',
      priority = 'normal',
      notes = '',
      driver_phone = '',
      items = [],
    } = body;

    const cleanVehicle = (vehicle_number || '').trim().toUpperCase();
    const cleanDest = (destination || '').trim();
    const cleanPlant = normalizePlant(plant || employee?.plant || 'E41 G2');

    if (!cleanVehicle) {
      return NextResponse.json(
        { success: false, error: 'Vehicle registration number is required.' },
        { status: 400 }
      );
    }

    if (!cleanDest) {
      return NextResponse.json(
        { success: false, error: 'Party Name / Destination is required.' },
        { status: 400 }
      );
    }

    const validItems = (Array.isArray(items) ? items : []).filter(
      (it) => it.model_id && Number(it.planned_quantity) > 0
    );

    if (validItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please add at least one cooler model with quantity > 0.' },
        { status: 400 }
      );
    }

    // 1. Insert header
    const { data: newPlan, error: planError } = await adminDb
      .from('dispatch_plans')
      .insert({
        plan_date: plan_date || new Date().toISOString().split('T')[0],
        plant: cleanPlant,
        vehicle_number: cleanVehicle,
        destination: cleanDest,
        dispatch_type,
        priority,
        notes: notes ? notes.trim() : null,
        driver_phone: driver_phone ? driver_phone.trim() : null,
        status: 'pending',
        created_by: employee?.id || null,
      })
      .select()
      .single();

    if (planError) {
      if (planError.code === '42P01' || planError.message?.includes('dispatch_plans')) {
        return NextResponse.json(
          {
            success: false,
            error: 'dispatch_plans table not created yet in Supabase. Please run sql/add_dispatch_planning.sql first.',
          },
          { status: 500 }
        );
      }
      throw planError;
    }

    // 2. Insert line items
    const lineItemRows = validItems.map((it) => ({
      plan_id: newPlan.id,
      model_id: it.model_id,
      planned_quantity: parseInt(it.planned_quantity, 10),
    }));

    const { error: itemsError } = await adminDb
      .from('dispatch_plan_items')
      .insert(lineItemRows);

    if (itemsError) throw itemsError;

    return NextResponse.json(
      {
        success: true,
        message: `Plan for vehicle ${cleanVehicle} created successfully!`,
        plan: newPlan,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('API /api/planning POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create dispatch plan' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/planning
 * Update plan details, status, or item quantities
 */
export async function PATCH(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const adminDb = createAdminSupabase() || supabase;

    const body = await request.json();
    const { id, status, priority, notes, driver_phone, vehicle_number, destination, items, linked_dispatch_id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Plan id is required' }, { status: 400 });
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
    };

    if (typeof status === 'string') updatePayload.status = status;
    if (typeof priority === 'string') updatePayload.priority = priority;
    if (typeof notes !== 'undefined') updatePayload.notes = notes ? notes.trim() : null;
    if (typeof driver_phone !== 'undefined') updatePayload.driver_phone = driver_phone ? driver_phone.trim() : null;
    if (typeof vehicle_number === 'string') updatePayload.vehicle_number = vehicle_number.trim().toUpperCase();
    if (typeof destination === 'string') updatePayload.destination = destination.trim();
    if (typeof linked_dispatch_id !== 'undefined') updatePayload.linked_dispatch_id = linked_dispatch_id;

    const { data: updatedPlan, error: updateErr } = await adminDb
      .from('dispatch_plans')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // If items are provided, replace line items
    if (Array.isArray(items)) {
      await adminDb.from('dispatch_plan_items').delete().eq('plan_id', id);

      const validItems = items
        .filter((it) => it.model_id && Number(it.planned_quantity) > 0)
        .map((it) => ({
          plan_id: id,
          model_id: it.model_id,
          planned_quantity: parseInt(it.planned_quantity, 10),
        }));

      if (validItems.length > 0) {
        await adminDb.from('dispatch_plan_items').insert(validItems);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Dispatch plan updated successfully',
      plan: updatedPlan,
    });
  } catch (error) {
    console.error('API /api/planning PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update plan' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/planning
 * Remove a planned dispatch
 */
export async function DELETE(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const adminDb = createAdminSupabase() || supabase;

    let id = null;
    try {
      const body = await request.json();
      if (body) id = body.id;
    } catch {
      // url param fallback
    }

    if (!id) {
      const { searchParams } = new URL(request.url);
      id = searchParams.get('id');
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Plan id is required' }, { status: 400 });
    }

    // Cascade deletes dispatch_plan_items
    const { error: delErr } = await adminDb
      .from('dispatch_plans')
      .delete()
      .eq('id', id);

    if (delErr) throw delErr;

    return NextResponse.json({
      success: true,
      message: 'Dispatch plan deleted successfully',
    });
  } catch (error) {
    console.error('API /api/planning DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete plan' },
      { status: 500 }
    );
  }
}
