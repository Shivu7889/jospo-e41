import { NextResponse } from 'next/server';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1. FAST PATH: API routes handle their own auth & role validation via authenticateRequest()
  // Bypassing middleware remote getUser() saves 300-600ms network round-trip on EVERY API call!
  if (pathname.startsWith('/api')) {
    return NextResponse.next({ request });
  }

  // 2. FAST COOKIE CHECK: Check if Supabase session cookie exists
  // Reading cookies from incoming request headers is 0ms in edge runtime (local memory).
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.includes('sb-'));

  // 3. If user has NO auth cookie and is trying to access a protected page:
  // Redirect to /login immediately without any remote network call (saves ~500ms)
  if (!hasAuthCookie && !pathname.startsWith('/login')) {
    const returnUrl = pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (returnUrl && returnUrl !== '/') {
      url.searchParams.set('next', returnUrl);
    }
    return NextResponse.redirect(url);
  }

  // 4. Return immediately for authenticated users or /login
  // Client-side AppShell and server-side authenticateRequest() perform full JWT verification
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip|pdf|html)$).*)',
  ],
};
