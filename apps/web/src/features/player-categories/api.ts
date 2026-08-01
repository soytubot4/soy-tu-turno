'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type {
  CreatePlayerCategoryInput,
  UpdatePlayerCategoryInput,
  PlayerCategoryDto,
} from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type PlayerCategory = PlayerCategoryDto;

export const listPlayerCategories = () =>
  apiFetch<PlayerCategory[]>('/player-categories', { tenantSlug: slug() });

export const createPlayerCategory = (input: CreatePlayerCategoryInput) =>
  apiFetch<PlayerCategory>('/player-categories', { method: 'POST', body: input, tenantSlug: slug() });

export const updatePlayerCategory = (id: string, input: UpdatePlayerCategoryInput) =>
  apiFetch<PlayerCategory>(`/player-categories/${id}`, {
    method: 'PATCH',
    body: input,
    tenantSlug: slug(),
  });

export const deletePlayerCategory = (id: string) =>
  apiFetch<{ id: string }>(`/player-categories/${id}`, { method: 'DELETE', tenantSlug: slug() });
