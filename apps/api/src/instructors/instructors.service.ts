import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@soytuturno/db';
import type {
  ClassRange,
  CreateInstructorInput,
  UpdateInstructorInput,
  InstructorSlotInput,
  SlotExceptionInput,
  Instructor,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

const assertCanWrite = () => assertCan('resources:write');

/** 'YYYY-MM-DD' desde una columna DATE, sin correrse por timezone. */
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** Medianoche de hoy (para filtrar excepciones pasadas). */
function startOfToday(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
}
/** 'YYYY-MM-DD' → Date UTC a medianoche (para columnas DATE). */
const toDate = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
/** Los tramos vienen de una columna JSON: los leemos con cuidado. */
function readRanges(value: unknown): ClassRange[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter(
    (r): r is ClassRange =>
      !!r && typeof r === 'object' && typeof (r as ClassRange).from === 'string' && typeof (r as ClassRange).to === 'string',
  );
  return out.length ? out : null;
}

/**
 * Profesores del club y sus horarios de clase. No son recursos reservables: sus
 * franjas ocupan la cancha y se descuentan de la disponibilidad.
 */
@Injectable()
export class InstructorsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Instructor[]> {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const rows = await tx.instructor.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          slots: {
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
            // Solo las de acá en adelante: las viejas no cambian nada.
            include: { exceptions: { where: { date: { gte: startOfToday() } } } },
          },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        notes: r.notes,
        active: r.active,
        sortOrder: r.sortOrder,
        slots: r.slots.map((s) => ({
          id: s.id,
          resourceId: s.resourceId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
          startsOn: dateOnly(s.startsOn),
          endsOn: dateOnly(s.endsOn),
          active: s.active,
          exceptions: s.exceptions.map((e) => ({
            id: e.id,
            slotId: e.slotId,
            date: dateOnly(e.date)!,
            cancelled: e.cancelled,
            startTime: e.startTime,
            endTime: e.endTime,
            ranges: readRanges(e.ranges),
            resourceId: e.resourceId,
          })),
        })),
      }));
    });
  }

  create(input: CreateInstructorInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe((tx) =>
      tx.instructor.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          notes: input.notes?.trim() || null,
          active: input.active,
          sortOrder: input.sortOrder,
        },
        select: { id: true },
      }),
    );
  }

  update(id: string, input: UpdateInstructorInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.instructor.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!found) throw new NotFoundException('Profesor no encontrado');
      return tx.instructor.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
        select: { id: true },
      });
    });
  }

  remove(id: string) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.instructor.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!found) throw new NotFoundException('Profesor no encontrado');
      // Las franjas se van con él (cascade): dejan de ocupar la cancha.
      await tx.instructor.delete({ where: { id } });
      return { id };
    });
  }

  // ─── Franjas de clase ───

  addSlot(instructorId: string, input: InstructorSlotInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const prof = await tx.instructor.findFirst({
        where: { id: instructorId, tenantId: ctx.tenantId },
      });
      if (!prof) throw new NotFoundException('Profesor no encontrado');
      await this.assertResource(tx, ctx.tenantId, input.resourceId);
      return tx.instructorSlot.create({
        data: {
          tenantId: ctx.tenantId,
          instructorId,
          resourceId: input.resourceId ?? null,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          label: input.label?.trim() || null,
          startsOn: toDate(input.startsOn),
          endsOn: toDate(input.endsOn),
          active: input.active,
        },
        select: { id: true },
      });
    });
  }

  updateSlot(slotId: string, input: InstructorSlotInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.instructorSlot.findFirst({
        where: { id: slotId, tenantId: ctx.tenantId },
      });
      if (!found) throw new NotFoundException('Horario no encontrado');
      await this.assertResource(tx, ctx.tenantId, input.resourceId);
      return tx.instructorSlot.update({
        where: { id: slotId },
        data: {
          resourceId: input.resourceId ?? null,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          label: input.label?.trim() || null,
          startsOn: toDate(input.startsOn),
          endsOn: toDate(input.endsOn),
          active: input.active,
        },
        select: { id: true },
      });
    });
  }

  removeSlot(slotId: string) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.instructorSlot.findFirst({
        where: { id: slotId, tenantId: ctx.tenantId },
      });
      if (!found) throw new NotFoundException('Horario no encontrado');
      await tx.instructorSlot.delete({ where: { id: slotId } });
      return { id: slotId };
    });
  }

  /**
   * Guarda lo que cambia de una clase SOLO para una fecha (se movió de horario
   * o de cancha, o ese día no hay). Si no cambia nada, borra la excepción.
   */
  setException(slotId: string, input: SlotExceptionInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const slot = await tx.instructorSlot.findFirst({
        where: { id: slotId, tenantId: ctx.tenantId },
      });
      if (!slot) throw new NotFoundException('Horario no encontrado');
      await this.assertResource(tx, ctx.tenantId, input.resourceId);

      const date = toDate(input.date)!;
      // Guardar la clase tal cual está configurada no es una excepción: es la
      // clase de siempre, así que en vez de anotar nada, borramos.
      const tramos = (input.ranges ?? []).filter((r) => r.from && r.to);
      const mismoHorario =
        tramos.length <= 1 &&
        (!tramos[0] || (tramos[0].from === slot.startTime && tramos[0].to === slot.endTime));
      const mismaCancha = (input.resourceId ?? null) === slot.resourceId;
      const sinCambios = !input.cancelled && mismoHorario && mismaCancha;
      if (sinCambios) {
        // Volver a "como siempre" es borrar la excepción.
        await tx.instructorSlotException.deleteMany({ where: { slotId, date } });
        return { slotId, date: input.date, cleared: true };
      }

      const data = {
        cancelled: input.cancelled,
        // Los tramos mandan; startTime/endTime quedan solo para lo viejo.
        startTime: null,
        endTime: null,
        ranges: input.cancelled || !tramos.length ? Prisma.DbNull : tramos,
        resourceId: input.cancelled ? null : (input.resourceId ?? null),
      };
      const existing = await tx.instructorSlotException.findFirst({ where: { slotId, date } });
      if (existing) {
        await tx.instructorSlotException.update({ where: { id: existing.id }, data });
      } else {
        await tx.instructorSlotException.create({
          data: { tenantId: ctx.tenantId, slotId, date, ...data },
        });
      }
      return { slotId, date: input.date, cleared: false };
    });
  }

  /** La cancha tiene que ser del mismo comercio (null = todas). */
  private async assertResource(
    tx: Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0],
    tenantId: string,
    resourceId: string | null | undefined,
  ) {
    if (!resourceId) return;
    const r = await tx.resource.findFirst({ where: { id: resourceId, tenantId } });
    if (!r) throw new NotFoundException('Cancha no encontrada');
  }
}
