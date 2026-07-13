'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { CreateResourceInput, UpdateResourceInput } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Resource = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
  color: string | null;
  active: boolean;
  sortOrder: number;
  userId: string | null;
  serviceIds: string[];
};

export const listResources = () => apiFetch<Resource[]>('/resources', { tenantSlug: slug() });

export const createResource = (input: CreateResourceInput) =>
  apiFetch<{ id: string }>('/resources', { method: 'POST', body: input, tenantSlug: slug() });

export const updateResource = (id: string, input: UpdateResourceInput) =>
  apiFetch<{ id: string }>(`/resources/${id}`, { method: 'PATCH', body: input, tenantSlug: slug() });

export const deleteResource = (id: string) =>
  apiFetch<{ id: string }>(`/resources/${id}`, { method: 'DELETE', tenantSlug: slug() });
