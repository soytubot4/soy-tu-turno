'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type {
  PortalBookInput,
  PortalReviewInput,
  Sport,
  PriceUnit,
  PlayerCategoryDto,
} from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Rating = { avg: number | null; count: number };

export type PortalResource = {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
  rating: Rating;
  // Modo canchas:
  sport: Sport | null;
  surface: string | null;
  color: string | null;
  reference: boolean;
  mapX: number | null;
  mapY: number | null;
  mapW: number | null;
  mapH: number | null;
  mapRotation: number | null;
};

export type PortalInfo = {
  tenant: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    currency: string;
  } | null;
  /** Modo club deportivo: mostrar el mapa de canchas. */
  canchas: boolean;
  /** Pedir datos de los jugadores/acompañantes al reservar. */
  askPlayers: boolean;
  /** Si los precios de las categorías cambian sábado y domingo. */
  weekendPricing: boolean;
  /** Categorías de persona activas: cuánto paga cada una. */
  playerCategories: PlayerCategoryDto[];
  rating: Rating;
  services: {
    id: string;
    name: string;
    description: string | null;
    durationMin: number;
    price: string | null;
    priceUnit: PriceUnit | null;
    /** Si este servicio pide los datos de las personas al reservar. */
    askPeople: boolean;
    /** Cuántas personas pide (fijo). Null = sin tope definido. */
    peopleCount: number | null;
  }[];
  /** Productos (variantes) que se pueden reservar junto al turno. */
  products: {
    variantId: string;
    name: string;
    price: number | null;
    available: number;
    imageUrl: string | null;
  }[];
  resources: PortalResource[];
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

export const reviewPortal = (input: PortalReviewInput) =>
  apiFetch<{ ok: boolean }>('/portal/review', { method: 'POST', body: input, tenantSlug: slug() });
