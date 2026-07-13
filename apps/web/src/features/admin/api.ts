'use client';

import { apiFetch } from '@/lib/api';
import type { AdminUpdateTurnoInput } from '@soytuturno/shared';

export type AdminTenant = {
  id: string;
  slug: string;
  name: string;
  turnoEnabled: boolean;
  turnoConfig: Record<string, unknown> | null;
};

// Endpoints superadmin: no llevan x-tenant-slug (son cross-tenant).
export const listAdminTenants = () => apiFetch<AdminTenant[]>('/admin/tenants');

export const updateTenantTurno = (id: string, input: AdminUpdateTurnoInput) =>
  apiFetch<{ id: string; turnoEnabled: boolean; turnoConfig: Record<string, unknown> }>(
    `/admin/tenants/${id}/turno`,
    { method: 'PATCH', body: input },
  );
