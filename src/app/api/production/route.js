import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

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
    const supabase = await createServerSupabase();
    const { searchParams } = new URL(request.url);

    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');
    const contractorParam = searchParams.get('contractor_name') || searchParams.get('thekedar');
    const modelIdParam = searchParams.get('model_id');

    // Default to today unless specified or 'all' or date range given
    const todayStr = new Date().toISOString().split('T')[0];
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

    // Try selecting with contractor_name column first
    let query = supabase
      .from('production_entries')
      .select(`contractor_name, ${selectQuery}`)
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

    // Fallback if contractor_name column doesn't exist yet in Supabase schema cache
    if (error && (error.message?.includes('contractor_name') || error.code === 'PGRST204')) {
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
      if (thekedar) uniqueThekedarsSet.add(thekedar);

      // Clean remarks by removing duplicate tag
      const displayRemarks = (entry.remarks || '')
        .replace(/\[(?:Thekedar|Contractor):\s*[^\]]+\]/gi, '')
        .trim();

      return {
        ...entry,
        contractor_name: thekedar,
        thekedar_name: thekedar,
        display_remarks: displayRemarks,
        model_name: entry.cooler_models?.name || 'Unknown Model',
        model_code: entry.cooler_models?.code || 'N/A',
        employee_name: entry.employees?.name || 'Unknown Employee',
      };
    });

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

    if (!['admin', 'production'].includes(employee.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden. Only Production or Admin staff may log production entries.',
        },
        { status: 403 }
      );
    }

    // 3. Parse payload
    const body = await request.json();
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultContractor = (body.contractor_name || body.thekedar_name || body.thekedar || '').trim();

    // Support both batch ({ entries: [...] }) and single ({ model_id, quantity })
    let rawItems = [];
    if (Array.isArray(body.entries) && body.entries.length > 0) {
      rawItems = body.entries.map((item) => ({
        model_id: item.model_id,
        quantity: Number(item.quantity),
        production_date: item.production_date || body.production_date || todayStr,
        remarks: item.remarks || body.remarks || null,
        contractor_name: (item.contractor_name || defaultContractor || '').trim(),
      }));
    } else if (body.model_id) {
      rawItems = [
        {
          model_id: body.model_id,
          quantity: Number(body.quantity),
          production_date: body.production_date || todayStr,
          remarks: body.remarks || null,
          contractor_name: defaultContractor,
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

    // Fetch all cooler models referenced to verify they exist and are active
    const modelIds = [...new Set(rawItems.map((i) => i.model_id))];
    const { data: modelsData, error: modelsError } = await supabase
      .from('cooler_models')
      .select('id, name, code, is_active')
      .in('id', modelIds);

    if (modelsError || !modelsData) {
      throw new Error('Failed to verify cooler models.');
    }

    const modelsMap = Object.fromEntries(modelsData.map((m) => [m.id, m]));
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
    }

    // 5. Insert production entries and create stock transactions
    const createdEntries = [];

    for (const item of rawItems) {
      const model = modelsMap[item.model_id];
      const thekedarName = item.contractor_name || 'General Assembly';

      // Ensure Thekedar tag is in remarks for 100% backward-compatible persistence
      let combinedRemarks = item.remarks ? item.remarks.trim() : '';
      if (thekedarName && !combinedRemarks.includes(`[Thekedar: ${thekedarName}]`)) {
        combinedRemarks = combinedRemarks
          ? `[Thekedar: ${thekedarName}] ${combinedRemarks}`
          : `[Thekedar: ${thekedarName}]`;
      }

      const insertPayload = {
        model_id: item.model_id,
        quantity: item.quantity,
        production_date: item.production_date,
        remarks: combinedRemarks || null,
        employee_id: employee.id,
        contractor_name: thekedarName,
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

      // Try inserting with contractor_name column
      let { data: prodEntry, error: prodErr } = await supabase
        .from('production_entries')
        .insert(insertPayload)
        .select(selectFields)
        .single();

      // If contractor_name column doesn't exist yet, retry without it (remarks tag holds Thekedar)
      if (prodErr && (prodErr.message?.includes('contractor_name') || prodErr.code === 'PGRST204')) {
        delete insertPayload.contractor_name;
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

      // Insert into stock_transactions
      const stockNote = `Production: +${item.quantity} units of ${model.code} (Thekedar: ${thekedarName})`;

      const { error: stockErr } = await supabase
        .from('stock_transactions')
        .insert({
          model_id: item.model_id,
          transaction_type: 'production',
          quantity: item.quantity,
          reference_id: prodEntry.id,
          employee_id: employee.id,
          notes: stockNote,
        });

      if (stockErr) {
        // Rollback production entry
        await supabase.from('production_entries').delete().eq('id', prodEntry.id);
        throw new Error(`Stock ledger error: ${stockErr.message}`);
      }

      createdEntries.push({
        ...prodEntry,
        contractor_name: thekedarName,
        thekedar_name: thekedarName,
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
