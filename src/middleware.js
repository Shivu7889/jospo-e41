import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Skip auth check if Supabase is not configured
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: {
        name: 'sb-jospo-auth-token',
        maxAge: 60 * 60 * 24 * 365, // 1 year persistent session
        path: '/',
        sameSite: 'lax',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: 60 * 60 * 24 * 365, // 1 year persistence
              path: '/',
              sameSite: 'lax',
            })
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Helper to preserve auth cookies when redirecting
  const createRedirectResponse = (targetPath) => {
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  // If not logged in: return 401 for API routes, redirect to /login for pages
  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }
    if (!request.nextUrl.pathname.startsWith('/login')) {
      const returnUrl = request.nextUrl.pathname + request.nextUrl.search;
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      if (returnUrl && returnUrl !== '/') {
        url.searchParams.set('next', returnUrl);
      }
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectResponse;
    }
  }

  // If logged in and on login page, redirect to dashboard
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return createRedirectResponse('/');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip|pdf|html)$).*)',
  ],
};
