'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { UpdateTurnoSettingsInput } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type TurnoSettings = {
  slotStepMin: number;
  minLeadMinutes: number;
  askPlayers: boolean;
  productsEnabled: boolean;
  listedOnLanding: boolean;
  /** Si los precios de las categorías cambian los fines de semana. */
  priceWeekendEnabled: boolean;
  /** Si el comercio usa turnos fijos (la cancha reservada todas las semanas). */
  recurringEnabled: boolean;
  /** Recargo por luz: monto fijo del turno a partir de cierta hora. */
  lightEnabled: boolean;
  lightFrom: string; // 'HH:MM'
  lightPrice: number | null;
  /** Link de Google Maps del comercio (se muestra en el portal). */
  mapsUrl: string;
};

export const getTurnoSettings = () => apiFetch<TurnoSettings>('/settings', { tenantSlug: slug() });

export const updateTurnoSettings = (input: UpdateTurnoSettingsInput) =>
  apiFetch<TurnoSettings>('/settings', { method: 'PATCH', body: input, tenantSlug: slug() });
