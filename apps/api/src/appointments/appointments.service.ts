import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  ListAppointmentsQuery,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

const assertCanWrite = () => assertCan('appointments:write');

/** ¿El error viene de la exclusion constraint anti-superposición? */
function isOverlapConstraint(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('appointments_no_overlap') || msg.includes('23P01');
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Agenda dentro de [from, to). Incluye datos básicos para pintar el calendario. */
  list(query: ListAppointmentsQuery) {
    return this.prisma.tenantSafe(async (tx) => {
      return tx.appointment.findMany({
        where: {
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
        where: { id: input.serviceId },
        include: { resources: { select: { resourceId: true } } },
      });
      if (!service) throw new NotFoundException('Servicio no encontrado');

      const resource = await tx.resource.findFirst({
        where: { id: input.resourceId },
        select: { id: true },
      });
      if (!resource) throw new NotFoundException('Recurso no encontrado');

      // Si el servicio tiene recursos asignados, el recurso tiene que ofrecerlo.
      const linked = service.resources.map((r) => r.resourceId);
      if (linked.length && !linked.includes(input.resourceId)) {
        throw new ConflictException('Ese recurso no ofrece el servicio elegido');
      }

      const customer = await tx.customer.findFirst({
        where: { id: input.customerId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      const startAt = new Date(input.startAt);
      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);

      await this.assertNoOverlap(tx, input.resourceId, startAt, endAt);

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
            priceAtBooking: service.price ?? null,
            notes: input.notes?.trim() || null,
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
    return this.prisma.tenantSafe(async (tx) => {
      const current = await tx.appointment.findFirst({ where: { id } });
      if (!current) throw new NotFoundException('Turno no encontrado');

      const resourceId = input.resourceId ?? current.resourceId;
      const serviceId = input.serviceId ?? current.serviceId;

      // Recalcular fin si cambió servicio o inicio.
      let startAt = current.startAt;
      let endAt = current.endAt;
      let priceAtBooking = current.priceAtBooking;
      if (input.serviceId || input.startAt) {
        const service = await tx.service.findFirst({ where: { id: serviceId } });
        if (!service) throw new NotFoundException('Servicio no encontrado');
        startAt = input.startAt ? new Date(input.startAt) : current.startAt;
        endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
        if (input.serviceId) priceAtBooking = service.price ?? null;
      }

      const nextStatus = input.status ?? current.status;
      // Revalidar superposición solo si sigue activo y cambió horario/recurso.
      const movesTime = input.startAt || input.serviceId || input.resourceId;
      if (nextStatus !== 'CANCELLED' && movesTime) {
        await this.assertNoOverlap(tx, resourceId, startAt, endAt, id);
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
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.appointment.findFirst({ where: { id }, select: { id: true } });
      if (!found) throw new NotFoundException('Turno no encontrado');
      await tx.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
      return { id };
    });
  }

  /** Pre-chequeo de superposición (la exclusion constraint es el backstop de carrera). */
  private async assertNoOverlap(tx: Tx, resourceId: string, startAt: Date, endAt: Date, excludeId?: string) {
    const clash = await tx.appointment.findFirst({
      where: {
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
