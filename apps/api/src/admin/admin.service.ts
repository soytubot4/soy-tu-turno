import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@soytuturno/db';
import { TURNO_FEATURE_KEY, type AdminUpdateTurnoInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Consola superadmin de soytuturno. Los comercios se crean en soyuadmin (con la
 * invitación al dueño por Supabase); acá solo activamos/configuramos el turnero
 * por comercio. Corre SIN tenant context (cross-tenant), igual que soyuadmin.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todos los comercios del ecosistema, marcando cuáles tienen el turnero activo. */
  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, enabledProducts: true, turnoConfig: true },
    });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      turnoEnabled: t.enabledProducts.includes(TURNO_FEATURE_KEY),
      turnoConfig: t.turnoConfig,
    }));
  }

  /** Activa/desactiva el turnero para un comercio y actualiza su config. */
  async updateTurno(tenantId: string, input: AdminUpdateTurnoInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { enabledProducts: true, turnoConfig: true },
    });
    if (!tenant) throw new NotFoundException('Comercio no encontrado');

    const set = new Set(tenant.enabledProducts);
    if (input.enabled) set.add(TURNO_FEATURE_KEY);
    else set.delete(TURNO_FEATURE_KEY);

    // Merge de config (solo pisamos las claves que llegan).
    const prevCfg =
      tenant.turnoConfig && typeof tenant.turnoConfig === 'object'
        ? (tenant.turnoConfig as Record<string, unknown>)
        : {};
    const nextCfg: Record<string, unknown> = { ...prevCfg };
    if (input.timezone !== undefined) nextCfg.timezone = input.timezone;
    if (input.slotStepMin !== undefined) nextCfg.slotStepMin = input.slotStepMin;
    if (input.minLeadMinutes !== undefined) nextCfg.minLeadMinutes = input.minLeadMinutes;

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { enabledProducts: [...set], turnoConfig: nextCfg as Prisma.InputJsonValue },
      select: { id: true, enabledProducts: true, turnoConfig: true },
    });
    return {
      id: updated.id,
      turnoEnabled: updated.enabledProducts.includes(TURNO_FEATURE_KEY),
      turnoConfig: updated.turnoConfig,
    };
  }
}
