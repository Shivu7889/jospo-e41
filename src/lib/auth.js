import { createServerSupabase } from './supabase-server';
import { NextResponse } from 'next/server';

/**
 * Authenticate the current request and return the employee record.
 * @param {Object} options
 * @param {string[]} [options.allowedRoles] - If provided, restricts to these roles
 * @param {boolean} [options.requireActive] - If true (default), requires is_active = true
 * @returns {{ employee, supabase, error }} - employee record, supabase client, or error response
 */
export async function authenticateRequest({ allowedRoles = null, requireActive = true } = {}) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Authentication required. Please log in.' },
        { status: 401 }
      ),
      employee: null,
      supabase,
    };
  }

  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('id, name, email, role, is_active')
    .eq('id', user.id)
    .single();

  if (empError || !employee) {
    return {
      error: NextResponse.json(
        { success: false, error: 'No employee profile found for this account.' },
        { status: 403 }
      ),
      employee: null,
      supabase,
    };
  }

  if (requireActive && !employee.is_active) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Your account has been deactivated. Contact an administrator.' },
        { status: 403 }
      ),
      employee: null,
      supabase,
    };
  }

  if (allowedRoles && !allowedRoles.includes(employee.role)) {
    return {
      error: NextResponse.json(
        { success: false, error: `Access denied. Required role: ${allowedRoles.join(' or ')}` },
        { status: 403 }
      ),
      employee: null,
      supabase,
    };
  }

  return { employee, supabase, error: null };
}
