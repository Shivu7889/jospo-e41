import { NextResponse } from 'next/server';
import { authenticateRequest, clearAuthCache } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// GET: List all employees
export async function GET(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin'] });
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

// POST: Add or link employee profile (supports 1-step creation or manual UUID, with upsert protection)
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = await request.json();

    const { id, name, email, role, plant = 'E41 G2', password, is_active = true } = body;

    // Validation
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Employee name is required' }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Employee email is required' }, { status: 400 });
    }
    if (!['owner', 'admin', 'production', 'dispatch'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be one of: "owner", "admin", "production", "dispatch"' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
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
        email: cleanEmail,
        password: password,
        email_confirm: true,
        user_metadata: { name: name.trim(), role, plant },
      });

      if (authCreateErr) {
        return NextResponse.json(
          { error: `Failed to create login credentials: ${authCreateErr.message}` },
          { status: 400 }
        );
      }

      authUserId = authUser?.user?.id;
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

    // 1. Check if employee profile already exists with this ID (Prevents "employees_pkey" duplicate key error)
    const { data: existingById } = await supabase
      .from('employees')
      .select('id, name, email, role, plant, is_active')
      .eq('id', authUserId)
      .maybeSingle();

    if (existingById) {
      // Profile already exists for this auth user: update details and ensure is_active
      const updateData = {
        name: name.trim(),
        email: cleanEmail,
        role,
        plant: role === 'owner' ? 'ALL' : plant,
        is_active: is_active !== undefined ? is_active : true,
        updated_at: new Date().toISOString(),
      };

      let { data: updated, error: updateErr } = await supabase
        .from('employees')
        .update(updateData)
        .eq('id', authUserId)
        .select()
        .single();

      if (updateErr && (updateErr.message?.includes('plant') || updateErr.code === 'PGRST204')) {
        delete updateData.plant;
        const retryUpdate = await supabase
          .from('employees')
          .update(updateData)
          .eq('id', authUserId)
          .select()
          .single();
        updated = retryUpdate.data;
        updateErr = retryUpdate.error;
      }

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
      }

      clearAuthCache(authUserId);

      return NextResponse.json(
        {
          success: true,
          message: `Employee profile for "${name.trim()}" already existed and was updated successfully.`,
          data: updated,
        },
        { status: 200 }
      );
    }

    // 2. Check if another employee already has this email
    const { data: existingByEmail } = await supabase
      .from('employees')
      .select('id, name, email, role, plant, is_active')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existingByEmail && existingByEmail.id !== authUserId) {
      return NextResponse.json(
        {
          error: `An employee profile with email "${cleanEmail}" already exists (Name: "${existingByEmail.name}", Role: "${existingByEmail.role}"). Please edit the existing employee profile or use a different email.`,
        },
        { status: 400 }
      );
    }

    // 3. Insert or Upsert into employees table
    const insertPayload = {
      id: authUserId,
      name: name.trim(),
      email: cleanEmail,
      role,
      plant: role === 'owner' ? 'ALL' : plant,
      is_active: is_active !== undefined ? is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from('employees')
      .upsert(insertPayload, { onConflict: 'id' })
      .select()
      .single();

    // Fallback if plant column doesn't exist in DB schema yet
    if (error && (error.message?.includes('plant') || error.code === 'PGRST204')) {
      delete insertPayload.plant;
      const retryResult = await supabase
        .from('employees')
        .upsert(insertPayload, { onConflict: 'id' })
        .select()
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      let friendlyError = error.message;
      if (error.code === '23505' || error.message?.includes('employees_pkey')) {
        friendlyError = `An employee profile with User ID "${authUserId}" already exists.`;
      } else if (error.message?.includes('employees_email_key')) {
        friendlyError = `An employee profile with email "${cleanEmail}" already exists.`;
      }
      return NextResponse.json({ error: friendlyError }, { status: 400 });
    }

    clearAuthCache(authUserId);

    return NextResponse.json(
      { success: true, message: 'Employee profile created successfully', data },
      { status: 201 }
    );
  } catch (err) {
    console.error('API /admin/users POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Toggle active status or update role/name/plant
export async function PATCH(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner', 'admin'] });
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = await request.json();
    const { id, is_active, role, name, plant } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const updateFields = { updated_at: new Date().toISOString() };
    if (typeof is_active === 'boolean') updateFields.is_active = is_active;
    if (role && ['owner', 'admin', 'production', 'dispatch'].includes(role)) updateFields.role = role;
    if (name && name.trim()) updateFields.name = name.trim();
    if (plant && ['E41 G2', 'D4', 'C116', 'ALL'].includes(plant)) updateFields.plant = plant;

    let { data, error } = await supabase
      .from('employees')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error && (error.message?.includes('plant') || error.code === 'PGRST204')) {
      delete updateFields.plant;
      const retryResult = await supabase
        .from('employees')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    clearAuthCache(id);

    return NextResponse.json(
      { success: true, message: 'Employee updated successfully', data },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /admin/users PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
