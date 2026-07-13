import { NextResponse, type NextRequest } from 'next/server';
import { parseHost } from '@/lib/tenant';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Middleware de soytuturno. Por superficie (subdominio):
 *   soytuturno.com                → landing            (apex, sin gate)
 *   app.soytuturno.com            → /admin/*  superadmin (requiere sesión)
 *   admin.<slug>.soytuturno.com   → /panel/*  gestión    (requiere sesión) + x-tenant-slug
 *   <slug>.soytuturno.com         → /portal/* portal cliente (público) + x-tenant-slug
 *
 * El portal del cliente NO usa la sesión de Supabase (los clientes se registran
 * aparte por WhatsApp/OTP), así que no lo gateamos acá.
 */

const PUBLIC_PATHS = ['/login', '/auth/callback', '/set-password', '/forgot-password'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const surface = parseHost(request.headers.get('host'));
  const { pathname } = request.nextUrl;

  // Refresca sesión de Supabase (cookies) en toda superficie.
  const { response: supabaseResponse, user } = await updateSession(request);

  // apex y portal: sin gate de sesión admin.
  if (surface.type === 'apex') return supabaseResponse;

  if (surface.type === 'portal') {
    return rewrite(request, supabaseResponse, mapPath(pathname, '/portal'), surface.slug);
  }

  // superficies de administración (superadmin / gestión): requieren sesión.
  const tenantSlug = surface.type === 'tenantAdmin' ? surface.slug : null;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  // ya logueado entrando a /login → al home de la superficie.
  // Excepción: /set-password procesa el token del invite y setea la clave.
  if (user && isPublic(pathname) && pathname !== '/set-password') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (isPublic(pathname)) return supabaseResponse;

  const base = surface.type === 'superadmin' ? '/admin' : '/panel';
  return rewrite(request, supabaseResponse, mapPath(pathname, base), tenantSlug);
}

/** Prefija el pathname bajo `base` (o null si ya está prefijado → sin rewrite). */
function mapPath(pathname: string, base: string): string | null {
  if (pathname.startsWith(base)) return null;
  return pathname === '/' ? base : `${base}${pathname}`;
}

function rewrite(
  request: NextRequest,
  supabaseResponse: NextResponse,
  target: string | null,
  tenantSlug: string | null,
): NextResponse {
  if (!target) {
    if (tenantSlug) supabaseResponse.headers.set('x-tenant-slug', tenantSlug);
    return supabaseResponse;
  }
  const url = request.nextUrl.clone();
  url.pathname = target;
  const rewritten = NextResponse.rewrite(url, { request });
  supabaseResponse.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
  if (tenantSlug) rewritten.headers.set('x-tenant-slug', tenantSlug);
  return rewritten;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
