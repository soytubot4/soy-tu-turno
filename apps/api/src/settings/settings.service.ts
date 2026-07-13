import { Injectable } from '@nestjs/common';
import { Prisma } from '@soytuturno/db';
import type { UpdateTurnoSettingsInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

const assertCanWrite = () => assertCan('settings:write');

function readCfg(turnoConfig: unknown) {
  const cfg = (turnoConfig && typeof turnoConfig === 'object' ? turnoConfig : {}) as Record<string, unknown>;
  return {
    slotStepMin: typeof cfg.slotStepMin === 'number' && cfg.slotStepMin > 0 ? cfg.slotStepMin : 15,
    minLeadMinutes: typeof cfg.minLeadMinutes === 'number' && cfg.minLeadMinutes >= 0 ? cfg.minLeadMinutes : 0,
    _raw: cfg,
  };
}

/** Config de turnos del comercio (guardada en tenants.turno_config). */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const t = await tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { turnoConfig: true },
      });
      const { slotStepMin, minLeadMinutes } = readCfg(t?.turnoConfig);
      return { slotStepMin, minLeadMinutes };
    });
  }

  update(input: UpdateTurnoSettingsInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const t = await tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { turnoConfig: true },
      });
      const { _raw } = readCfg(t?.turnoConfig);
      const next: Record<string, unknown> = { ..._raw };
      if (input.slotStepMin !== undefined) next.slotStepMin = input.slotStepMin;
      if (input.minLeadMinutes !== undefined) next.minLeadMinutes = input.minLeadMinutes;

      await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { turnoConfig: next as Prisma.InputJsonValue },
      });
      const saved = readCfg(next);
      return { slotStepMin: saved.slotStepMin, minLeadMinutes: saved.minLeadMinutes };
    });
  }
}
