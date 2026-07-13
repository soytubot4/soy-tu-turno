'use client';

import { parseHost, slugOf } from './tenant';

/** Slug del comercio según el subdominio actual (client-side). undefined si no aplica. */
export function currentTenantSlug(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return slugOf(parseHost(window.location.host));
}
