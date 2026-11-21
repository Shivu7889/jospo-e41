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

// POST: Add or link employee profile (strictly restricted to Enterprise Owner)
export async function POST(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;

    const isOwner = employee?.role === 'owner' || employee?.is_owner === true;
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Access denied: Only the Enterprise Owner can create new employee profiles.' },
        { status: 403 }
      );
    }

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

      let { data: authUser, error: authCreateErr } = await adminSupabase.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,
        user_metadata: { name: name.trim(), role, plant },
      });

      if (authCreateErr) {
        // If user already registered in Auth, retrieve their ID and update credentials
        if (
          authCreateErr.message?.toLowerCase().includes('already') ||
          authCreateErr.status === 422
        ) {
          const { data: listData } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 100 });
          const existingUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === cleanEmail
          );
          if (existingUser) {
            authUserId = existingUser.id;
            await adminSupabase.auth.admin.updateUserById(authUserId, {
              password: password,
              user_metadata: { name: name.trim(), role, plant },
              email_confirm: true,
            });
          } else {
            return NextResponse.json(
              { error: `Failed to create login credentials: ${authCreateErr.message}` },
              { status: 400 }
            );
          }
        } else {
          return NextResponse.json(
            { error: `Failed to create login credentials: ${authCreateErr.message}` },
            { status: 400 }
          );
        }
      } else {
        authUserId = authUser?.user?.id;
      }
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

// PATCH: Toggle active status or update role/name/plant (strictly restricted to Enterprise Owner)
export async function PATCH(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;

    const isOwner = employee?.role === 'owner' || employee?.is_owner === true;
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Access denied: Only the Enterprise Owner can modify employee profiles.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, is_active, role, name, plant } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    // Protect active Owner account from accidental lockout
    if (id === employee.id && is_active === false) {
      return NextResponse.json(
        { error: 'Cannot deactivate the active Enterprise Owner account.' },
        { status: 400 }
      );
    }
    if (id === employee.id && role && role !== 'owner') {
      return NextResponse.json(
        { error: 'Cannot change the Enterprise Owner role from your own account.' },
        { status: 400 }
      );
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

// DELETE: Delete a single employee profile or purge all non-owner employees (Owner only)
export async function DELETE(request) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['owner'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;

    const isOwner = employee?.role === 'owner' || employee?.is_owner === true;
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Access denied: Only the Enterprise Owner can delete employee profiles.' },
        { status: 403 }
      );
    }

    const ownerId = employee.id;
    const adminSupabase = createAdminSupabase();
    const db = adminSupabase || supabase;

    const { searchParams } = new URL(request.url);
    let action = searchParams.get('action');
    let targetId = searchParams.get('id');

    if (!targetId && !action) {
      try {
        const body = await request.json();
        if (body?.id) targetId = body.id;
        if (body?.action) action = body.action;
      } catch (e) {
        // Request body might be empty
      }
    }

    // ACTION 1: PURGE ALL NON-OWNER EMPLOYEES
    if (action === 'purge_all' || action === 'purge_non_owners') {
      const { data: nonOwners, error: listErr } = await db
        .from('employees')
        .select('id, name, email, role')
        .neq('id', ownerId)
        .neq('role', 'owner');

      if (listErr) {
        return NextResponse.json({ error: listErr.message }, { status: 400 });
      }

      const nonOwnerIds = (nonOwners || []).map((e) => e.id);

      if (nonOwnerIds.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No non-owner employees found to purge. Only the Enterprise Owner currently exists.',
          purgedCount: 0,
        });
      }

      // 1. Reassign historical foreign key records to Owner to preserve ledger audit trail
      await db
        .from('production_entries')
        .update({ employee_id: ownerId })
        .in('employee_id', nonOwnerIds);

      await db
        .from('dispatches')
        .update({ employee_id: ownerId })
        .in('employee_id', nonOwnerIds);

      await db
        .from('dispatches')
        .update({ cancelled_by: ownerId })
        .in('cancelled_by', nonOwnerIds);

      try {
        await db
          .from('dispatches')
          .update({ received_by: ownerId })
          .in('received_by', nonOwnerIds);
      } catch (e) {
        // Column might not exist in older migrations
      }

      await db
        .from('stock_transactions')
        .update({ employee_id: ownerId })
        .in('employee_id', nonOwnerIds);

      // 2. Delete non-owner profiles from public.employees
      const { error: delErr } = await db
        .from('employees')
        .delete()
        .in('id', nonOwnerIds);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }

      // 3. Delete auth logins via Admin client if available
      let deletedAuthCount = 0;
      if (adminSupabase) {
        for (const uid of nonOwnerIds) {
          try {
            await adminSupabase.auth.admin.deleteUser(uid);
            deletedAuthCount++;
          } catch (authDelErr) {
            console.warn(`Could not delete auth user ${uid}:`, authDelErr.message);
          }
        }
      }

      clearAuthCache();

      return NextResponse.json({
        success: true,
        message: `Successfully purged ${nonOwnerIds.length} employee account(s). All historical production & dispatch records preserved and reassigned to Owner.`,
        purgedCount: nonOwnerIds.length,
        deletedAuthCount,
      });
    }

    // ACTION 2: DELETE INDIVIDUAL EMPLOYEE
    if (!targetId) {
      return NextResponse.json(
        { error: 'Employee ID or action=purge_all is required for deletion.' },
        { status: 400 }
      );
    }

    if (targetId === ownerId) {
      return NextResponse.json(
        { error: 'You cannot delete your own Owner account.' },
        { status: 400 }
      );
    }

    const { data: targetEmp, error: fetchErr } = await db
      .from('employees')
      .select('id, name, email, role')
      .eq('id', targetId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    }

    if (!targetEmp) {
      return NextResponse.json({ error: 'Employee profile not found.' }, { status: 404 });
    }

    if (targetEmp.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot delete an Enterprise Owner profile.' },
        { status: 400 }
      );
    }

    // 1. Reassign FK records to Owner
    await db
      .from('production_entries')
      .update({ employee_id: ownerId })
      .eq('employee_id', targetId);

    await db
      .from('dispatches')
      .update({ employee_id: ownerId })
      .eq('employee_id', targetId);

    await db
      .from('dispatches')
      .update({ cancelled_by: ownerId })
      .eq('cancelled_by', targetId);

    try {
      await db
        .from('dispatches')
        .update({ received_by: ownerId })
        .eq('received_by', targetId);
    } catch (e) {
      // Column might not exist in older migrations
    }

    await db
      .from('stock_transactions')
      .update({ employee_id: ownerId })
      .eq('employee_id', targetId);

    // 2. Delete from public.employees
    const { error: delErr } = await db
      .from('employees')
      .delete()
      .eq('id', targetId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    // 3. Delete from Supabase Auth
    if (adminSupabase) {
      try {
        await adminSupabase.auth.admin.deleteUser(targetId);
      } catch (authDelErr) {
        console.warn(`Could not delete auth user ${targetId}:`, authDelErr.message);
      }
    }

    clearAuthCache(targetId);

    return NextResponse.json({
      success: true,
      message: `Employee "${targetEmp.name}" (${targetEmp.email}) has been permanently deleted. Historical entries reassigned to Owner.`,
    });
  } catch (err) {
    console.error('API /admin/users DELETE error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
