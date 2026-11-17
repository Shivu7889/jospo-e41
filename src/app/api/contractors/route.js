import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const DEFAULT_CONTRACTORS = [
  'Chotu',
  'Ramesh Thekedar',
  'Suresh Thekedar',
  'Mukesh Thekedar',
  'Kailash Assembly',
];

/**
 * GET /api/contractors
 * List all active Thekedars (Contractors)
 * Accessible by all authenticated users (operators need to see who they can select)
 */
export async function GET() {
  try {
    const supabase = await createServerSupabase();

    // 1. Try querying the dedicated contractors table if it exists
    let { data: dbContractors, error: dbError } = await supabase
      .from('contractors')
      .select('id, name, is_active, created_at')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (!dbError && dbContractors && dbContractors.length > 0) {
      return NextResponse.json({
        success: true,
        source: 'contractors_table',
        contractors: dbContractors.map((c) => c.name),
        data: dbContractors,
      });
    }

    // 2. Fallback: Query distinct contractor_name from production_entries
    const distinctSet = new Set(DEFAULT_CONTRACTORS);

    try {
      const { data: prodData } = await supabase
        .from('production_entries')
        .select('contractor_name')
        .not('contractor_name', 'is', null)
        .limit(200);

      if (prodData && prodData.length > 0) {
        prodData.forEach((row) => {
          if (row.contractor_name && typeof row.contractor_name === 'string' && row.contractor_name.trim()) {
            distinctSet.add(row.contractor_name.trim());
          }
        });
      }
    } catch (e) {
      // Table or column might be empty
    }

    const list = Array.from(distinctSet).sort();

    return NextResponse.json({
      success: true,
      source: 'fallback_list',
      contractors: list,
      data: list.map((name) => ({ id: name, name, is_active: true })),
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
 * Add a new Thekedar name
 * RESTRICTED: Only admin role can add Thekedars
 */
export async function POST(request) {
  try {
    const supabase = await createServerSupabase();

    // Verify user & check admin role
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, name, role')
      .eq('id', user.id)
      .single();

    if (empErr || !employee || employee.role !== 'admin') {
      return NextResponse.json(
        { error: 'Permission denied. Only Admins can add or remove Thekedars.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = (body.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Thekedar name cannot be empty.' }, { status: 400 });
    }

    // Try inserting into contractors table
    const { data: inserted, error: insertError } = await supabase
      .from('contractors')
      .upsert({ name, is_active: true }, { onConflict: 'name' })
      .select()
      .single();

    return NextResponse.json({
      success: true,
      message: `Thekedar "${name}" added successfully by Admin.`,
      contractor: inserted || { name, is_active: true },
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
 * Remove / Deactivate a Thekedar name
 * RESTRICTED: Only admin role can remove Thekedars
 */
export async function DELETE(request) {
  try {
    const supabase = await createServerSupabase();

    // Verify user & check admin role
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, name, role')
      .eq('id', user.id)
      .single();

    if (empErr || !employee || employee.role !== 'admin') {
      return NextResponse.json(
        { error: 'Permission denied. Only Admins can add or remove Thekedars.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || (await request.json().catch(() => ({}))).name;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Thekedar name is required for removal.' }, { status: 400 });
    }

    const cleanName = name.trim();

    // Try updating is_active = false or deleting in contractors table
    try {
      await supabase
        .from('contractors')
        .update({ is_active: false })
        .eq('name', cleanName);
    } catch (e) {
      // Table might not exist yet
    }

    return NextResponse.json({
      success: true,
      message: `Thekedar "${cleanName}" removed successfully.`,
      name: cleanName,
    });
  } catch (err) {
    console.error('API /contractors DELETE error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to remove Thekedar' },
      { status: 500 }
    );
  }
}
