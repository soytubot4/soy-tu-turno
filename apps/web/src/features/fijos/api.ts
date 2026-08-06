'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { CreateRecurringInput, RecurringAppointment } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type { RecurringAppointment };

export const listRecurring = () =>
  apiFetch<RecurringAppointment[]>('/recurring', { tenantSlug: slug() });

export const createRecurring = (input: CreateRecurringInput) =>
  apiFetch<{ id: string; creados: number; salteados: number }>('/recurring', {
    method: 'POST',
    body: input,
    tenantSlug: slug(),
  });

export const deleteRecurring = (id: string) =>
  apiFetch<{ id: string; liberados: number }>(`/recurring/${id}`, {
    method: 'DELETE',
    tenantSlug: slug(),
  });

/** Rellena los turnos que falten generar. Se llama al abrir la agenda. */
export const ensureRecurring = () =>
  apiFetch<{ creados: number }>('/recurring/ensure', { method: 'POST', tenantSlug: slug() });
