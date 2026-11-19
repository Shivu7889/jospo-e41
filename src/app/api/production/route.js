import { NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server';
import { authenticateRequest } from '@/lib/auth';
import { getTodayIST } from '@/lib/date';
import { normalizePlant, resolveModelManufacturingPlant, ALL_PLANTS_ID } from '@/lib/plants';

export const dynamic = 'force-dynamic';

/**
 * Helper to determine if an entry was created / logged "today"
 * Checks UTC date, IST local date (Asia/Kolkata), and 24-hour window
 */
function isEntryFromToday(entry) {
  if (!entry) return false;
  const now = new Date();
  const localToday = getTodayIST();

  // 1. Check production_date
  if (entry.production_date === localToday) {
    return true;
  }

  // 2. Check created_at date
  if (entry.created_at) {
    const createdDate = new Date(entry.created_at);
    const createdLocal = createdDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (createdLocal === localToday) {
      return true;
    }

    // 3. Within 24 hours of creation
    const diffHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
    if (diffHours >= 0 && diffHours <= 24) {
      return true;
    }
  }

  return false;
}

/**
 * Helper to extract Thekedar (Contractor) name from entry or remarks fallback
 */
function extractThekedar(row) {
  if (row.contractor_name && typeof row.contractor_name === 'string' && row.contractor_name.trim()) {
    return row.contractor_name.trim();
  }
  if (row.remarks && typeof row.remarks === 'string') {
    const match = row.remarks.match(/\[(?:Thekedar|Contractor):\s*([^\]]+)\]/i) ||
                  row.remarks.match(/(?:Thekedar|Contractor):\s*([^\n,;]+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return 'General Assembly';
}

/**
 * Helper to extract Manpower (worker count) from entry or remarks fallback
 */
function extractManpower(row) {
  if (row.manpower !== undefined && row.manpower !== null && !isNaN(Number(row.manpower))) {
    return Number(row.manpower);
  }
  if (row.remarks && typeof row.remarks === 'string') {
    const match = row.remarks.match(/\[(?:Manpower|Workers|Labors|Labour):\s*(\d+)\]/i) ||
                  row.remarks.match(/(?:Manpower|Workers|Labors|Labour):\s*(\d+)/i);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}


/**
 * GET /api/production
 * Fetch production entries with cooler model, employee, and Thekedar details
 * Query params:
 *   - date (optional, YYYY-MM-DD, defaults to today; 'all' for all dates)
 *   - start_date & end_date (optional date range)
 *   - contractor_name / thekedar (optional filter)
 *   - model_id (optional filter)
 */
export async function GET(request) {
  try {
    const auth = await authenticateRequest({ requireActive: false });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);

    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');
    const contractorParam = searchParams.get('contractor_name') || searchParams.get('thekedar');
    const modelIdParam = searchParams.get('model_id');
    const plantParam = searchParams.get('plant');

    // Default to today unless specified or 'all' or date range given
    const todayStr = getTodayIST();
    const filterDate = startDateParam || endDateParam ? null : dateParam === null ? todayStr : dateParam === 'all' ? null : dateParam;

    const selectQuery = `
      id,
      quantity,
      production_date,
      remarks,
      created_at,
      model_id,
      employee_id,
      cooler_models (
        id,
        name,
        code
      ),
      employees (
        id,
        name,
        email,
        role
      )
    `;

    // Try selecting with contractor_name and manpower columns first
    let query = supabase
      .from('production_entries')
      .select(`contractor_name, manpower, plant, ${selectQuery}`)
      .order('production_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filterDate) {
      query = query.eq('production_date', filterDate);
    }
    if (startDateParam) {
      query = query.gte('production_date', startDateParam);
    }
    if (endDateParam) {
      query = query.lte('production_date', endDateParam);
    }
    if (modelIdParam) {
      query = query.eq('model_id', modelIdParam);
    }

    let { data: entries, error } = await query;

    // Fallback if contractor_name, manpower, or plant columns don't exist yet in Supabase schema cache
    if (error && (error.message?.includes('contractor_name') || error.message?.includes('manpower') || error.message?.includes('plant') || error.code === 'PGRST204')) {
      let fallbackQuery = supabase
        .from('production_entries')
        .select(selectQuery)
        .order('production_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filterDate) fallbackQuery = fallbackQuery.eq('production_date', filterDate);
      if (startDateParam) fallbackQuery = fallbackQuery.gte('production_date', startDateParam);
      if (endDateParam) fallbackQuery = fallbackQuery.lte('production_date', endDateParam);
      if (modelIdParam) fallbackQuery = fallbackQuery.eq('model_id', modelIdParam);

      const fallbackResult = await fallbackQuery;
      entries = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      throw error;
    }

    // Collect all unique Thekedars across all records for the dropdown filter
    const uniqueThekedarsSet = new Set();

    // Flatten / normalize helper fields for ease of frontend consumption
    let normalizedEntries = (entries || []).map((entry) => {
      const thekedar = extractThekedar(entry);
      const manpower = extractManpower(entry);
      if (thekedar) uniqueThekedarsSet.add(thekedar);

      const rawPlant = entry.plant || (entry.remarks?.match(/\[Plant:\s*([^\]]+)\]/i)?.[1]) || 'E41 G2';
      const plant = normalizePlant(rawPlant);

      // Clean remarks by removing duplicate tags
      const displayRemarks = (entry.remarks || '')
        .replace(/\[(?:Thekedar|Contractor):\s*[^\]]+\]/gi, '')
        .replace(/\[(?:Manpower|Workers|Labors|Labour):\s*[^\]]+\]/gi, '')
        .replace(/\[Plant:\s*[^\]]+\]/gi, '')
      return {
        ...entry,
        plant,
        contractor_name: thekedar || 'Unknown',
        thekedar_name: thekedar || 'Unknown',
        manpower: manpower || null,
        display_remarks: displayRemarks,
        model_name: entry.cooler_models?.name || 'Unknown Model',
        model_code: entry.cooler_models?.code || 'N/A',
        employee_name: entry.employees?.name || 'Unknown Employee',
      };
    });

    // Filter by plant if requested and not 'ALL'
    if (plantParam && plantParam !== 'ALL') {
      const targetP = normalizePlant(plantParam);
      normalizedEntries = normalizedEntries.filter((e) => e.plant === targetP);
    }

    // Apply contractor filter in memory if specified and not 'all'
    if (contractorParam && contractorParam !== 'all') {
      normalizedEntries = normalizedEntries.filter(
        (e) => e.contractor_name.toLowerCase() === contractorParam.toLowerCase()
      );
    }

    return NextResponse.json({
      success: true,
      entries: normalizedEntries,
      count: normalizedEntries.length,
      contractors: Array.from(uniqueThekedarsSet).sort(),
      date: filterDate || (startDateParam && endDateParam ? `${startDateParam} to ${endDateParam}` : 'all'),
    });
  } catch (error) {
    console.error('API /api/production GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch production entries' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/production
 * Create production entry and corresponding stock_transaction
 * Body can be either:
 *   - Single: { model_id, quantity, production_date, remarks }
 *   - Batch:  { entries: [{ model_id, quantity }], production_date, remarks }
 * Validations:
 *   - User authenticated & role in ('admin', 'production')
 *   - model_id exists and is_active = true
 *   - quantity > 0
 */
export async function POST(request) {
  try {
    const supabase = await createServerSupabase();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // 2. Validate employee & role
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, name, role, is_active')
      .eq('id', user.id)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { success: false, error: 'Employee record not found for this account.' },
        { status: 403 }
      );
    }

    if (!['owner', 'admin', 'production'].includes(employee.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden. Only Production, Admin, or Owner staff may log production entries.',
        },
        { status: 403 }
      );
    }

    // 3. Parse payload
    const body = await request.json();
    const todayStr = getTodayIST();
    const defaultContractor = (body.contractor_name || body.thekedar_name || body.thekedar || '').trim();
    const defaultManpower = body.manpower !== undefined && body.manpower !== '' && !isNaN(Number(body.manpower))
      ? parseInt(body.manpower, 10)
      : null;

    // Support both batch ({ entries: [...] }) and single ({ model_id, quantity })
    let rawItems = [];
    if (Array.isArray(body.entries) && body.entries.length > 0) {
      rawItems = body.entries.map((item) => ({
        model_id: item.model_id,
        quantity: Number(item.quantity),
        production_date: item.production_date || body.production_date || todayStr,
        remarks: item.remarks || body.remarks || null,
        contractor_name: (item.contractor_name || defaultContractor || '').trim(),
        manpower: item.manpower !== undefined && item.manpower !== '' && !isNaN(Number(item.manpower))
          ? parseInt(item.manpower, 10)
          : defaultManpower,
      }));
    } else if (body.model_id) {
      rawItems = [
        {
          model_id: body.model_id,
          quantity: Number(body.quantity),
          production_date: body.production_date || todayStr,
          remarks: body.remarks || null,
          contractor_name: defaultContractor,
          manpower: defaultManpower,
        },
      ];
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: model_id and quantity are required.' },
        { status: 400 }
      );
    }

    // 4. Validate all items
    for (const item of rawItems) {
      if (!item.model_id) {
        return NextResponse.json(
          { success: false, error: 'Model selection is required for each entry.' },
          { status: 400 }
        );
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid quantity "${item.quantity}". Quantity must be a positive whole number greater than 0.`,
          },
          { status: 400 }
        );
      }
    }

    // Fetch all cooler models referenced to verify they exist, are active, and belong to this plant
    const modelIds = [...new Set(rawItems.map((i) => i.model_id))];
    let modelsData = null;
    const { data: mDataWithPlant, error: mErrWithPlant } = await supabase
      .from('cooler_models')
      .select('id, name, code, is_active, description, manufacturing_plant')
      .in('id', modelIds);

    if (mErrWithPlant && (mErrWithPlant.code === 'PGRST204' || mErrWithPlant.message?.includes('manufacturing_plant'))) {
      const { data: fbData, error: fbErr } = await supabase
        .from('cooler_models')
        .select('id, name, code, is_active, description')
        .in('id', modelIds);
      if (fbErr || !fbData) throw new Error('Failed to verify cooler models.');
      modelsData = fbData;
    } else if (mErrWithPlant || !mDataWithPlant) {
      throw new Error('Failed to verify cooler models.');
    } else {
      modelsData = mDataWithPlant;
    }

    const modelsMap = Object.fromEntries(modelsData.map((m) => [m.id, m]));
    const targetPlant = normalizePlant(body.plant || employee.plant || 'E41 G2');

    for (const item of rawItems) {
      const model = modelsMap[item.model_id];
      if (!model) {
        return NextResponse.json(
          { success: false, error: `Model ID ${item.model_id} does not exist.` },
          { status: 400 }
        );
      }
      if (!model.is_active) {
        return NextResponse.json(
          {
            success: false,
            error: `Model "${model.name} (${model.code})" is marked inactive and cannot accept production entries.`,
          },
          { status: 400 }
        );
      }

      // Check plant manufacturing authorization
      const modelMfgPlant = resolveModelManufacturingPlant(model);
      if (targetPlant !== ALL_PLANTS_ID && modelMfgPlant !== targetPlant) {
        return NextResponse.json(
          {
            success: false,
            error: `Model "${model.code}" is manufactured exclusively at plant "${modelMfgPlant}". Plant "${targetPlant}" cannot assemble or record production for this model. (Material must be transferred via dispatch).`,
          },
          { status: 400 }
        );
      }
    }

    // 5. Insert production entries and create stock transactions
    const createdEntries = [];

    for (const item of rawItems) {
      const model = modelsMap[item.model_id];
      const thekedarName = item.contractor_name || 'General Assembly';

      // Ensure Thekedar and Manpower tags are in remarks for 100% backward-compatible persistence
      let combinedRemarks = item.remarks ? item.remarks.trim() : '';
      if (thekedarName && !combinedRemarks.includes(`[Thekedar: ${thekedarName}]`)) {
        combinedRemarks = combinedRemarks
          ? `[Thekedar: ${thekedarName}] ${combinedRemarks}`
          : `[Thekedar: ${thekedarName}]`;
      }
      if (item.manpower !== null && item.manpower !== undefined && item.manpower > 0) {
        if (!combinedRemarks.includes(`[Manpower: ${item.manpower}]`)) {
          combinedRemarks = combinedRemarks
            ? `[Manpower: ${item.manpower}] ${combinedRemarks}`
            : `[Manpower: ${item.manpower}]`;
        }
      }

      const targetPlant = normalizePlant(item.plant || body.plant || employee.plant || 'E41 G2');
      if (targetPlant) {
        combinedRemarks = `[Plant: ${targetPlant}] ${combinedRemarks}`.trim();
      }

      const insertPayload = {
        model_id: item.model_id,
        quantity: item.quantity,
        production_date: item.production_date,
        remarks: combinedRemarks || null,
        employee_id: employee.id,
        contractor_name: thekedarName,
        plant: targetPlant,
        ...(item.manpower && item.manpower > 0 ? { manpower: item.manpower } : {}),
      };

      const selectFields = `
        id,
        model_id,
        quantity,
        production_date,
        remarks,
        created_at,
        cooler_models (id, name, code),
        employees (id, name)
      `;

      // Try inserting with contractor_name, manpower, and plant columns
      let { data: prodEntry, error: prodErr } = await supabase
        .from('production_entries')
        .insert(insertPayload)
        .select(selectFields)
        .single();

      // If contractor_name, manpower, or plant column doesn't exist yet, retry without them
      if (prodErr && (prodErr.message?.includes('contractor_name') || prodErr.message?.includes('manpower') || prodErr.message?.includes('plant') || prodErr.code === 'PGRST204')) {
        delete insertPayload.contractor_name;
        delete insertPayload.manpower;
        delete insertPayload.plant;
        const retryResult = await supabase
          .from('production_entries')
          .insert(insertPayload)
          .select(selectFields)
          .single();
        prodEntry = retryResult.data;
        prodErr = retryResult.error;
      }

      if (prodErr || !prodEntry) {
        throw new Error(prodErr?.message || 'Failed to insert production entry');
      }

      // Insert into stock_transactions with plant
      const stockNote = `Production: +${item.quantity} units of ${model.code} at ${targetPlant} (Thekedar: ${thekedarName}${item.manpower ? `, Manpower: ${item.manpower}` : ''})`;

      let stockPayload = {
        model_id: item.model_id,
        transaction_type: 'production',
        quantity: item.quantity,
        reference_id: prodEntry.id,
        employee_id: employee.id,
        plant: targetPlant,
        notes: stockNote,
      };

      let { error: stockErr } = await supabase
        .from('stock_transactions')
        .insert(stockPayload);

      if (stockErr && (stockErr.message?.includes('plant') || stockErr.code === 'PGRST204')) {
        delete stockPayload.plant;
        stockPayload.notes = `[Plant: ${targetPlant}] ${stockNote}`;
        const fbStock = await supabase.from('stock_transactions').insert(stockPayload);
        stockErr = fbStock.error;
      }

      if (stockErr) {
        // Rollback production entry
        await supabase.from('production_entries').delete().eq('id', prodEntry.id);
        throw new Error(`Stock ledger error: ${stockErr.message}`);
      }

      createdEntries.push({
        ...prodEntry,
        contractor_name: thekedarName,
        thekedar_name: thekedarName,
        manpower: item.manpower || null,
        model_name: prodEntry.cooler_models?.name || model.name,
        model_code: prodEntry.cooler_models?.code || model.code,
        employee_name: prodEntry.employees?.name || employee.name,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message:
          createdEntries.length === 1
            ? `Successfully logged ${createdEntries[0].quantity} units of ${createdEntries[0].model_code}`
            : `Successfully logged ${createdEntries.length} production entries`,
        entry: createdEntries[0],
        entries: createdEntries,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('API /api/production POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error while logging production' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/production
 * Edit production entry (Quantity, Model, Thekedar, Remarks) or Batch Thekedar reassign.
 * Permissions:
 *   - Admin: Can edit any entry anytime, or batch reassign Thekedars.
 *   - Production Employee: Can ONLY edit entries they personally logged, and ONLY on the date they were added (today).
 */
export async function PATCH(request) {
  try {
    const userSupabase = await createServerSupabase();
    const adminSupabase = createAdminSupabase();
    const db = adminSupabase || userSupabase;

    // 1. Authenticate user
    const {
      data: { user },
      error: authErr,
    } = await userSupabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required. Please log in.' }, { status: 401 });
    }

    // 2. Fetch employee details
    const { data: employee, error: empErr } = await userSupabase
      .from('employees')
      .select('id, name, role, is_active')
      .eq('id', user.id)
      .single();

    if (empErr || !employee) {
      return NextResponse.json({ success: false, error: 'Employee account not found.' }, { status: 403 });
    }

    const isAdmin = employee.role === 'admin';
    const isProduction = employee.role === 'production';

    if (!isAdmin && !isProduction) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Only Production or Admin staff may edit production entries.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, ids, contractor_name, model_id, quantity, remarks, manpower } = body;

    // CASE A: Admin Batch Contractor Update
    if (ids && Array.isArray(ids) && ids.length > 0) {
      if (!isAdmin) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Only Admins can batch update Thekedars.' },
          { status: 403 }
        );
      }
      const cleanContractor = (contractor_name || '').trim();
      if (!cleanContractor) {
        return NextResponse.json({ success: false, error: 'Contractor name cannot be empty.' }, { status: 400 });
      }

      let { data: updated, error: updateErr } = await db
        .from('production_entries')
        .update({ contractor_name: cleanContractor })
        .in('id', ids)
        .select('id, production_date, quantity, remarks, contractor_name');

      if (updateErr) {
        const { data: fallback, error: fbErr } = await db
          .from('production_entries')
          .update({ remarks: `[Thekedar: ${cleanContractor}]` })
          .in('id', ids)
          .select('id, production_date, quantity, remarks');
        if (fbErr) throw fbErr;
        updated = fallback;
      }

      return NextResponse.json({
        success: true,
        message: `Updated ${ids.length} entry/entries to Thekedar "${cleanContractor}".`,
        data: updated,
      });
    }

    // CASE B: Single Entry Update
    if (!id) {
      return NextResponse.json({ success: false, error: 'Production entry ID is required.' }, { status: 400 });
    }

    // Fetch the existing production entry to verify ownership and creation date
    const { data: targetEntry, error: fetchErr } = await db
      .from('production_entries')
      .select('id, model_id, quantity, production_date, remarks, employee_id, created_at, contractor_name')
      .eq('id', id)
      .single();

    if (fetchErr || !targetEntry) {
      return NextResponse.json({ success: false, error: 'Production entry not found.' }, { status: 404 });
    }

    // Strict Permissions:
    // If not Admin, user MUST be the employee who logged it, AND entry MUST be from today!
    if (!isAdmin) {
      if (targetEntry.employee_id && targetEntry.employee_id !== employee.id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Permission denied. You can only edit production entries that you personally logged.',
          },
          { status: 403 }
        );
      }

      if (!isEntryFromToday(targetEntry)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Locked: Production entries can only be edited on the day they were created.',
          },
          { status: 403 }
        );
      }
    }

    // Prepare update payload
    const updatePayload = {};
    let newQuantity = targetEntry.quantity;
    let newModelId = targetEntry.model_id;
    let newContractor = targetEntry.contractor_name || extractThekedar(targetEntry);
    let newManpower = targetEntry.manpower !== undefined ? targetEntry.manpower : extractManpower(targetEntry);

    if (quantity !== undefined) {
      const q = Number(quantity);
      if (!Number.isInteger(q) || q <= 0) {
        return NextResponse.json(
          { success: false, error: 'Quantity must be a positive whole number greater than 0.' },
          { status: 400 }
        );
      }

      // Negative stock guard: if reducing quantity, verify stock doesn't fall below zero
      if (q < targetEntry.quantity) {
        const reduction = targetEntry.quantity - q;
        const { data: stockRow } = await db
          .from('current_stock')
          .select('current_stock')
          .eq('model_id', targetEntry.model_id)
          .maybeSingle();
        const available = stockRow?.current_stock ?? 0;
        if (available < reduction) {
          return NextResponse.json(
            {
              success: false,
              error: `Cannot reduce quantity by ${reduction} units. Current available stock is only ${available} units (some units may have already been dispatched).`,
            },
            { status: 400 }
          );
        }
      }

      updatePayload.quantity = q;
      newQuantity = q;
    }

    if (model_id !== undefined && model_id !== targetEntry.model_id) {
      const { data: modelData, error: modelErr } = await db
        .from('cooler_models')
        .select('id, name, code, is_active')
        .eq('id', model_id)
        .single();
      if (modelErr || !modelData) {
        return NextResponse.json({ success: false, error: 'Selected cooler model not found.' }, { status: 400 });
      }

      // Negative stock guard: verify current stock of original model has at least targetEntry.quantity
      const { data: origStockRow } = await db
        .from('current_stock')
        .select('current_stock')
        .eq('model_id', targetEntry.model_id)
        .maybeSingle();
      const origAvailable = origStockRow?.current_stock ?? 0;
      if (origAvailable < targetEntry.quantity) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot change model. Current available stock of original model is only ${origAvailable} units, which is less than the entry's ${targetEntry.quantity} units (some units were already dispatched).`,
          },
          { status: 400 }
        );
      }

      updatePayload.model_id = model_id;
      newModelId = model_id;
    }

    if (contractor_name !== undefined) {
      const clean = contractor_name.trim();
      if (clean) {
        updatePayload.contractor_name = clean;
        newContractor = clean;
      }
    }

    if (manpower !== undefined) {
      if (manpower === '' || manpower === null) {
        updatePayload.manpower = null;
        newManpower = null;
      } else {
        const mp = Number(manpower);
        if (!isNaN(mp) && mp > 0) {
          updatePayload.manpower = parseInt(mp, 10);
          newManpower = parseInt(mp, 10);
        }
      }
    }

    // Format remarks to retain Thekedar & Manpower tags for backward compatibility
    let cleanRemarks = remarks !== undefined ? (remarks || '').trim() : (targetEntry.remarks || '');
    cleanRemarks = cleanRemarks
      .replace(/\[(?:Thekedar|Contractor):\s*[^\]]+\]/gi, '')
      .replace(/\[(?:Manpower|Workers|Labors|Labour):\s*[^\]]+\]/gi, '')
      .trim();
    if (newContractor && newContractor !== 'General Assembly') {
      cleanRemarks = cleanRemarks ? `[Thekedar: ${newContractor}] ${cleanRemarks}` : `[Thekedar: ${newContractor}]`;
    }
    if (newManpower && newManpower > 0) {
      cleanRemarks = cleanRemarks ? `[Manpower: ${newManpower}] ${cleanRemarks}` : `[Manpower: ${newManpower}]`;
    }
    updatePayload.remarks = cleanRemarks || null;

    // 1. Update production_entries
    const selectFields = `
      id,
      quantity,
      production_date,
      remarks,
      created_at,
      model_id,
      employee_id,
      cooler_models (id, name, code),
      employees (id, name)
    `;

    let { data: updatedEntry, error: updateErr } = await db
      .from('production_entries')
      .update(updatePayload)
      .eq('id', id)
      .select(selectFields)
      .single();

    if (updateErr && (updateErr.message?.includes('contractor_name') || updateErr.message?.includes('manpower') || updateErr.code === 'PGRST204')) {
      delete updatePayload.contractor_name;
      delete updatePayload.manpower;
      const retry = await db
        .from('production_entries')
        .update(updatePayload)
        .eq('id', id)
        .select(selectFields)
        .single();
      updatedEntry = retry.data;
      updateErr = retry.error;
    }

    if (updateErr || !updatedEntry) {
      throw new Error(updateErr?.message || 'Failed to update production entry');
    }

    // 2. Synchronize stock_transactions to keep inventory ledger exact
    const modelCode = updatedEntry.cooler_models?.code || 'Units';
    const stockNote = `Production: +${newQuantity} units of ${modelCode} (Thekedar: ${newContractor}${newManpower ? `, Manpower: ${newManpower}` : ''})`;

    const { data: existingTx } = await db
      .from('stock_transactions')
      .select('id')
      .eq('reference_id', id)
      .eq('transaction_type', 'production')
      .maybeSingle();

    if (existingTx) {
      await db
        .from('stock_transactions')
        .update({
          model_id: newModelId,
          quantity: newQuantity,
          notes: stockNote,
        })
        .eq('id', existingTx.id);
    } else {
      await db
        .from('stock_transactions')
        .insert({
          model_id: newModelId,
          transaction_type: 'production',
          quantity: newQuantity,
          reference_id: id,
          employee_id: employee.id,
          notes: stockNote,
        });
    }

    return NextResponse.json({
      success: true,
      message: `Production entry updated successfully (+${newQuantity} units).`,
      entry: {
        ...updatedEntry,
        contractor_name: newContractor,
        thekedar_name: newContractor,
        manpower: newManpower,
        model_name: updatedEntry.cooler_models?.name || 'Cooler Model',
        model_code: updatedEntry.cooler_models?.code || 'N/A',
        employee_name: updatedEntry.employees?.name || employee.name,
      },
    });
  } catch (error) {
    console.error('API /api/production PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error updating production entry' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/production
 * Delete a production entry and reverse its stock transaction.
 * Permissions:
 *   - Admin: Can delete any entry anytime.
 *   - Production Employee: Can ONLY delete entries they personally logged, and ONLY on the date they were added (today).
 */
export async function DELETE(request) {
  try {
    const userSupabase = await createServerSupabase();
    const adminSupabase = createAdminSupabase();
    const db = adminSupabase || userSupabase;

    // 1. Authenticate user
    const {
      data: { user },
      error: authErr,
    } = await userSupabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required. Please log in.' }, { status: 401 });
    }

    // 2. Fetch employee details
    const { data: employee, error: empErr } = await userSupabase
      .from('employees')
      .select('id, name, role, is_active')
      .eq('id', user.id)
      .single();

    if (empErr || !employee) {
      return NextResponse.json({ success: false, error: 'Employee account not found.' }, { status: 403 });
    }

    const isAdmin = employee.role === 'admin';
    const isProduction = employee.role === 'production';

    if (!isAdmin && !isProduction) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Only Production or Admin staff may delete production entries.' },
        { status: 403 }
      );
    }

    // Get entry ID from URL search params or request body
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');
    if (!id) {
      try {
        const body = await request.json();
        id = body?.id;
      } catch (e) {}
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Production entry ID is required.' }, { status: 400 });
    }

    // Fetch existing entry to check ownership and creation date
    const { data: targetEntry, error: fetchErr } = await db
      .from('production_entries')
      .select('id, quantity, production_date, employee_id, created_at, model_id, cooler_models(code, name)')
      .eq('id', id)
      .single();

    if (fetchErr || !targetEntry) {
      return NextResponse.json({ success: false, error: 'Production entry not found.' }, { status: 404 });
    }

    // Strict Permissions:
    // If not Admin, user MUST be the employee who logged it, AND entry MUST be from today!
    if (!isAdmin) {
      if (targetEntry.employee_id && targetEntry.employee_id !== employee.id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Permission denied. You can only delete production entries that you personally logged.',
          },
          { status: 403 }
        );
      }

      if (!isEntryFromToday(targetEntry)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Locked: Production entries can only be deleted on the day they were created.',
          },
          { status: 403 }
        );
      }
    }

    // Negative stock guard: verify current available stock does not drop below zero
    const { data: stockRow } = await db
      .from('current_stock')
      .select('current_stock')
      .eq('model_id', targetEntry.model_id)
      .maybeSingle();
    const available = stockRow?.current_stock ?? 0;
    if (available < targetEntry.quantity) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete entry: only ${available} units available in stock, but this entry added ${targetEntry.quantity} units. Some units have already been dispatched.`,
        },
        { status: 400 }
      );
    }

    // 1. Delete associated stock transaction first so stock is reduced immediately
    const { error: stockDelErr } = await db
      .from('stock_transactions')
      .delete()
      .eq('reference_id', id)
      .eq('transaction_type', 'production');

    if (stockDelErr) {
      console.warn('Warning deleting stock transaction for production entry:', stockDelErr);
    }

    // 2. Delete production entry
    const { error: delErr } = await db
      .from('production_entries')
      .delete()
      .eq('id', id);

    if (delErr) {
      throw new Error(delErr.message || 'Failed to delete production entry');
    }

    const modelLabel = targetEntry.cooler_models?.code || 'Cooler';
    return NextResponse.json({
      success: true,
      message: `Deleted production entry of ${targetEntry.quantity} units (${modelLabel}) and updated stock ledger.`,
      deletedId: id,
    });
  } catch (error) {
    console.error('API /api/production DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error deleting production entry' },
      { status: 500 }
    );
  }
}


