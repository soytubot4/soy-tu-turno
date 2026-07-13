/**
 * Lógica ÚNICA de hosts/dominios de soytuturno. Reusar SIEMPRE desde acá
 * (middleware, links, server actions) — no reimplementar el parseo en otro lado.
 *
 * Mapa de superficies (prod):
 *   soytuturno.com                → landing         (apex)
 *   app.soytuturno.com            → panel superadmin
 *   admin.<slug>.soytuturno.com   → gestión del comercio <slug> (turnos, agenda)
 *   <slug>.soytuturno.com         → portal del cliente (reservar turno)
 *
 * En dev el root domain es `localhost`: app.localhost, admin.demo.localhost,
 * demo.localhost, etc.
 */

export type Surface =
  | { type: 'apex' } // landing / auth compartida
  | { type: 'superadmin' } // app.<root>
  | { type: 'tenantAdmin'; slug: string } // admin.<slug>.<root> → gestión
  | { type: 'portal'; slug: string }; // <slug>.<root> → portal del cliente

/** Subdominios que NO son slugs de tenant (nivel más externo). */
const RESERVED = new Set(['app', 'www', 'api', 'dashboard', 'static', 'assets']);

export function getRootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'soytuturno.com';
}

/** Parsea un host (con o sin puerto) en una Surface. */
export function parseHost(host: string | null | undefined): Surface {
  if (!host) return { type: 'apex' };
  const hostname = host.split(':')[0]!.toLowerCase();
  const root = getRootDomain();

  // apex exacto
  if (hostname === 'localhost' || hostname === root) return { type: 'apex' };

  // extraer subdominio respecto del root (soporta root real y *.localhost en dev)
  let sub: string | null = null;
  if (hostname.endsWith(`.${root}`)) sub = hostname.slice(0, -1 - root.length);
  else if (hostname.endsWith('.localhost')) sub = hostname.slice(0, -'.localhost'.length);
  else return { type: 'apex' };

  const parts = sub.split('.');

  // dos niveles: admin.<slug> → gestión del comercio
  if (parts.length === 2) {
    if (parts[0] === 'admin' && parts[1]) return { type: 'tenantAdmin', slug: parts[1] };
    return { type: 'apex' };
  }

  // un nivel: app | <slug>
  if (parts.length === 1) {
    const label = parts[0]!;
    if (label === 'app') return { type: 'superadmin' };
    if (!label || RESERVED.has(label)) return { type: 'apex' };
    return { type: 'portal', slug: label };
  }

  return { type: 'apex' };
}

/** Slug del tenant sin importar si es superficie de gestión o portal. */
export function slugOf(surface: Surface): string | undefined {
  return surface.type === 'tenantAdmin' || surface.type === 'portal' ? surface.slug : undefined;
}

// ─── Builders de URL (usar para links absolutos entre superficies) ────────────
function protocol(): string {
  return getRootDomain() === 'localhost' || getRootDomain().endsWith('.localhost')
    ? 'http'
    : 'https';
}

function withPort(hostname: string): string {
  // En dev se setea NEXT_PUBLIC_WEB_PORT (ej. 3200); en prod no, y no se agrega.
  const port = process.env.NEXT_PUBLIC_WEB_PORT;
  return port ? `${hostname}:${port}` : hostname;
}

/** soytuturno.com — landing */
export function landingUrl(): string {
  return `${protocol()}://${withPort(getRootDomain())}`;
}

/** app.soytuturno.com — panel superadmin */
export function adminUrl(path = ''): string {
  return `${protocol()}://${withPort(`app.${getRootDomain()}`)}${path}`;
}

/** admin.<slug>.soytuturno.com — gestión del comercio */
export function tenantAdminUrl(slug: string, path = ''): string {
  return `${protocol()}://${withPort(`admin.${slug}.${getRootDomain()}`)}${path}`;
}

/** <slug>.soytuturno.com — portal del cliente */
export function portalUrl(slug: string, path = ''): string {
  return `${protocol()}://${withPort(`${slug}.${getRootDomain()}`)}${path}`;
}
