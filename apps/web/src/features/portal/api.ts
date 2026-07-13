'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { PortalBookInput } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type PortalInfo = {
  tenant: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    currency: string;
  } | null;
  services: {
    id: string;
    name: string;
    description: string | null;
    durationMin: number;
    price: string | null;
  }[];
};

export const getPortalInfo = () => apiFetch<PortalInfo>('/portal/info', { tenantSlug: slug() });

export type PortalSlot = { startAt: string; endAt: string; resourceId: string };

export const getPortalAvailability = (serviceId: string, date: string) => {
  const qs = new URLSearchParams({ serviceId, date });
  return apiFetch<PortalSlot[]>(`/portal/availability?${qs.toString()}`, { tenantSlug: slug() });
};

export const bookPortal = (input: PortalBookInput) =>
  apiFetch<{ id: string; startAt: string; endAt: string }>('/portal/book', {
    method: 'POST',
    body: input,
    tenantSlug: slug(),
  });
