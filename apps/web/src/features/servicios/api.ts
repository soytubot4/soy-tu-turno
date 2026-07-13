'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { CreateServiceInput, UpdateServiceInput } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: string | null;
  color: string | null;
  active: boolean;
  sortOrder: number;
  resourceIds: string[];
};

export const listServices = () => apiFetch<Service[]>('/services', { tenantSlug: slug() });

export const createService = (input: CreateServiceInput) =>
  apiFetch<{ id: string }>('/services', { method: 'POST', body: input, tenantSlug: slug() });

export const updateService = (id: string, input: UpdateServiceInput) =>
  apiFetch<{ id: string }>(`/services/${id}`, { method: 'PATCH', body: input, tenantSlug: slug() });

export const deleteService = (id: string) =>
  apiFetch<{ id: string }>(`/services/${id}`, { method: 'DELETE', tenantSlug: slug() });
