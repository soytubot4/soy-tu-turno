'use client';

import { apiFetch } from '@/lib/api';
import type {
  AdminUpdateTurnoInput,
  AdminCreateTenantInput,
  AdminUpdateTenantInput,
} from '@soytuturno/shared';

export type AdminTenant = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  ownerName: string | null;
  turnoEnabled: boolean;
  turnoConfig: Record<string, unknown> | null;
  otherProducts: string[];
  deletable: boolean;
};

// Endpoints superadmin: no llevan x-tenant-slug (son cross-tenant).
export const listAdminTenants = () => apiFetch<AdminTenant[]>('/admin/tenants');

export type CreateTenantResult = {
  tenant: { id: string; slug: string; name: string };
  ownerCreated: boolean;
  supabaseEnabled: boolean;
};

export const createAdminTenant = (input: AdminCreateTenantInput) =>
  apiFetch<CreateTenantResult>('/admin/tenants', { method: 'POST', body: input });

export const updateAdminTenant = (id: string, input: AdminUpdateTenantInput) =>
  apiFetch<{ id: string; slug: string; name: string }>(`/admin/tenants/${id}`, {
    method: 'PATCH',
    body: input,
  });

export const deleteAdminTenant = (id: string) =>
  apiFetch<{ id: string }>(`/admin/tenants/${id}`, { method: 'DELETE' });

export const updateTenantTurno = (id: string, input: AdminUpdateTurnoInput) =>
  apiFetch<{ id: string; turnoEnabled: boolean; turnoConfig: Record<string, unknown> }>(
    `/admin/tenants/${id}/turno`,
    { method: 'PATCH', body: input },
  );

/**
 * Rehace los subdominios del comercio en DigitalOcean (CNAME + dominio en la app,
 * que es lo que dispara el certificado). Fuerza las dos superficies: se usa
 * justamente cuando algo no quedó bien.
 */
export const reprovisionDomains = (id: string) =>
  apiFetch<{ ok: boolean; errors?: string[] }>(`/admin/tenants/${id}/reprovision-domains`, {
    method: 'POST',
  });
