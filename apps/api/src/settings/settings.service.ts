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
    askPlayers: cfg.askPlayers === true,
    productsEnabled: cfg.productsEnabled === true,
    // Aparecer en el directorio público (soytuturno.com). Por defecto sí.
    listedOnLanding: cfg.listedOnLanding !== false,
    priceSocioAbono: typeof cfg.priceSocioAbono === 'number' ? cfg.priceSocioAbono : null,
    priceSocioSinAbono: typeof cfg.priceSocioSinAbono === 'number' ? cfg.priceSocioSinAbono : null,
    priceNoSocio: typeof cfg.priceNoSocio === 'number' ? cfg.priceNoSocio : null,
    priceWeekendEnabled: cfg.priceWeekendEnabled === true,
    priceSocioAbonoWknd: typeof cfg.priceSocioAbonoWknd === 'number' ? cfg.priceSocioAbonoWknd : null,
    priceSocioSinAbonoWknd: typeof cfg.priceSocioSinAbonoWknd === 'number' ? cfg.priceSocioSinAbonoWknd : null,
    priceNoSocioWknd: typeof cfg.priceNoSocioWknd === 'number' ? cfg.priceNoSocioWknd : null,
  };
}

/** El JSON crudo de turnoConfig (para preservar claves desconocidas al guardar). */
function rawCfg(turnoConfig: unknown): Record<string, unknown> {
  return (turnoConfig && typeof turnoConfig === 'object' ? turnoConfig : {}) as Record<string, unknown>;
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
      return readCfg(t?.turnoConfig);
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
      const next: Record<string, unknown> = { ...rawCfg(t?.turnoConfig) };
      if (input.slotStepMin !== undefined) next.slotStepMin = input.slotStepMin;
      if (input.minLeadMinutes !== undefined) next.minLeadMinutes = input.minLeadMinutes;
      if (input.askPlayers !== undefined) next.askPlayers = input.askPlayers;
      if (input.productsEnabled !== undefined) next.productsEnabled = input.productsEnabled;
      if (input.listedOnLanding !== undefined) next.listedOnLanding = input.listedOnLanding;
      if (input.priceSocioAbono !== undefined) next.priceSocioAbono = input.priceSocioAbono;
      if (input.priceSocioSinAbono !== undefined) next.priceSocioSinAbono = input.priceSocioSinAbono;
      if (input.priceNoSocio !== undefined) next.priceNoSocio = input.priceNoSocio;
      if (input.priceWeekendEnabled !== undefined) next.priceWeekendEnabled = input.priceWeekendEnabled;
      if (input.priceSocioAbonoWknd !== undefined) next.priceSocioAbonoWknd = input.priceSocioAbonoWknd;
      if (input.priceSocioSinAbonoWknd !== undefined) next.priceSocioSinAbonoWknd = input.priceSocioSinAbonoWknd;
      if (input.priceNoSocioWknd !== undefined) next.priceNoSocioWknd = input.priceNoSocioWknd;

      await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { turnoConfig: next as Prisma.InputJsonValue },
      });
      return readCfg(next);
    });
  }
}
