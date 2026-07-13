'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type {
  HourRange,
  SetResourceScheduleInput,
  CreateScheduleBlockInput,
} from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type ScheduleDay = { dayOfWeek: number; ranges: HourRange[] };

export const getSchedule = (resourceId: string) =>
  apiFetch<ScheduleDay[]>(`/resources/${resourceId}/schedule`, { tenantSlug: slug() });

export const setSchedule = (resourceId: string, input: SetResourceScheduleInput) =>
  apiFetch<{ ok: boolean }>(`/resources/${resourceId}/schedule`, {
    method: 'PUT',
    body: input,
    tenantSlug: slug(),
  });

export type Block = {
  id: string;
  resourceId: string | null;
  date: string;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  reason: string | null;
};

export const listBlocks = (from: string, to: string, resourceId?: string) => {
  const qs = new URLSearchParams({ from, to });
  if (resourceId) qs.set('resourceId', resourceId);
  return apiFetch<Block[]>(`/blocks?${qs.toString()}`, { tenantSlug: slug() });
};

export const createBlock = (input: CreateScheduleBlockInput) =>
  apiFetch<{ id: string }>('/blocks', { method: 'POST', body: input, tenantSlug: slug() });

export const deleteBlock = (id: string) =>
  apiFetch<{ id: string }>(`/blocks/${id}`, { method: 'DELETE', tenantSlug: slug() });
