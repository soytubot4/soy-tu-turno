import { Controller, Get } from '@nestjs/common';
import { ROLE_LABELS, capabilitiesFor } from '@soytuturno/shared';
import { requireTenantContext } from '@/prisma/tenant-context';

/** Datos del usuario logueado en el comercio actual: rol + permisos (para la UI). */
@Controller('me')
export class MeController {
  @Get()
  get() {
    const ctx = requireTenantContext();
    return {
      ok: true,
      data: {
        userId: ctx.userId,
        email: ctx.email ?? null,
        role: ctx.role,
        roleLabel: ROLE_LABELS[ctx.role] ?? ctx.role,
        capabilities: capabilitiesFor(ctx.role),
        isOwner: ctx.role === 'OWNER',
      },
    };
  }
}
