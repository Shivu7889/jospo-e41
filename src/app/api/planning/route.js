import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import { normalizePlant, resolveModelManufacturingPlant, ALL_PLANTS_ID } from '@/lib/plants';
import { getCached, setCached, invalidateCache } from '@/lib/serverCache';

export const dynamic = 'force-dynamic';
const PLANNING_CACHE_TTL = 15 * 1000;

/**
 * GET /api/planning
 * Fetch dispatch plans with planned items, plant breakdown, and live loaded counts
 * Query params: date, plant, status, id
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
    const idParam = searchParams.get('id');
    const forceRefresh = searchParams.get('refresh') === 'true';

    const cacheKey = `planning_${idParam || ''}_${dateParam || ''}_${plantParam || ''}_${statusParam || ''}`;
    if (!forceRefresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT' } });
      }
    }

    let query = adminDb
      .from('dispatch_plans')
      .select(`
        *,
        dispatch_plan_items (
          id,
          model_id,
          plant,
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
      .order('created_at', { ascending: false })
      .limit(100);

    if (idParam) {
      query = query.eq('id', idParam);
    }

    if (dateParam && dateParam !== 'ALL') {
      query = query.eq('plan_date', dateParam);
    }

    if (statusParam && statusParam !== 'all') {
      query = query.eq('status', statusParam);
    }

    const { data: plans, error } = await query;

    if (error) {
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
      const plantBreakdown = {};

      const items = (plan.dispatch_plan_items || []).map((item) => {
        const plannedQty = Number(item.planned_quantity || 0);
        totalPlanned += plannedQty;

        const loadedQty = plan.linked_dispatch_id
          ? dispatchItemsMap[`${plan.linked_dispatch_id}::${item.model_id}`] || 0
          : 0;
        totalLoaded += loadedQty;

        const itemPlant = normalizePlant(
          item.plant || item.cooler_models?.manufacturing_plant || 'E41 G2'
        );

        if (!plantBreakdown[itemPlant]) {
          plantBreakdown[itemPlant] = {
            plant: itemPlant,
            planned: 0,
            loaded: 0,
            itemsCount: 0,
          };
        }
        plantBreakdown[itemPlant].planned += plannedQty;
        plantBreakdown[itemPlant].loaded += loadedQty;
        plantBreakdown[itemPlant].itemsCount += 1;

        return {
          ...item,
          plant: itemPlant,
          loaded_quantity: loadedQty,
          is_complete: loadedQty >= plannedQty,
        };
      });

      const distinctPlants = Object.keys(plantBreakdown);
      const isMultiPlant = distinctPlants.length > 1;

      return {
        ...plan,
        vehicle_number: plan.vehicle_number || '',
        is_vehicle_assigned: Boolean(plan.vehicle_number && plan.vehicle_number.trim()),
        dispatch_plan_items: items,
        plant_breakdown: plantBreakdown,
        distinct_plants: distinctPlants,
        is_multi_plant: isMultiPlant,
        total_planned_quantity: totalPlanned,
        total_loaded_quantity: totalLoaded,
        completion_percent: totalPlanned > 0 ? Math.min(100, Math.round((totalLoaded / totalPlanned) * 100)) : 0,
      };
    });

    // Plant filter: If user selected a specific plant (e.g. E41 G2 or D4),
    // include plans that belong to this plant OR contain any models produced by this plant!
    let filteredPlans = enrichedPlans;
    if (plantParam && plantParam !== ALL_PLANTS_ID && plantParam !== 'ALL') {
      const targetPlant = normalizePlant(plantParam);
      filteredPlans = enrichedPlans.filter((p) => {
        if (p.plant === targetPlant) return true;
        if (p.distinct_plants && p.distinct_plants.includes(targetPlant)) return true;
        return false;
      });
    }

    const planningPayload = {
      success: true,
      plans: filteredPlans,
      total: filteredPlans.length,
    };
    setCached(cacheKey, planningPayload, PLANNING_CACHE_TTL);

    return NextResponse.json(planningPayload);
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
 * Create a new daily dispatch plan (Vehicle is optional, Destination is required)
 * Automatically groups items by manufacturing plant
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
      vehicle_number = '',
      destination,
      dispatch_type = 'party',
      dispatch_mode = 'auto',
      priority = 'normal',
      notes = '',
      driver_phone = '',
      items = [],
    } = body;

    const cleanDest = (destination || '').trim();
    const cleanVehicle = (vehicle_number || '').trim().toUpperCase();

    if (!cleanDest) {
      return NextResponse.json(
        { success: false, error: 'Party Name / Destination is required for dispatch planning.' },
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

    // Fetch models catalog to accurately determine manufacturing plant for each model
    const modelIds = validItems.map((it) => it.model_id);
    const { data: dbModels } = await adminDb
      .from('cooler_models')
      .select('id, name, code, manufacturing_plant')
      .in('id', modelIds);

    const modelMap = {};
    (dbModels || []).forEach((m) => {
      modelMap[m.id] = m;
    });

    // Detect distinct manufacturing plants across items
    const distinctPlantSet = new Set();
    const itemsWithPlant = validItems.map((it) => {
      const model = modelMap[it.model_id];
      const mfgPlant = normalizePlant(
        it.plant || resolveModelManufacturingPlant(model) || 'E41 G2'
      );
      distinctPlantSet.add(mfgPlant);
      return {
        ...it,
        plant: mfgPlant,
      };
    });

    const distinctPlants = Array.from(distinctPlantSet);
    const isMultiPlant = distinctPlants.length > 1;

    // Determine plan header plant
    let planHeaderPlant = plant ? normalizePlant(plant) : 'E41 G2';
    if (isMultiPlant) {
      planHeaderPlant = 'MULTI';
    } else if (distinctPlants.length === 1) {
      planHeaderPlant = distinctPlants[0];
    }

    // 1. Insert header (vehicle_number is optional)
    const headerPayload = {
      plan_date: plan_date || new Date().toISOString().split('T')[0],
      plant: planHeaderPlant,
      vehicle_number: cleanVehicle,
      destination: cleanDest,
      dispatch_type,
      dispatch_mode: isMultiPlant ? (dispatch_mode || 'coloading') : 'single_plant',
      priority,
      notes: notes ? notes.trim() : null,
      driver_phone: driver_phone ? driver_phone.trim() : null,
      status: 'pending',
      created_by: employee?.id || null,
    };

    let { data: newPlan, error: planError } = await adminDb
      .from('dispatch_plans')
      .insert(headerPayload)
      .select()
      .single();

    if (planError && planError.message?.includes('dispatch_mode')) {
      delete headerPayload.dispatch_mode;
      const retry = await adminDb
        .from('dispatch_plans')
        .insert(headerPayload)
        .select()
        .single();
      newPlan = retry.data;
      planError = retry.error;
    }

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

    // 2. Insert line items with plant column
    const lineItemRows = itemsWithPlant.map((it) => ({
      plan_id: newPlan.id,
      model_id: it.model_id,
      plant: it.plant,
      planned_quantity: parseInt(it.planned_quantity, 10),
    }));

    let { error: itemsError } = await adminDb
      .from('dispatch_plan_items')
      .insert(lineItemRows);

    if (itemsError && itemsError.message?.includes('plant')) {
      // Fallback if plant column not added yet
      const fallbackRows = lineItemRows.map(({ plant, ...rest }) => rest);
      const fbResult = await adminDb.from('dispatch_plan_items').insert(fallbackRows);
      itemsError = fbResult.error;
    }

    if (itemsError) throw itemsError;

    invalidateCache('planning_');

    return NextResponse.json(
      {
        success: true,
        message: isMultiPlant
          ? `Multi-plant plan for ${cleanDest} (${distinctPlants.join(' + ')}) created successfully!`
          : `Plan for ${cleanDest} created successfully!`,
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
 * Update plan details, assign vehicle, update status, or change item quantities
 */
