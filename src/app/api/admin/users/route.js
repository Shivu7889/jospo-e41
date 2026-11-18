import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET: List all employees
export async function GET(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data || [] }, { status: 200 });
  } catch (err) {
    console.error('API /admin/users GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Add new employee profile
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = await request.json();

    const { id, name, email, role, is_active = true } = body;

    // Validation
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Employee name is required' }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Employee email is required' }, { status: 400 });
    }
    if (!['admin', 'production', 'dispatch'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be one of: "admin", "production", "dispatch"' },
        { status: 400 }
      );
    }

    // Require ID (auth user UUID)
    if (!id || !id.trim()) {
      return NextResponse.json(
        {
          error:
            'A valid Supabase Auth User ID (UUID) is required to link this employee record with login credentials.',
        },
        { status: 400 }
      );
    }

    // Insert into employees table
    const { data, error } = await supabase
      .from('employees')
      .insert({
        id: id.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        is_active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { success: true, message: 'Employee profile created successfully', data },
      { status: 201 }
    );
  } catch (err) {
    console.error('API /admin/users POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Toggle active status or update role/name
export async function PATCH(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = await request.json();
    const { id, is_active, role, name } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const updateFields = { updated_at: new Date().toISOString() };
    if (typeof is_active === 'boolean') updateFields.is_active = is_active;
    if (role && ['admin', 'production', 'dispatch'].includes(role)) updateFields.role = role;
    if (name && name.trim()) updateFields.name = name.trim();

    const { data, error } = await supabase
      .from('employees')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { success: true, message: 'Employee updated successfully', data },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /admin/users PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
