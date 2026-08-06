'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type {
  CreateInstructorInput,
  UpdateInstructorInput,
  InstructorSlotInput,
  SlotExceptionInput,
  Instructor,
} from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type { Instructor };

export const listInstructors = () => apiFetch<Instructor[]>('/instructors', { tenantSlug: slug() });

export const createInstructor = (input: CreateInstructorInput) =>
  apiFetch<{ id: string }>('/instructors', { method: 'POST', body: input, tenantSlug: slug() });

export const updateInstructor = (id: string, input: UpdateInstructorInput) =>
  apiFetch<{ id: string }>(`/instructors/${id}`, { method: 'PATCH', body: input, tenantSlug: slug() });

export const deleteInstructor = (id: string) =>
  apiFetch<{ id: string }>(`/instructors/${id}`, { method: 'DELETE', tenantSlug: slug() });

// ─── Franjas de clase ───
export const addInstructorSlot = (instructorId: string, input: InstructorSlotInput) =>
  apiFetch<{ id: string }>(`/instructors/${instructorId}/slots`, {
    method: 'POST',
    body: input,
    tenantSlug: slug(),
  });

export const updateInstructorSlot = (slotId: string, input: InstructorSlotInput) =>
  apiFetch<{ id: string }>(`/instructors/slots/${slotId}`, {
    method: 'PATCH',
    body: input,
    tenantSlug: slug(),
  });

export const deleteInstructorSlot = (slotId: string) =>
  apiFetch<{ id: string }>(`/instructors/slots/${slotId}`, { method: 'DELETE', tenantSlug: slug() });

/** Guarda (o limpia) lo que cambia de una clase para una fecha puntual. */
export const setSlotException = (slotId: string, input: SlotExceptionInput) =>
  apiFetch<{ slotId: string; date: string; cleared: boolean }>(
    `/instructors/slots/${slotId}/exception`,
    { method: 'PUT', body: input, tenantSlug: slug() },
  );
