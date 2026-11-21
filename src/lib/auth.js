import { createServerSupabase, createAdminSupabase } from './supabase-server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Server-side in-memory auth cache (TTL: 45 seconds)
// Avoids 2 remote HTTP round-trips to Supabase (saving ~600ms) on repeated API calls
const authCache = new Map();
const AUTH_CACHE_TTL = 45 * 1000; // 45 seconds

export function clearAuthCache(userId = null) {
  if (!userId) {
    authCache.clear();
    return;
  }
  for (const [key, val] of authCache.entries()) {
    if (val.user?.id === userId || val.employee?.id === userId) {
      authCache.delete(key);
    }
  }
}

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, val] of authCache.entries()) {
    if (val.expiresAt <= now) {
      authCache.delete(key);
    }
  }
}

/**
 * Authenticate the current request and return the employee record.
 * Uses high-speed in-memory caching to eliminate redundant remote auth lookups.
 * @param {Object} options
 * @param {string[]} [options.allowedRoles] - If provided, restricts to these roles
 * @param {boolean} [options.requireActive] - If true (default), requires is_active = true
 * @returns {{ employee, supabase, userSupabase, error }}
 */
export async function authenticateRequest({ allowedRoles = null, requireActive = true } = {}) {
  let cacheKey = null;
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const authCookie = allCookies.find((c) => c.name.includes('auth-token') || c.name.includes('sb-'));
    if (authCookie) {
      cacheKey = `${authCookie.name}:${authCookie.value}`;
    }
  } catch (e) {
    // cookies() may throw in non-request contexts
  }

  const supabase = await createServerSupabase();

  // Fast-path: Check server in-memory auth cache (0ms lookup)
  if (cacheKey && authCache.has(cacheKey)) {
    const cached = authCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const { employee } = cached;

      if (requireActive && !employee.is_active) {
        return {
          error: NextResponse.json(
            { success: false, error: 'Your account has been deactivated. Contact an administrator.' },
            { status: 403 }
          ),
          employee: null,
          supabase,
          userSupabase: supabase,
        };
      }

      const isOwner = employee.role === 'owner' || employee.is_owner === true;
      if (allowedRoles && !isOwner && !allowedRoles.includes(employee.role)) {
        return {
          error: NextResponse.json(
            { success: false, error: `Access denied. Required role: ${allowedRoles.join(' or ')}` },
            { status: 403 }
          ),
          employee: null,
          supabase,
          userSupabase: supabase,
        };
      }

      const adminSupabase = createAdminSupabase();
      const db = adminSupabase || supabase;
      return { employee, supabase: db, userSupabase: supabase, error: null };
    }
  }

  // Cache miss: verify user session with Supabase Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Authentication required. Please log in.' },
        { status: 401 }
      ),
      employee: null,
      supabase,
      userSupabase: supabase,
    };
  }

  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('id, name, email, role, plant, is_active')
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
      userSupabase: supabase,
    };
  }

  // Cache employee profile for next 45 seconds
  if (cacheKey && employee) {
    if (authCache.size > 200) cleanExpiredCache();
    authCache.set(cacheKey, {
      user,
      employee,
      expiresAt: Date.now() + AUTH_CACHE_TTL,
    });
  }

  if (requireActive && !employee.is_active) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Your account has been deactivated. Contact an administrator.' },
        { status: 403 }
      ),
      employee: null,
      supabase,
      userSupabase: supabase,
    };
  }

  // Owner has universal permission across all endpoints
  const isOwner = employee.role === 'owner' || employee.is_owner === true;
  if (allowedRoles && !isOwner && !allowedRoles.includes(employee.role)) {
    return {
      error: NextResponse.json(
        { success: false, error: `Access denied. Required role: ${allowedRoles.join(' or ')}` },
        { status: 403 }
      ),
      employee: null,
      supabase,
      userSupabase: supabase,
    };
  }

  const adminSupabase = createAdminSupabase();
  const db = adminSupabase || supabase;

  return { employee, supabase: db, userSupabase: supabase, error: null };
}
