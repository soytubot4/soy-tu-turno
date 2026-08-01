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
};

export const getTurnoSettings = () => apiFetch<TurnoSettings>('/settings', { tenantSlug: slug() });

export const updateTurnoSettings = (input: UpdateTurnoSettingsInput) =>
  apiFetch<TurnoSettings>('/settings', { method: 'PATCH', body: input, tenantSlug: slug() });
