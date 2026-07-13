import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateResourceInput,
  UpdateResourceInput,
  SetResourceScheduleInput,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

/** Fase 1: escrituras solo OWNER/MANAGER. Después migramos a capabilities. */
function assertCanWrite() {
  const { role } = requireTenantContext();
  if (role !== 'OWNER' && role !== 'MANAGER') {
    throw new ForbiddenException('No tenés permiso para esta acción');
  }
}

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.tenantSafe(async (tx) => {
      const rows = await tx.resource.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { services: { select: { serviceId: true } } },
      });
      return rows.map((r) => ({ ...r, serviceIds: r.services.map((s) => s.serviceId) }));
    });
  }

  create(input: CreateResourceInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      return tx.resource.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name.trim(),
          title: input.title?.trim() || null,
          avatarUrl: input.avatarUrl || null,
          color: input.color || null,
          active: input.active,
          sortOrder: input.sortOrder,
          userId: input.userId ?? null,
        },
        select: { id: true },
      });
    });
  }

  update(id: string, input: UpdateResourceInput) {
    assertCanWrite();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({ where: { id } });
      if (!found) throw new NotFoundException('Recurso no encontrado');
      return tx.resource.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
          ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
          ...(input.color !== undefined ? { color: input.color || null } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.userId !== undefined ? { userId: input.userId ?? null } : {}),
        },
        select: { id: true },
      });
    });
  }

  remove(id: string) {
    assertCanWrite();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({ where: { id } });
      if (!found) throw new NotFoundException('Recurso no encontrado');
      // Restrict en appointments: si tiene turnos, la FK lo frena. Damos mensaje claro.
      const withTurnos = await tx.appointment.count({ where: { resourceId: id } });
      if (withTurnos > 0) {
        throw new ForbiddenException('El recurso tiene turnos; desactivalo en vez de borrarlo');
      }
      await tx.resource.delete({ where: { id } });
      return { id };
    });
  }

  // ── Horario semanal ─────────────────────────────────────────
  getSchedule(resourceId: string) {
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({ where: { id: resourceId }, select: { id: true } });
      if (!found) throw new NotFoundException('Recurso no encontrado');
      const days = await tx.resourceSchedule.findMany({
        where: { resourceId },
        orderBy: { dayOfWeek: 'asc' },
        select: { dayOfWeek: true, ranges: true },
      });
      return days;
    });
  }

  setSchedule(resourceId: string, input: SetResourceScheduleInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({ where: { id: resourceId }, select: { id: true } });
      if (!found) throw new NotFoundException('Recurso no encontrado');
      // Reemplazo total: filtramos franjas vacías y upserteamos por día.
      for (const day of input.days) {
        const ranges = day.ranges.filter((r) => r.from && r.to && r.from < r.to);
        await this.upsertDay(tx, ctx.tenantId, resourceId, day.dayOfWeek, ranges);
      }
      return { ok: true };
    });
  }

  private async upsertDay(
    tx: Tx,
    tenantId: string,
    resourceId: string,
    dayOfWeek: number,
    ranges: { from: string; to: string }[],
  ) {
    await tx.resourceSchedule.upsert({
      where: { resourceId_dayOfWeek: { resourceId, dayOfWeek } },
      create: { tenantId, resourceId, dayOfWeek, ranges },
      update: { ranges },
    });
  }
}
