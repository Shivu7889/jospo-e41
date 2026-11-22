import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import {
  normalizePlant,
  resolveModelManufacturingPlant,
  formatModelDescription,
  isModelManufacturableAtPlant,
  isModelVisibleInPlantStock,
  DEFAULT_PLANT_ID,
  ALL_PLANTS_ID,
} from '@/lib/plants';
import { createAdminSupabase } from '@/lib/supabase-server';
import { clearStockCache } from '@/app/api/stock/route';

export const dynamic = 'force-dynamic';

// Server-side in-memory cache for models (TTL: 30s)
const modelsCache = new Map();
const MODELS_CACHE_TTL = 30 * 1000;

export function clearModelsCache() {
  modelsCache.clear();
}

/**
 * GET /api/models
 * List cooler models with their current stock from current_stock view
 * Query params:
 * - active_only (boolean, default: true)
 * - for_plant (string, e.g. 'E41 G2', 'D4', 'C116', 'ALL')
 * - view ('production' | 'stock' | 'all')
 */
export async function GET(request) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const activeOnlyParam = searchParams.get('active_only');
    const activeOnly = activeOnlyParam !== 'false';
    const forPlant = searchParams.get('for_plant') || '';
    const view = searchParams.get('view') || '';
    const forceRefresh = searchParams.get('refresh') === 'true';

    const cacheKey = `models_${activeOnly}_${forPlant}_${view}`;
    if (!forceRefresh && modelsCache.has(cacheKey)) {
      const cached = modelsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.data, {
          headers: { 'X-Cache': 'HIT' },
        });
      }
    }

    // 1. Fetch cooler models (dual-mode: native manufacturing_plant column with fallback)
    let models = [];
    let queryWithPlant = supabase
      .from('cooler_models')
      .select('id, name, code, description, qr_data, is_active, created_at, updated_at, manufacturing_plant')
      .order('code', { ascending: true });

    if (activeOnly) {
      queryWithPlant = queryWithPlant.eq('is_active', true);
    }

    const { data: dataWithPlant, error: errorWithPlant } = await queryWithPlant;

    if (errorWithPlant && (errorWithPlant.code === 'PGRST204' || errorWithPlant.message?.includes('manufacturing_plant'))) {
      let fallbackQuery = supabase
        .from('cooler_models')
        .select('id, name, code, description, qr_data, is_active, created_at, updated_at')
        .order('code', { ascending: true });

      if (activeOnly) {
        fallbackQuery = fallbackQuery.eq('is_active', true);
      }
      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (fallbackError) throw fallbackError;
      models = fallbackData || [];
    } else if (errorWithPlant) {
      throw errorWithPlant;
    } else {
      models = dataWithPlant || [];
    }

    // 2. Fetch stock levels (skip entirely for production view to make dropdown load in ~50ms)
    let stockMap = {};
    const normalizedForPlant = forPlant && forPlant !== ALL_PLANTS_ID ? normalizePlant(forPlant) : null;

    if (view === 'production' || view === 'catalog') {
      // Production & catalog dropdowns do not need stock balances; skip heavy queries!
    } else if (normalizedForPlant) {
      // Query only transactions for target plant to leverage idx_stock_transactions_plant index
      let txQuery = supabase
        .from('stock_transactions')
        .select('model_id, quantity')
        .eq('plant', normalizedForPlant);

      let { data: transactions, error: txErr } = await txQuery;
      if (txErr && (txErr.message?.includes('plant') || txErr.code === 'PGRST204')) {
        const fbTx = await supabase.from('stock_transactions').select('model_id, quantity');
        transactions = fbTx.data || [];
      }

      (transactions || []).forEach((tx) => {
        const mid = tx.model_id;
        stockMap[mid] = (stockMap[mid] || 0) + (Number(tx.quantity) || 0);
      });
    } else {
      const { data: stockData, error: stockError } = await supabase
        .from('current_stock')
        .select('model_id, current_stock');

      if (!stockError && stockData) {
        stockData.forEach((row) => {
          stockMap[row.model_id] = Number(row.current_stock ?? 0);
        });
      } else {
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
    }

    // 3. Attach normalized manufacturing_plant and plant-specific stock
    let modelsWithStock = (models || []).map((m) => {
      const resolvedPlant = resolveModelManufacturingPlant(m);
      return {
        ...m,
        manufacturing_plant: resolvedPlant,
        current_stock: stockMap[m.id] ?? 0,
      };
    });

    // 4. Apply plant filtering based on user perspective:
    if (normalizedForPlant) {
      if (view === 'production') {
        // Can only assemble/manufacture models assigned to this plant
        modelsWithStock = modelsWithStock.filter((m) => isModelManufacturableAtPlant(m, normalizedForPlant));
      } else if (view === 'dispatch') {
        if (normalizedForPlant === 'D4') {
          // Keep all models for D4, each with D4's own warehouse stock
        } else {
          modelsWithStock = modelsWithStock.filter(
            (m) => m.manufacturing_plant === normalizedForPlant || (stockMap[m.id] || 0) > 0
          );
        }
      } else if (view === 'stock') {
        modelsWithStock = modelsWithStock.filter((m) =>
          isModelVisibleInPlantStock(m, normalizedForPlant, stockMap[m.id])
        );
      } else {
        if (normalizedForPlant === 'D4') {
          // D4 hub shows all models with D4 stock
        } else {
          modelsWithStock = modelsWithStock.filter(
            (m) => m.manufacturing_plant === normalizedForPlant || (stockMap[m.id] || 0) > 0
          );
        }
      }
    }

    const resultPayload = {
      success: true,
      models: modelsWithStock,
      total: modelsWithStock.length,
    };

    if (modelsCache.size > 100) modelsCache.clear();
    modelsCache.set(cacheKey, {
      data: resultPayload,
      expiresAt: Date.now() + MODELS_CACHE_TTL,
    });

    return NextResponse.json(resultPayload);
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
 * Body: { name, code, description, qr_data, manufacturing_plant }
 * Required role: admin or owner
 */
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin', 'owner', 'production'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const body = await request.json();
    const { name, code, description, qr_data, manufacturing_plant } = body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    let trimmedQr = typeof qr_data === 'string' ? qr_data.trim() : '';

    // Auto-generate QR data if omitted
    if (!trimmedQr && trimmedCode) {
      trimmedQr = `JOSPO-${trimmedCode.replace(/[^A-Z0-9]/g, '')}`;
    }

    const userPlant = auth.employee?.plant ? normalizePlant(auth.employee.plant) : null;
    const assignedPlant = normalizePlant(manufacturing_plant || userPlant || DEFAULT_PLANT_ID);
    const formattedDesc = formatModelDescription(description || '', assignedPlant);

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
    let { data: existingQR } = await supabase
      .from('cooler_models')
      .select('id, qr_data')
      .eq('qr_data', trimmedQr)
      .maybeSingle();

    if (existingQR) {
      // If QR was auto-generated, append random 4-digit number to avoid conflict
      if (!qr_data || !qr_data.trim()) {
        trimmedQr = `${trimmedQr}-${Math.floor(1000 + Math.random() * 9000)}`;
      } else {
        return NextResponse.json(
          { success: false, error: `QR data "${trimmedQr}" is already in use by another model.` },
          { status: 400 }
        );
      }
    }

    // Insert new cooler model (try with manufacturing_plant column, fallback to description tag)
    let newModel = null;
    let insertRes = await supabase
      .from('cooler_models')
      .insert({
        name: trimmedName,
        code: trimmedCode,
        description: formattedDesc,
        qr_data: trimmedQr,
        manufacturing_plant: assignedPlant,
        is_active: true,
      })
      .select()
      .single();

    if (insertRes.error && (insertRes.error.code === 'PGRST204' || insertRes.error.message?.includes('manufacturing_plant'))) {
      const fallbackInsert = await supabase
        .from('cooler_models')
        .insert({
          name: trimmedName,
          code: trimmedCode,
          description: formattedDesc,
          qr_data: trimmedQr,
          is_active: true,
        })
        .select()
        .single();
      if (fallbackInsert.error) throw fallbackInsert.error;
      newModel = fallbackInsert.data;
    } else if (insertRes.error) {
      throw insertRes.error;
    } else {
      newModel = insertRes.data;
    }

    clearModelsCache();

    return NextResponse.json(
      {
        success: true,
        message: `Model ${trimmedCode} created successfully (Assigned to ${assignedPlant}).`,
        model: {
          ...newModel,
          manufacturing_plant: assignedPlant,
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
 * Update model status or details
 * Body: { id, is_active, name, description, code, qr_data, manufacturing_plant }
 * Required role: admin or owner
 */
export async function PATCH(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin', 'owner', 'production'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const body = await request.json();
    const { id, is_active, name, description, code, qr_data, manufacturing_plant } = body;

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
    if (typeof code === 'string' && code.trim()) {
      const cleanCode = code.trim().toUpperCase();
      const { data: existingCode } = await supabase
        .from('cooler_models')
        .select('id')
        .eq('code', cleanCode)
        .neq('id', id)
        .maybeSingle();
      if (existingCode) {
        return NextResponse.json(
          { success: false, error: `Model code "${cleanCode}" is already in use.` },
          { status: 400 }
        );
      }
      updatePayload.code = cleanCode;
    }
    if (typeof qr_data === 'string' && qr_data.trim()) {
      const cleanQR = qr_data.trim();
      const { data: existingQR } = await supabase
        .from('cooler_models')
        .select('id')
        .eq('qr_data', cleanQR)
        .neq('id', id)
        .maybeSingle();
      if (existingQR) {
        return NextResponse.json(
          { success: false, error: `QR data "${cleanQR}" is already assigned to another model.` },
          { status: 400 }
        );
      }
      updatePayload.qr_data = cleanQR;
    }

    let assignedPlant = null;
    if (typeof manufacturing_plant === 'string' && manufacturing_plant.trim()) {
      assignedPlant = normalizePlant(manufacturing_plant);
      updatePayload.manufacturing_plant = assignedPlant;
    }

    if (typeof description !== 'undefined' || assignedPlant) {
      const baseDesc = typeof description !== 'undefined' ? description : '';
      if (assignedPlant) {
        updatePayload.description = formatModelDescription(baseDesc, assignedPlant);
      } else if (typeof description !== 'undefined') {
        updatePayload.description = description ? description.trim() : null;
      }
    }

    let updatedModel = null;
    let updateRes = await supabase
      .from('cooler_models')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateRes.error && (updateRes.error.code === 'PGRST204' || updateRes.error.message?.includes('manufacturing_plant'))) {
      delete updatePayload.manufacturing_plant;
      const fallbackUpdate = await supabase
        .from('cooler_models')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      if (fallbackUpdate.error) throw fallbackUpdate.error;
      updatedModel = fallbackUpdate.data;
    } else if (updateRes.error) {
      throw updateRes.error;
    } else {
      updatedModel = updateRes.data;
    }

    clearModelsCache();

    return NextResponse.json({
      success: true,
      model: {
        ...updatedModel,
        manufacturing_plant: resolveModelManufacturingPlant(updatedModel),
      },
    });
  } catch (error) {
    console.error('API /api/models PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update model' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/models
 * Permanently delete a cooler model
 * Body or query params: { id, force }
 * Required role: admin, owner, or production
 */
export async function DELETE(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin', 'owner', 'production'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const adminDb = createAdminSupabase() || supabase;

    let id = null;
    let force = false;

    try {
      const body = await request.json();
      if (body) {
        id = body.id;
        force = !!body.force;
      }
    } catch {
      // Body empty or not JSON, check URL search params
    }

    if (!id) {
      const { searchParams } = new URL(request.url);
      id = searchParams.get('id');
      force = searchParams.get('force') === 'true' || force;
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Model id is required' },
        { status: 400 }
      );
    }

    // 1. Fetch the model to delete
    const { data: model, error: fetchErr } = await adminDb
      .from('cooler_models')
      .select('id, name, code')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      throw fetchErr;
    }

    if (!model) {
      return NextResponse.json(
        { success: false, error: 'Cooler model not found or already deleted.' },
        { status: 404 }
      );
    }

    // 2. Check for referencing foreign key records
    const [prodRes, dispRes, stockRes] = await Promise.all([
      adminDb.from('production_entries').select('id', { count: 'exact', head: true }).eq('model_id', id),
      adminDb.from('dispatch_items').select('id', { count: 'exact', head: true }).eq('model_id', id),
      adminDb.from('stock_transactions').select('id', { count: 'exact', head: true }).eq('model_id', id),
    ]);

    const prodCount = prodRes.count || 0;
    const dispCount = dispRes.count || 0;
    const stockCount = stockRes.count || 0;
    const totalRecords = prodCount + dispCount + stockCount;

    if (totalRecords > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          hasRecords: true,
          error: `Model "${model.code}" has ${totalRecords} linked record(s) (${prodCount} production, ${dispCount} dispatch, ${stockCount} stock ledger). Confirm deletion to permanently remove.`,
          counts: {
            production: prodCount,
            dispatch: dispCount,
            stock: stockCount,
          },
        },
        { status: 409 }
      );
    }

    // 3. If force is true and records exist, delete dependent records in reverse dependency order
    if (totalRecords > 0 && force) {
      if (stockCount > 0) {
        const { error: stockDelErr } = await adminDb
          .from('stock_transactions')
          .delete()
          .eq('model_id', id);
        if (stockDelErr) throw stockDelErr;
      }

      if (dispCount > 0) {
        const { error: dispDelErr } = await adminDb
          .from('dispatch_items')
          .delete()
          .eq('model_id', id);
        if (dispDelErr) throw dispDelErr;
      }

      if (prodCount > 0) {
        const { error: prodDelErr } = await adminDb
          .from('production_entries')
          .delete()
          .eq('model_id', id);
        if (prodDelErr) throw prodDelErr;
      }
    }

    // 4. Delete the cooler model
    const { error: delErr } = await adminDb
      .from('cooler_models')
      .delete()
      .eq('id', id);

    if (delErr) {
      throw delErr;
    }

    clearModelsCache();
    clearStockCache();

    return NextResponse.json({
      success: true,
      message: `Model "${model.code}" (${model.name}) deleted successfully.`,
      deletedId: id,
    });
  } catch (error) {
    console.error('API /api/models DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete cooler model' },
      { status: 500 }
    );
  }
}

