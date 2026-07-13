import { ForbiddenException } from '@nestjs/common';
import { capabilitiesFor, roleCan, type TurnoCapability } from '@soytuturno/shared';
import { requireTenantContext } from '@/prisma/tenant-context';

/** Permisos del usuario del request actual (según su rol en el comercio). */
export function currentCapabilities(): TurnoCapability[] {
  return capabilitiesFor(requireTenantContext().role);
}

/** Gatea una acción por capability. Tira 403 si el rol no la tiene. */
export function assertCan(cap: TurnoCapability): void {
  const { role } = requireTenantContext();
  if (!roleCan(role, cap)) {
    throw new ForbiddenException('No tenés permiso para esta acción');
  }
}
