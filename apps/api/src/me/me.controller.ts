import { Controller, Get } from '@nestjs/common';
import {
  capabilitiesFor,
  roleLabelFor,
  roleLabelsFor,
  type RoleLabelsOverrides,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';

/** Datos del usuario logueado en el comercio actual: rol + permisos (para la UI). */
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const ctx = requireTenantContext();
    // Flag del modo "canchas" (club deportivo) del comercio, para gatear la UI.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, turnoConfig: true },
    });
    const cfg = (tenant?.turnoConfig ?? {}) as Record<string, unknown>;
    const canchas = cfg.canchas === true;
    const labelOverrides = (cfg.roleLabels ?? undefined) as RoleLabelsOverrides | undefined;
    return {
      ok: true,
      data: {
        userId: ctx.userId,
        email: ctx.email ?? null,
        role: ctx.role,
        roleLabel: ctx.isSuperAdmin
          ? 'Superadmin'
          : roleLabelFor(ctx.role, labelOverrides, canchas),
        // Nombres efectivos de todos los roles (para dropdowns/badges en la UI).
        roleLabels: roleLabelsFor(labelOverrides, canchas),
        capabilities: capabilitiesFor(ctx.role, ctx.overrides),
        isOwner: ctx.role === 'OWNER',
        isSuperAdmin: !!ctx.isSuperAdmin,
        canchas,
        products: cfg.productsEnabled === true,
        tenantName: tenant?.name ?? null,
      },
    };
  }
}
