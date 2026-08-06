import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRecurringInput, RecurringAppointment } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';
import { tenantTimezone, wallTimeToUtc, hhmmToMinutes, lightSurcharge } from '@/common/time';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

/** Cuántas semanas hacia adelante mantenemos generadas. */
const HORIZON_WEEKS = 12;

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);

/** 'YYYY-MM-DD' de hoy en la timezone del comercio. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
/** Suma días a un 'YYYY-MM-DD' sin correrse por timezone. */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
function dowOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/**
 * Turnos fijos: el socio tiene la cancha todas las semanas a la misma hora.
 *
 * Guardamos la regla y de ahí generamos turnos concretos, para que se comporten
 * como cualquier otro turno (se ven en la agenda, se cobran, se puede cancelar
 * uno suelto). La generación es idempotente: se puede correr las veces que sea.
 */
@Injectable()
export class RecurringService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RecurringAppointment[]> {
    const ctx = requireTenantContext();
    const rows = await this.prisma.tenantSafe((tx) =>
      tx.recurringAppointment.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }],
        include: {
          customer: { select: { firstName: true, lastName: true, phone: true } },
          resource: { select: { name: true } },
          service: { select: { name: true, durationMin: true } },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName:
        [r.customer.firstName, r.customer.lastName].filter(Boolean).join(' ').trim() ||
        r.customer.phone ||
        'Cliente',
      resourceId: r.resourceId,
      resourceName: r.resource.name,
      serviceId: r.serviceId,
      serviceName: r.service.name,
      durationMin: r.service.durationMin,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      active: r.active,
      startsOn: dateOnly(r.startsOn),
      endsOn: dateOnly(r.endsOn),
      generatedUntil: dateOnly(r.generatedUntil),
      notes: r.notes,
    }));
  }

  /** Crea la regla y genera de una los turnos de las próximas semanas. */
  async create(input: CreateRecurringInput) {
    assertCan('appointments:write');
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      // Todo tiene que ser del mismo comercio.
      const [customer, resource, service] = await Promise.all([
        tx.customer.findFirst({ where: { id: input.customerId, tenantId: ctx.tenantId } }),
        tx.resource.findFirst({ where: { id: input.resourceId, tenantId: ctx.tenantId } }),
        tx.service.findFirst({ where: { id: input.serviceId, tenantId: ctx.tenantId } }),
      ]);
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      if (!resource) throw new NotFoundException('Cancha no encontrada');
      if (!service) throw new NotFoundException('Servicio no encontrado');
      if (input.endsOn && input.startsOn && input.endsOn < input.startsOn) {
        throw new BadRequestException('La fecha hasta es anterior a la desde.');
      }

      const rule = await tx.recurringAppointment.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: input.customerId,
          resourceId: input.resourceId,
          serviceId: input.serviceId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          startsOn: toDate(input.startsOn),
          endsOn: toDate(input.endsOn),
          notes: input.notes?.trim() || null,
        },
      });
      const created = await this.generateFor(tx, ctx.tenantId, rule.id);
      return { id: rule.id, ...created };
    });
  }

  /** Da de baja la regla y libera los turnos futuros que había generado. */
  async remove(id: string) {
    assertCan('appointments:write');
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const rule = await tx.recurringAppointment.findFirst({
        where: { id, tenantId: ctx.tenantId },
      });
      if (!rule) throw new NotFoundException('Turno fijo no encontrado');

      // Los turnos que ya pasaron quedan como histórico; los futuros se borran
      // para que esos horarios vuelvan a ofrecerse.
      const { count } = await tx.appointment.deleteMany({
        where: { tenantId: ctx.tenantId, recurringId: id, startAt: { gt: new Date() } },
      });
      await tx.recurringAppointment.delete({ where: { id } });
      return { id, liberados: count };
    });
  }

  /**
   * Rellena los turnos faltantes de todas las reglas activas. Es idempotente y
   * barato de repetir: se llama al abrir la agenda, así los fijos se renuevan
   * solos sin depender de un proceso aparte.
   */
  async ensureGenerated() {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const rules = await tx.recurringAppointment.findMany({
        where: { tenantId: ctx.tenantId, active: true },
        select: { id: true },
      });
      let total = 0;
      for (const r of rules) {
        const res = await this.generateFor(tx, ctx.tenantId, r.id);
        total += res.creados;
      }
      return { creados: total };
    });
  }

  /**
   * Genera los turnos de una regla hasta el horizonte.
   *
   * Saltea las fechas donde el horario ya está ocupado (por otro turno o por
   * una clase): el fijo no pisa lo que ya estaba. Y saltea las que ya generó,
   * así correrlo de nuevo no duplica nada.
   */
  private async generateFor(tx: Tx, tenantId: string, ruleId: string) {
    const rule = await tx.recurringAppointment.findFirst({
      where: { id: ruleId, tenantId },
      include: { service: { select: { durationMin: true } } },
    });
    if (!rule || !rule.active) return { creados: 0, salteados: 0 };

    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { turnoConfig: true },
    });
    const cfg = (tenant?.turnoConfig ?? {}) as Record<string, unknown>;
    const tz = tenantTimezone(cfg);
    const today = todayIn(tz);

    // Desde: lo más tarde entre hoy, el inicio de vigencia y lo ya generado.
    let cursor = today;
    const startsOn = dateOnly(rule.startsOn);
    if (startsOn && startsOn > cursor) cursor = startsOn;
    const already = dateOnly(rule.generatedUntil);
    if (already && already >= cursor) cursor = addDays(already, 1);

    // Hasta: el horizonte, recortado por la fecha de fin si tiene.
    let limit = addDays(today, HORIZON_WEEKS * 7);
    const endsOn = dateOnly(rule.endsOn);
    if (endsOn && endsOn < limit) limit = endsOn;

    const startMin = hhmmToMinutes(rule.startTime);
    const durationMin = rule.service.durationMin;
    let creados = 0;
    let salteados = 0;

    for (let d = cursor; d <= limit; d = addDays(d, 1)) {
      if (dowOf(d) !== rule.dayOfWeek) continue;
      const startAt = wallTimeToUtc(d, startMin, tz);
      const endAt = new Date(startAt.getTime() + durationMin * 60_000);

      // ¿Ya hay algo en esa cancha a esa hora? (incluye el propio fijo si ya
      // se generó, así repetir la generación no duplica.)
      const clash = await tx.appointment.findFirst({
        where: {
          tenantId,
          resourceId: rule.resourceId,
          status: { not: 'CANCELLED' },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });
      if (clash) {
        salteados++;
        continue;
      }

      await tx.appointment.create({
        data: {
          tenantId,
          customerId: rule.customerId,
          resourceId: rule.resourceId,
          serviceId: rule.serviceId,
          startAt,
          endAt,
          status: 'CONFIRMED',
          source: 'ADMIN',
          recurringId: rule.id,
          priceAtBooking: await this.priceFor(tx, tenantId, rule.serviceId, cfg, startAt, durationMin, tz),
          notes: rule.notes,
        },
      });
      creados++;
    }

    if (limit >= cursor) {
      await tx.recurringAppointment.update({
        where: { id: rule.id },
        data: { generatedUntil: toDate(limit) },
      });
    }
    return { creados, salteados };
  }

  /** Precio del turno generado: el del servicio + el recargo por luz si aplica. */
  private async priceFor(
    tx: Tx,
    tenantId: string,
    serviceId: string,
    cfg: Record<string, unknown>,
    startAt: Date,
    durationMin: number,
    tz: string,
  ): Promise<number | null> {
    const service = await tx.service.findFirst({
      where: { id: serviceId, tenantId },
      select: { price: true },
    });
    const base = service?.price != null ? Number(service.price) : 0;
    const light = lightSurcharge(cfg, startAt.toISOString(), durationMin, tz);
    const total = base + light;
    return total > 0 ? total : null;
  }
}
