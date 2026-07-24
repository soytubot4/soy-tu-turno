'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { TurnoCapability } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Me = {
  userId: string;
  email: string | null;
  role: string;
  roleLabel: string;
  /** Nombres efectivos de todos los roles (custom del tenant o default del rubro). */
  roleLabels: Record<string, string>;
  capabilities: TurnoCapability[];
  isOwner: boolean;
  isSuperAdmin: boolean;
  /** Modo club deportivo: habilita Canchas + Mapa. */
  canchas: boolean;
  /** Productos habilitados (sección Productos + reserva en el portal). */
  products: boolean;
  /** Nombre del comercio/club actual (para el sidebar). */
  tenantName: string | null;
};

export const getMe = () => apiFetch<Me>('/me', { tenantSlug: slug() });

/** Hook con el usuario actual + un helper `can(capability)` para gatear la UI. */
export function useMe() {
  const query = useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: 5 * 60_000 });
  const caps = query.data?.capabilities ?? [];
  const can = (cap: TurnoCapability) => caps.includes(cap);
  return {
    me: query.data,
    isLoading: query.isLoading,
    can,
    canchas: query.data?.canchas ?? false,
    products: query.data?.products ?? false,
  };
}
