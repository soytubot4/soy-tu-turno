import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  playerPrice,
  isWeekendDate,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
  type ListAppointmentsQuery,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';
import { ProductsService } from '@/products/products.service';
import { lightSurcharge } from '@/common/time';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

const assertCanWrite = () => assertCan('appointments:write');

/** ¿El error viene de la exclusion constraint anti-superposición? */
function isOverlapConstraint(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('appointments_no_overlap') || msg.includes('23P01');
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  /** Agenda dentro de [from, to). Incluye datos básicos para pintar el calendario. */
  list(query: ListAppointmentsQuery) {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      return tx.appointment.findMany({
        where: {
          tenantId: ctx.tenantId,
          startAt: { gte: new Date(query.from), lt: new Date(query.to) },
          ...(query.resourceId ? { resourceId: query.resourceId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          source: true,
          notes: true,
          priceAtBooking: true,
          players: true,
          products: true,
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
          resource: { select: { id: true, name: true, color: true } },
          service: { select: { id: true, name: true, durationMin: true, color: true } },
        },
      });
    });
  }

  create(input: CreateAppointmentInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const service = await tx.service.findFirst({
        where: { id: input.serviceId, tenantId: ctx.tenantId },
        include: { resources: { select: { resourceId: true } } },
      });
      if (!service) throw new NotFoundException('Servicio no encontrado');

      const resource = await tx.resource.findFirst({
        where: { id: input.resourceId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!resource) throw new NotFoundException('Recurso no encontrado');

      // Si el servicio tiene recursos asignados, el recurso tiene que ofrecerlo.
      const linked = service.resources.map((r) => r.resourceId);
      if (linked.length && !linked.includes(input.resourceId)) {
        throw new ConflictException('Ese recurso no ofrece el servicio elegido');
      }

      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      const startAt = new Date(input.startAt);
      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);

      await this.assertNoOverlap(tx, ctx.tenantId, input.resourceId, startAt, endAt);

      // Jugadores + precio por jugador (según config del tenant, con finde si aplica).
      const tenant = await tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { turnoConfig: true },
      });
      const cfg = (tenant?.turnoConfig ?? {}) as Record<string, unknown>;
      const tz = typeof cfg.timezone === 'string' ? cfg.timezone : 'America/Argentina/Buenos_Aires';
      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(startAt);
      const weekend = cfg.priceWeekendEnabled === true && isWeekendDate(localDate);
      const cats = (await tx.playerCategory.findMany({ where: { tenantId: ctx.tenantId } })).map((c) => ({
        id: c.id,
        name: c.name,
        price: c.price != null ? Number(c.price) : null,
        priceWeekend: c.priceWeekend != null ? Number(c.priceWeekend) : null,
      }));
      // El turno guarda el nombre y el precio de la categoría, así que el
      // histórico no cambia si después la renombran o la borran.
      const players = (input.players ?? [])
        .filter((p) => p.firstName?.trim())
        .map((p) => ({
          firstName: p.firstName.trim(),
          lastName: (p.lastName ?? '').trim(),
          categoryId: p.categoryId ?? null,
          categoryName: cats.find((c) => c.id === p.categoryId)?.name ?? null,
          price: playerPrice(p.categoryId, cats, weekend),
        }));
      const playersTotal = players.reduce((sum, p) => sum + (p.price ?? 0), 0);
      const hasAnyPrice = players.some((p) => p.price != null);

      // Reserva de productos (descuenta stock dentro de la misma tx).
      const reserved = await this.products.reserve(tx, ctx.tenantId, input.products ?? []);
      const productsTotal = reserved.reduce((s, p) => s + (p.price ?? 0) * p.qty, 0);
      const baseTotal = hasAnyPrice ? playersTotal : service.price != null ? Number(service.price) : 0;
      // Recargo por luz: monto fijo del turno si usa luz artificial.
      const light = lightSurcharge(cfg, input.startAt, service.durationMin, tz);
      const anyPrice = hasAnyPrice || service.price != null || productsTotal > 0 || light > 0;

      try {
        return await tx.appointment.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: input.customerId,
            resourceId: input.resourceId,
            serviceId: input.serviceId,
            startAt,
            endAt,
            status: 'CONFIRMED',
            source: 'ADMIN',
            priceAtBooking: anyPrice ? baseTotal + productsTotal + light : null,
            notes: input.notes?.trim() || null,
            players: players.length ? players : undefined,
            products: reserved.length ? reserved : undefined,
          },
          select: { id: true },
        });
      } catch (err) {
        if (isOverlapConstraint(err)) throw new ConflictException('Ese horario ya está ocupado');
        throw err;
      }
    });
  }

  update(id: string, input: UpdateAppointmentInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const current = await tx.appointment.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!current) throw new NotFoundException('Turno no encontrado');

      const resourceId = input.resourceId ?? current.resourceId;
      const serviceId = input.serviceId ?? current.serviceId;

      // Recalcular fin si cambió servicio o inicio.
      let startAt = current.startAt;
      let endAt = current.endAt;
      let priceAtBooking = current.priceAtBooking;
      if (input.serviceId || input.startAt) {
        const service = await tx.service.findFirst({ where: { id: serviceId, tenantId: ctx.tenantId } });
        if (!service) throw new NotFoundException('Servicio no encontrado');
        startAt = input.startAt ? new Date(input.startAt) : current.startAt;
        endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
        if (input.serviceId) priceAtBooking = service.price ?? null;
      }

      const nextStatus = input.status ?? current.status;
      // Revalidar superposición solo si sigue activo y cambió horario/recurso.
      const movesTime = input.startAt || input.serviceId || input.resourceId;
      if (nextStatus !== 'CANCELLED' && movesTime) {
        await this.assertNoOverlap(tx, ctx.tenantId, resourceId, startAt, endAt, id);
      }

      try {
        return await tx.appointment.update({
          where: { id },
          data: {
            resourceId,
            serviceId,
            startAt,
            endAt,
            priceAtBooking,
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          },
          select: { id: true },
        });
      } catch (err) {
        if (isOverlapConstraint(err)) throw new ConflictException('Ese horario ya está ocupado');
        throw err;
      }
    });
  }

  /** Cancela (soft): no borra, marca CANCELLED para conservar el historial. */
  cancel(id: string) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.appointment.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, status: true, products: true },
      });
      if (!found) throw new NotFoundException('Turno no encontrado');
      // Devolver el stock de los productos reservados (si no estaba ya cancelado).
      if (found.status !== 'CANCELLED') {
        await this.products.restore(tx, ctx.tenantId, found.products);
      }
      await tx.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
      return { id };
    });
  }

  /** Pre-chequeo de superposición (la exclusion constraint es el backstop de carrera). */
  private async assertNoOverlap(
    tx: Tx,
    tenantId: string,
    resourceId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const clash = await tx.appointment.findFirst({
      where: {
        tenantId,
        resourceId,
        status: { not: 'CANCELLED' },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Ese horario ya está ocupado para el recurso');
  }
}
