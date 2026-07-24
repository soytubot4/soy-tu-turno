'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  AppointmentStatusValue,
} from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatusValue;
  source: 'ADMIN' | 'WEB' | 'WHATSAPP';
  notes: string | null;
  priceAtBooking: string | null;
  /** Jugadores/acompañantes cargados al reservar (si el comercio los pide). */
  players:
    | { firstName: string; lastName?: string; isSocio?: boolean; hasAbono?: boolean; price?: number | null }[]
    | null;
  /** Productos reservados junto al turno. */
  products: { name: string; qty: number; price?: number | null }[] | null;
  customer: { id: string; firstName: string | null; lastName: string | null; phone: string | null };
  resource: { id: string; name: string; color: string | null };
  service: { id: string; name: string; durationMin: number; color: string | null };
};

export const listAppointments = (fromIso: string, toIso: string, resourceId?: string) => {
  const qs = new URLSearchParams({ from: fromIso, to: toIso });
  if (resourceId) qs.set('resourceId', resourceId);
  return apiFetch<Appointment[]>(`/appointments?${qs.toString()}`, { tenantSlug: slug() });
};

export const createAppointment = (input: CreateAppointmentInput) =>
  apiFetch<{ id: string }>('/appointments', { method: 'POST', body: input, tenantSlug: slug() });

export const updateAppointment = (id: string, input: UpdateAppointmentInput) =>
  apiFetch<{ id: string }>(`/appointments/${id}`, { method: 'PATCH', body: input, tenantSlug: slug() });

export const cancelAppointment = (id: string) =>
  apiFetch<{ id: string }>(`/appointments/${id}`, { method: 'DELETE', tenantSlug: slug() });

export type Slot = { startAt: string; endAt: string; resourceId: string };

export const getAvailability = (serviceId: string, date: string, resourceId?: string) => {
  const qs = new URLSearchParams({ serviceId, date });
  if (resourceId) qs.set('resourceId', resourceId);
  return apiFetch<Slot[]>(`/availability?${qs.toString()}`, { tenantSlug: slug() });
};

// Clientes (para el picker del alta de turno)
export type CustomerLite = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export const searchCustomers = (q: string) =>
  apiFetch<CustomerLite[]>(`/customers?q=${encodeURIComponent(q)}`, { tenantSlug: slug() });

export const createCustomer = (input: { firstName: string; lastName?: string; phone?: string }) =>
  apiFetch<CustomerLite>('/customers', { method: 'POST', body: input, tenantSlug: slug() });
