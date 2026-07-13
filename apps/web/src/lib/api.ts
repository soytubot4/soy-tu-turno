'use client';

import { getSupabaseBrowserClient } from './supabase/client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3201/v1';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/**
 * Fetch tipado contra la API. Adjunta el Bearer del usuario logueado en Supabase.
 * `tenantSlug` setea el header x-tenant-slug (para endpoints de gestión del comercio).
 */
export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; tenantSlug?: string } = {},
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  if (opts.tenantSlug) headers['x-tenant-slug'] = opts.tenantSlug;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  });

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !json || json.ok === false) {
    const message = json && json.ok === false ? json.error.message : `Error ${res.status}`;
    throw new Error(message);
  }
  return json.data;
}
