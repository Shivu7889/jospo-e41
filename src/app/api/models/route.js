import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/models
 * List cooler models with their current stock from current_stock view
 * Query param: active_only (boolean, default: true)
 */
export async function GET(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const activeOnlyParam = searchParams.get('active_only');
    const activeOnly = activeOnlyParam !== 'false';

    // 1. Fetch cooler models
    let modelsQuery = supabase
      .from('cooler_models')
      .select('id, name, code, description, qr_data, is_active, created_at, updated_at')
      .order('code', { ascending: true });

    if (activeOnly) {
      modelsQuery = modelsQuery.eq('is_active', true);
    }

    const { data: models, error: modelsError } = await modelsQuery;
    if (modelsError) {
      throw modelsError;
    }

    // 2. Fetch stock levels from current_stock view
    let stockMap = {};
    const { data: stockData, error: stockError } = await supabase
      .from('current_stock')
      .select('model_id, current_stock');

    if (!stockError && stockData) {
      stockData.forEach((row) => {
        stockMap[row.model_id] = Number(row.current_stock ?? 0);
      });
    } else {
      // Fallback: calculate stock from stock_transactions directly
      try {
        const { data: txData } = await supabase
          .from('stock_transactions')
          .select('model_id, quantity');
        if (txData) {
          txData.forEach((tx) => {
            stockMap[tx.model_id] = (stockMap[tx.model_id] || 0) + (tx.quantity || 0);
          });
        }
      } catch (fbErr) {
        console.warn('Fallback stock calculation error:', fbErr);
      }
    }

    // 3. Combine model data with current stock
    const modelsWithStock = (models || []).map((m) => ({
      ...m,
      current_stock: stockMap[m.id] ?? 0,
    }));

    return NextResponse.json({
      success: true,
      models: modelsWithStock,
      total: modelsWithStock.length,
    });
  } catch (error) {
    console.error('API /api/models GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch cooler models' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/models
 * Create a new cooler model
 * Body: { name, code, description, qr_data }
 * Required role: admin
 */
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // 3. Parse and validate body
    const body = await request.json();
    const { name, code, description, qr_data } = body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    const trimmedQr = typeof qr_data === 'string' ? qr_data.trim() : '';
    const trimmedDesc = typeof description === 'string' ? description.trim() : null;

    if (!trimmedName) {
      return NextResponse.json(
        { success: false, error: 'Model Name is required.' },
        { status: 400 }
      );
    }

    if (!trimmedCode) {
      return NextResponse.json(
        { success: false, error: 'Model Code is required.' },
        { status: 400 }
      );
    }

    if (!trimmedQr) {
      return NextResponse.json(
        { success: false, error: 'QR Data is required.' },
        { status: 400 }
      );
    }

    // Check code uniqueness
    const { data: existingCode } = await supabase
      .from('cooler_models')
      .select('id, code')
      .ilike('code', trimmedCode)
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json(
        { success: false, error: `Model code "${trimmedCode}" already exists.` },
        { status: 400 }
      );
    }

    // Check QR data uniqueness
    const { data: existingQR } = await supabase
      .from('cooler_models')
      .select('id, qr_data')
      .eq('qr_data', trimmedQr)
      .maybeSingle();

    if (existingQR) {
      return NextResponse.json(
        { success: false, error: `QR data "${trimmedQr}" is already in use by another model.` },
        { status: 400 }
      );
    }

    // 4. Insert new cooler model
    const { data: newModel, error: insertError } = await supabase
      .from('cooler_models')
      .insert({
        name: trimmedName,
        code: trimmedCode,
        description: trimmedDesc || null,
        qr_data: trimmedQr,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json(
      {
        success: true,
        message: `Model ${trimmedCode} created successfully.`,
        model: {
          ...newModel,
          current_stock: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('API /api/models POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error while creating model' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/models
 * Update model status (toggle active/inactive)
 * Body: { id, is_active }
 * Required role: admin
 */
export async function PATCH(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const body = await request.json();
    const { id, is_active, name, description } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Model id is required' },
        { status: 400 }
      );
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
    };

    if (typeof is_active === 'boolean') {
      updatePayload.is_active = is_active;
    }
    if (typeof name === 'string' && name.trim()) {
      updatePayload.name = name.trim();
    }
    if (typeof description !== 'undefined') {
      updatePayload.description = description ? description.trim() : null;
    }

    const { data: updatedModel, error: updateError } = await supabase
      .from('cooler_models')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      model: updatedModel,
    });
  } catch (error) {
    console.error('API /api/models PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update model' },
      { status: 500 }
    );
  }
}
