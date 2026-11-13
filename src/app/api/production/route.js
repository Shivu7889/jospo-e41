import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/production
 * Fetch production entries with cooler model and employee details
 * Query params:
 *   - date (optional, YYYY-MM-DD, defaults to today; 'all' for all dates)
 *   - model_id (optional filter)
 */
export async function GET(request) {
  try {
    const supabase = await createServerSupabase();
    const { searchParams } = new URL(request.url);

    const dateParam = searchParams.get('date');
    const modelIdParam = searchParams.get('model_id');

    // Default to today unless specified or 'all'
    const todayStr = new Date().toISOString().split('T')[0];
    const filterDate = dateParam === null ? todayStr : dateParam === 'all' ? null : dateParam;

    let query = supabase
      .from('production_entries')
      .select(`
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
      `)
      .order('created_at', { ascending: false });

    if (filterDate) {
      query = query.eq('production_date', filterDate);
    }

    if (modelIdParam) {
      query = query.eq('model_id', modelIdParam);
    }

    const { data: entries, error } = await query;

    if (error) {
      throw error;
    }

    // Flatten / normalize helper fields for ease of frontend consumption
    const normalizedEntries = (entries || []).map((entry) => ({
      ...entry,
      model_name: entry.cooler_models?.name || 'Unknown Model',
      model_code: entry.cooler_models?.code || 'N/A',
      employee_name: entry.employees?.name || 'Unknown Employee',
    }));

    return NextResponse.json({
      success: true,
      entries: normalizedEntries,
      count: normalizedEntries.length,
      date: filterDate || 'all',
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

    // Support both batch ({ entries: [...] }) and single ({ model_id, quantity })
    let rawItems = [];
    if (Array.isArray(body.entries) && body.entries.length > 0) {
      rawItems = body.entries.map((item) => ({
        model_id: item.model_id,
        quantity: Number(item.quantity),
        production_date: item.production_date || body.production_date || todayStr,
        remarks: item.remarks || body.remarks || null,
      }));
    } else if (body.model_id) {
      rawItems = [
        {
          model_id: body.model_id,
          quantity: Number(body.quantity),
          production_date: body.production_date || todayStr,
          remarks: body.remarks || null,
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

      // Insert into production_entries
      const { data: prodEntry, error: prodErr } = await supabase
        .from('production_entries')
        .insert({
          model_id: item.model_id,
          quantity: item.quantity,
          production_date: item.production_date,
          remarks: item.remarks ? item.remarks.trim() : null,
          employee_id: employee.id,
        })
        .select(`
          id,
          model_id,
          quantity,
          production_date,
          remarks,
          created_at,
          cooler_models (id, name, code),
          employees (id, name)
        `)
        .single();

      if (prodErr || !prodEntry) {
        throw new Error(prodErr?.message || 'Failed to insert production entry');
      }

      // Insert into stock_transactions
      const { error: stockErr } = await supabase
        .from('stock_transactions')
        .insert({
          model_id: item.model_id,
          transaction_type: 'production',
          quantity: item.quantity,
          reference_id: prodEntry.id,
          employee_id: employee.id,
          notes: item.remarks?.trim()
            ? `Production: ${item.remarks.trim()}`
            : `Production entry: +${item.quantity} units of ${model.code}`,
        });

      if (stockErr) {
        // Rollback production entry
        await supabase.from('production_entries').delete().eq('id', prodEntry.id);
        throw new Error(`Stock ledger error: ${stockErr.message}`);
      }

      createdEntries.push({
        ...prodEntry,
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
