import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { normalizePlant, ALL_PLANTS_ID } from '@/lib/plants';

export const dynamic = 'force-dynamic';

// Server-side in-memory cache for contractors (TTL: 60s)
const contractorsCache = new Map();
const CONTRACTORS_CACHE_TTL = 60 * 1000;

export function clearContractorsCache() {
  contractorsCache.clear();
}

const DEFAULT_E41_CONTRACTORS = [
  'Chotu',
  'Ramesh Thekedar',
  'Suresh Thekedar',
  'Mukesh Thekedar',
  'Kailash Assembly',
];

/**
 * GET /api/contractors?plant=E41 G2
 * List active Thekedars (Contractors) for a specific plant or all plants.
 */
export async function GET(request) {
  try {
    const auth = await authenticateRequest({ requireActive: false });
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const rawPlant = searchParams.get('plant');
    const isAllPlants = !rawPlant || rawPlant.toUpperCase() === ALL_PLANTS_ID;
    const targetPlant = isAllPlants ? null : normalizePlant(rawPlant);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const cacheKey = `contractors_${targetPlant || 'ALL'}`;
    if (!forceRefresh && contractorsCache.has(cacheKey)) {
      const cached = contractorsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.data, {
          headers: { 'X-Cache': 'HIT' },
        });
      }
    }

    const respondWithCache = (payload) => {
      if (contractorsCache.size > 50) contractorsCache.clear();
      contractorsCache.set(cacheKey, {
        data: payload,
        expiresAt: Date.now() + CONTRACTORS_CACHE_TTL,
      });
      return NextResponse.json(payload);
    };

    // 1. Try querying the dedicated contractors table (with plant column)
    try {
      let query = supabase
        .from('contractors')
        .select('id, name, plant, is_active, created_at')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (targetPlant) {
        query = query.eq('plant', targetPlant);
      }

      let { data: dbContractors, error: dbError } = await query;

      // If query failed because 'plant' column does not exist yet
      if (dbError && (dbError.message?.includes('plant') || dbError.code === 'PGRST204')) {
        const fbRes = await supabase
          .from('contractors')
          .select('id, name, is_active, created_at')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (!fbRes.error && fbRes.data) {
          // If viewing E41, return existing contractors; if other plant, return empty
          if (!targetPlant || targetPlant === 'E41 G2') {
            return respondWithCache({
              success: true,
              source: 'contractors_table_legacy',
              contractors: fbRes.data.map((c) => c.name),
              data: fbRes.data.map((c) => ({ ...c, plant: 'E41 G2' })),
            });
          } else {
            return respondWithCache({
              success: true,
              source: 'contractors_table_legacy_empty',
              contractors: [],
              data: [],
            });
          }
        }
      } else if (!dbError && dbContractors && dbContractors.length > 0) {
        return respondWithCache({
          success: true,
          source: 'contractors_table',
          contractors: dbContractors.map((c) => c.name),
          data: dbContractors,
        });
      }
    } catch (tblErr) {
      console.warn('Contractors table query note:', tblErr?.message);
    }

    // 2. Fallback: Query distinct contractor_name from production_entries scoped to targetPlant
    const distinctSet = new Set();
    if (!targetPlant || targetPlant === 'E41 G2') {
      DEFAULT_E41_CONTRACTORS.forEach((c) => distinctSet.add(c));
    }

    try {
      let prodQuery = supabase
        .from('production_entries')
        .select('contractor_name, plant, remarks')
        .not('contractor_name', 'is', null)
        .limit(300);

      const { data: prodData } = await prodQuery;

      if (prodData && prodData.length > 0) {
        prodData.forEach((row) => {
          const rowPlant = normalizePlant(row.plant || (row.remarks?.match(/\[Plant:\s*([^\]]+)\]/i)?.[1]) || 'E41 G2');
          if (!targetPlant || rowPlant === targetPlant) {
            if (row.contractor_name && typeof row.contractor_name === 'string' && row.contractor_name.trim()) {
              distinctSet.add(row.contractor_name.trim());
            }
          }
        });
      }
    } catch (e) {
      // Table or column might be empty
    }

    const list = Array.from(distinctSet).sort();

    return respondWithCache({
      success: true,
      source: 'fallback_list',
      contractors: list,
      data: list.map((name) => ({
        id: name,
        name,
        plant: targetPlant || 'E41 G2',
        is_active: true,
      })),
    });
  } catch (err) {
    console.error('API /contractors GET error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch contractors' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contractors
 * Add a new Thekedar name for a specific plant
 * RESTRICTED: Allowed roles: 'owner', 'admin'
 */
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;

    const body = await request.json();
    const name = (body.name || '').trim();
    const plant = normalizePlant(body.plant || employee.plant || 'E41 G2');

    if (!name) {
      return NextResponse.json({ error: 'Thekedar name cannot be empty.' }, { status: 400 });
    }

    // Try inserting into contractors table with plant
    let { data: inserted, error: insertError } = await supabase
      .from('contractors')
      .upsert(
        { name, plant, is_active: true },
        { onConflict: 'name,plant' }
      )
      .select()
      .single();

    if (insertError && (insertError.message?.includes('plant') || insertError.code === 'PGRST204')) {
      // Fallback if plant column not added yet
      const fallback = await supabase
        .from('contractors')
        .upsert({ name, is_active: true }, { onConflict: 'name' })
        .select()
        .single();
      inserted = fallback.data;
      insertError = fallback.error;
    }

    if (insertError) throw insertError;

    clearContractorsCache();

    return NextResponse.json({
      success: true,
      message: `Thekedar "${name}" registered for ${plant} Plant.`,
      contractor: inserted || { name, plant, is_active: true },
    });
  } catch (err) {
    console.error('API /contractors POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to add Thekedar' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/contractors
 * Remove / Deactivate a Thekedar name for a plant
 * RESTRICTED: Allowed roles: 'owner', 'admin'
 */
export async function DELETE(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const name = searchParams.get('name') || body.name;
    const plant = searchParams.get('plant') || body.plant;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Thekedar name is required for removal.' }, { status: 400 });
    }

    const cleanName = name.trim();
    let query = supabase
      .from('contractors')
      .update({ is_active: false })
      .eq('name', cleanName);

    if (plant && plant !== ALL_PLANTS_ID) {
      query = query.eq('plant', normalizePlant(plant));
    }

    const { error: updateError } = await query;
    if (updateError) throw updateError;

    clearContractorsCache();

    return NextResponse.json({
      success: true,
      message: `Thekedar "${cleanName}" removed successfully.`,
      name: cleanName,
      plant: plant || null,
    });
  } catch (err) {
    console.error('API /contractors DELETE error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to remove Thekedar' },
      { status: 500 }
    );
  }
}
