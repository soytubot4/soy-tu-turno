import { AsyncLocalStorage } from 'node:async_hooks';
import type { RolePermissionsOverrides } from '@soytuturno/shared';

export type TenantContext = {
  tenantId: string;
  userId: string;
  /** Rol del user en el comercio (OWNER/MANAGER/CASHIER/VIEWER/PENDING…). */
  role: string;
  /** True si es el SUPERADMIN del ecosistema (acceso total a cualquier comercio). */
  isSuperAdmin?: boolean;
  /** Email del user (snapshot). Opcional: tokens viejos quizás no lo traen. */
  email?: string;
  /** Overrides de permisos por rol del tenant (RBAC configurable). */
  overrides?: RolePermissionsOverrides;
};

/**
 * AsyncLocalStorage para que cualquier capa acceda al tenant del request actual
 * sin pasarlo a mano. Lo popula el TenantContextInterceptor.
 */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error('Tenant context no inicializado (¿falta el guard/interceptor?)');
  return ctx;
}
