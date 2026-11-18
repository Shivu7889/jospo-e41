import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase-server';

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

// POST: Add new employee profile (supports 1-step creation with password or manual UUID)
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = await request.json();

    const { id, name, email, role, password, is_active = true } = body;

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

    let authUserId = id ? id.trim() : null;

    // 1-Step Creation: If password is provided, create the login user via Admin API
    if (password && !authUserId) {
      if (password.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters long' },
          { status: 400 }
        );
      }

      const adminSupabase = createAdminSupabase();
      if (!adminSupabase) {
        return NextResponse.json(
          {
            error:
              'SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Please enter the Supabase Auth User ID (UUID) manually or configure the service role key.',
          },
          { status: 400 }
        );
      }

      const { data: authUser, error: authCreateErr } = await adminSupabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: password,
        email_confirm: true,
        user_metadata: { name: name.trim(), role },
      });

      if (authCreateErr) {
        return NextResponse.json(
          { error: `Failed to create login credentials: ${authCreateErr.message}` },
          { status: 400 }
        );
      }

      authUserId = authUser.user.id;
    }

    // Require ID (auth user UUID) if not created via password
    if (!authUserId) {
      return NextResponse.json(
        {
          error:
            'Either provide a Password to create the login account automatically, or provide the Supabase Auth User ID (UUID).',
        },
        { status: 400 }
      );
    }

    // Insert into employees table
    const { data, error } = await supabase
      .from('employees')
      .insert({
        id: authUserId,
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
