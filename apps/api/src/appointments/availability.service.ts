import { Injectable, NotFoundException } from '@nestjs/common';
import type { AvailabilityQuery } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { getTenantContext } from '@/prisma/tenant-context';
import {
  dayOfWeekInTz,
  hhmmToMinutes,
  overlaps,
  tenantTimezone,
  wallTimeToUtc,
} from '@/common/time';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

export type Slot = { startAt: string; endAt: string; resourceId: string };

type HourRange = { from: string; to: string };

/** Config de turnos leída del tenant (con defaults sanos). */
function readTurnoConfig(turnoConfig: unknown) {
  const cfg = (turnoConfig && typeof turnoConfig === 'object' ? turnoConfig : {}) as Record<string, unknown>;
  const slotStepMin = typeof cfg.slotStepMin === 'number' && cfg.slotStepMin > 0 ? cfg.slotStepMin : 15;
  const minLeadMinutes = typeof cfg.minLeadMinutes === 'number' && cfg.minLeadMinutes >= 0 ? cfg.minLeadMinutes : 0;
  return { slotStepMin, minLeadMinutes };
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Slots libres para un servicio en una fecha (opcional filtrando por recurso).
   * `tenantIdOverride` lo usa el portal público, que no tiene tenant context.
   */
  getSlots(query: AvailabilityQuery, tenantIdOverride?: string): Promise<Slot[]> {
    const tenantId = tenantIdOverride ?? getTenantContext()?.tenantId;
    if (!tenantId) throw new Error('availability sin tenant context');
    return this.prisma.tenantSafe((tx) => this.computeSlots(tx, query, tenantId), tenantIdOverride);
  }

  /** Reutilizable: ¿el instante `startAt` cae en un slot libre para el recurso? */
  async isSlotFree(query: AvailabilityQuery, startAtIso: string): Promise<boolean> {
    const slots = await this.getSlots(query);
    return slots.some((s) => s.startAt === startAtIso && s.resourceId === query.resourceId);
  }

  private async computeSlots(tx: Tx, query: AvailabilityQuery, tenantId: string): Promise<Slot[]> {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { turnoConfig: true },
    });
    const tz = tenantTimezone(tenant?.turnoConfig);
    const { slotStepMin, minLeadMinutes } = readTurnoConfig(tenant?.turnoConfig);

    const service = await tx.service.findFirst({
      where: { id: query.serviceId, tenantId },
      include: { resources: { select: { resourceId: true } } },
    });
    if (!service || !service.active) throw new NotFoundException('Servicio no disponible');
    const durationMin = service.durationMin;

    // Recursos candidatos que ofrecen el servicio (links vacíos = todos).
    const linkedIds = service.resources.map((r) => r.resourceId);
    let resourceIds: string[];
    if (query.resourceId) {
      if (linkedIds.length && !linkedIds.includes(query.resourceId)) return [];
      resourceIds = [query.resourceId];
    } else if (linkedIds.length) {
      resourceIds = linkedIds;
    } else {
      const all = await tx.resource.findMany({
        where: { active: true, tenantId, reference: false },
        select: { id: true },
      });
      resourceIds = all.map((r) => r.id);
    }
    if (!resourceIds.length) return [];

    // Solo recursos activos y que NO sean referencia del mapa (bar, entrada, o
    // canchas marcadas como "referencia": se ven en el plano pero no se reservan).
    const activeResources = await tx.resource.findMany({
      where: { id: { in: resourceIds }, active: true, tenantId, reference: false },
      select: { id: true },
    });
    resourceIds = activeResources.map((r) => r.id);
    if (!resourceIds.length) return [];

    const dow = dayOfWeekInTz(query.date, tz);

    const schedules = await tx.resourceSchedule.findMany({
      where: { resourceId: { in: resourceIds }, dayOfWeek: dow, tenantId },
      select: { resourceId: true, ranges: true },
    });
    const rangesByResource = new Map<string, HourRange[]>();
    for (const s of schedules) {
      rangesByResource.set(s.resourceId, Array.isArray(s.ranges) ? (s.ranges as HourRange[]) : []);
    }

    const dayStartUtc = wallTimeToUtc(query.date, 0, tz).getTime();
    const dayEndUtc = wallTimeToUtc(query.date, 24 * 60, tz).getTime();

    // Bloqueos del día (por recurso o de todo el local).
    const blocks = await tx.scheduleBlock.findMany({
      where: {
        tenantId,
        date: new Date(query.date),
        OR: [{ resourceId: null }, { resourceId: { in: resourceIds } }],
      },
      select: { resourceId: true, allDay: true, startAt: true, endAt: true },
    });

    // Clases de los profesores ese día de la semana: ocupan la cancha igual que
    // un turno, aunque no sean una reserva. Una franja sin cancha ocupa todas.
    const classSlots = (
      await tx.instructorSlot.findMany({
        where: { tenantId, dayOfWeek: dow, active: true },
        select: {
          resourceId: true,
          startTime: true,
          endTime: true,
          startsOn: true,
          endsOn: true,
          // Lo que cambia ESE día: movida de horario/cancha, o suspendida.
          exceptions: {
            where: { date: new Date(`${query.date}T00:00:00Z`) },
            select: { cancelled: true, startTime: true, endTime: true, resourceId: true },
          },
        },
      })
    )
      .map((s) => {
        const ex = s.exceptions[0];
        // Suspendida ese día: la cancha queda libre.
        if (ex?.cancelled) return null;
        return {
          resourceId: ex?.resourceId ?? s.resourceId,
          startTime: ex?.startTime ?? s.startTime,
          endTime: ex?.endTime ?? s.endTime,
          startsOn: s.startsOn,
          endsOn: s.endsOn,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .filter((s) => {
        // Vigencia del ciclo de clases (inclusiva).
        const from = s.startsOn ? s.startsOn.toISOString().slice(0, 10) : null;
        const to = s.endsOn ? s.endsOn.toISOString().slice(0, 10) : null;
        if (from && query.date < from) return false;
        if (to && query.date > to) return false;
        return true;
      });

    // Turnos ya tomados ese día (no cancelados).
    const taken = await tx.appointment.findMany({
      where: {
        tenantId,
        resourceId: { in: resourceIds },
        status: { not: 'CANCELLED' },
        startAt: { lt: new Date(dayEndUtc) },
        endAt: { gt: new Date(dayStartUtc) },
      },
      select: { resourceId: true, startAt: true, endAt: true },
    });
    const busyByResource = new Map<string, { start: number; end: number }[]>();
    for (const t of taken) {
      const arr = busyByResource.get(t.resourceId) ?? [];
      arr.push({ start: t.startAt.getTime(), end: t.endAt.getTime() });
      busyByResource.set(t.resourceId, arr);
    }

    const nowMs = Date.now();
    const durationMs = durationMin * 60_000;
    const slots: Slot[] = [];

    for (const resourceId of resourceIds) {
      // Bloqueos aplicables a este recurso (los suyos + los de todo el local).
      const applicable = blocks.filter((b) => b.resourceId === null || b.resourceId === resourceId);
      if (applicable.some((b) => b.allDay)) continue; // día cerrado para el recurso
      const blockIntervals = applicable
        .filter((b) => b.startAt && b.endAt)
        .map((b) => ({ start: b.startAt!.getTime(), end: b.endAt!.getTime() }));

      // Las clases de este recurso (y las que ocupan todas) valen como ocupado.
      const classIntervals = classSlots
        .filter((s) => s.resourceId === null || s.resourceId === resourceId)
        .map((s) => ({
          start: wallTimeToUtc(query.date, hhmmToMinutes(s.startTime), tz).getTime(),
          end: wallTimeToUtc(query.date, hhmmToMinutes(s.endTime), tz).getTime(),
        }));

      const busy = [...(busyByResource.get(resourceId) ?? []), ...classIntervals];
      const ranges = rangesByResource.get(resourceId) ?? [];

      for (const range of ranges) {
        if (!range.from || !range.to || range.from >= range.to) continue;
        const rangeStart = hhmmToMinutes(range.from);
        const rangeEnd = hhmmToMinutes(range.to);
        for (let m = rangeStart; m + durationMin <= rangeEnd; m += slotStepMin) {
          const startMs = wallTimeToUtc(query.date, m, tz).getTime();
          const endMs = startMs + durationMs;
          if (startMs < nowMs + minLeadMinutes * 60_000) continue;
          const clash =
            busy.some((b) => overlaps(startMs, endMs, b.start, b.end)) ||
            blockIntervals.some((b) => overlaps(startMs, endMs, b.start, b.end));
          if (clash) continue;
          slots.push({
            startAt: new Date(startMs).toISOString(),
            endAt: new Date(endMs).toISOString(),
            resourceId,
          });
        }
      }
    }

    slots.sort((a, b) => (a.startAt === b.startAt ? a.resourceId.localeCompare(b.resourceId) : a.startAt.localeCompare(b.startAt)));
    return slots;
  }
}
