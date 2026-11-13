import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      name: 'sb-jospo-auth-token',
      maxAge: 60 * 60 * 24 * 365, // 1 year persistent session
      path: '/',
      sameSite: 'lax',
    },
  });
}

// Singleton for client-side usage
let supabaseInstance = null;

export function getSupabase() {
  if (typeof window === 'undefined') return null;
  if (!supabaseInstance) {
    supabaseInstance = createClient();
  }
  return supabaseInstance;
}

export const supabase = typeof window !== 'undefined' ? getSupabase() : null;
