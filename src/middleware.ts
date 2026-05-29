import { NextResponse, type NextRequest } from 'next/server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  for (const c of request.cookies.getAll()) {
    if (/^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value) return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isProtected = pathname.startsWith('/dashboard');
  const hasSession = hasSupabaseSessionCookie(request);

  if (!hasSession && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
