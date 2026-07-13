import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
  /** Email del user (snapshot). Opcional: tokens viejos quizás no lo traen. */
  email?: string;
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