export async function PATCH(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const adminDb = createAdminSupabase() || supabase;

    const body = await request.json();
    const {
      id,
      status,
      priority,
      notes,
      driver_phone,
      vehicle_number,
      destination,
      plant,
      dispatch_mode,
      items,
      linked_dispatch_id,
    } = body;

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
    if (typeof plant === 'string') updatePayload.plant = plant;
    if (typeof dispatch_mode === 'string') updatePayload.dispatch_mode = dispatch_mode;
    if (typeof linked_dispatch_id !== 'undefined') updatePayload.linked_dispatch_id = linked_dispatch_id;

    let { data: updatedPlan, error: updateErr } = await adminDb
      .from('dispatch_plans')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr && updateErr.message?.includes('dispatch_mode')) {
      delete updatePayload.dispatch_mode;
      const retry = await adminDb
        .from('dispatch_plans')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      updatedPlan = retry.data;
      updateErr = retry.error;
    }

    if (updateErr) throw updateErr;

    // If items are provided, replace line items
    if (Array.isArray(items)) {
      await adminDb.from('dispatch_plan_items').delete().eq('plan_id', id);

      const validItems = items
        .filter((it) => it.model_id && Number(it.planned_quantity) > 0)
        .map((it) => ({
          plan_id: id,
          model_id: it.model_id,
          plant: it.plant ? normalizePlant(it.plant) : 'E41 G2',
          planned_quantity: parseInt(it.planned_quantity, 10),
        }));

      if (validItems.length > 0) {
        let { error: itErr } = await adminDb.from('dispatch_plan_items').insert(validItems);
        if (itErr && itErr.message?.includes('plant')) {
          const fallback = validItems.map(({ plant, ...rest }) => rest);
          await adminDb.from('dispatch_plan_items').insert(fallback);
        }
      }
    }

    invalidateCache('planning_');

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
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;
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

    // 1. Unlink any dispatches referencing this plan so foreign key does not block deletion
    try {
      await adminDb
        .from('dispatches')
        .update({ plan_id: null })
        .eq('plan_id', id);
    } catch (e) {
      console.warn('Could not unlink dispatches plan_id:', e);
    }

    // 2. Clear linked_dispatch_id on the plan itself if any
    try {
      await adminDb
        .from('dispatch_plans')
        .update({ linked_dispatch_id: null })
        .eq('id', id);
    } catch (e) {
      console.warn('Could not clear linked_dispatch_id:', e);
    }

    // 3. Explicitly delete child items first so foreign key cascade never blocks deletion
    try {
      await adminDb
        .from('dispatch_plan_items')
        .delete()
        .eq('plan_id', id);
    } catch (itemsDelErr) {
      console.warn('Child items delete warning:', itemsDelErr);
    }

    // 4. Delete the plan header
    let { error: delErr } = await adminDb
      .from('dispatch_plans')
      .delete()
      .eq('id', id);

    // Fallback to authenticated client if adminDb had an issue
    if (delErr && supabase) {
      const retry = await supabase
        .from('dispatch_plans')
        .delete()
        .eq('id', id);
      delErr = retry.error;
    }

    if (delErr) throw delErr;

    invalidateCache('planning_');

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
