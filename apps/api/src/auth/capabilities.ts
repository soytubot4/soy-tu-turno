import { ForbiddenException } from '@nestjs/common';
import { capabilitiesFor, roleCan, type TurnoCapability } from '@soytuturno/shared';
import { requireTenantContext } from '@/prisma/tenant-context';

/** Permisos del usuario del request actual (según su rol + overrides del tenant). */
export function currentCapabilities(): TurnoCapability[] {
  const ctx = requireTenantContext();
  return capabilitiesFor(ctx.role, ctx.overrides);
}

/** Gatea una acción por capability. Tira 403 si el rol no la tiene. */
export function assertCan(cap: TurnoCapability): void {
  const ctx = requireTenantContext();
  if (!roleCan(ctx.role, cap, ctx.overrides)) {
    throw new ForbiddenException('No tenés permiso para esta acción');
  }
}

/** Gatea una acción que alcanza con CUALQUIERA de varias capabilities. */
export function assertCanAny(caps: TurnoCapability[]): void {
  const ctx = requireTenantContext();
  if (!caps.some((c) => roleCan(ctx.role, c, ctx.overrides))) {
    throw new ForbiddenException('No tenés permiso para esta acción');
  }
}
