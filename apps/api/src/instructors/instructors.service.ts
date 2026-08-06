import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateInstructorInput,
  UpdateInstructorInput,
  InstructorSlotInput,
  Instructor,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

const assertCanWrite = () => assertCan('resources:write');

/** 'YYYY-MM-DD' desde una columna DATE, sin correrse por timezone. */
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** 'YYYY-MM-DD' → Date UTC a medianoche (para columnas DATE). */
const toDate = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);

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
          slots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
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
