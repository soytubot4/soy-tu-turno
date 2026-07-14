import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateScheduleBlockInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

const assertCanWrite = () => assertCan('schedule:write');

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bloqueos en una ventana de fechas (inclusive). Opcional por recurso. */
  list(from: string, to: string, resourceId?: string) {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      return tx.scheduleBlock.findMany({
        where: {
          tenantId: ctx.tenantId,
          date: { gte: new Date(from), lte: new Date(to) },
          ...(resourceId ? { resourceId } : {}),
        },
        orderBy: [{ date: 'asc' }, { startAt: 'asc' }],
      });
    });
  }

  create(input: CreateScheduleBlockInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      if (input.resourceId) {
        const r = await tx.resource.findFirst({
          where: { id: input.resourceId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!r) throw new NotFoundException('Recurso no encontrado');
      }
      if (!input.allDay && (!input.startAt || !input.endAt)) {
        throw new BadRequestException('Un bloqueo por horas necesita inicio y fin');
      }
      if (!input.allDay && input.startAt! >= input.endAt!) {
        throw new BadRequestException('El fin tiene que ser posterior al inicio');
      }
      return tx.scheduleBlock.create({
        data: {
          tenantId: ctx.tenantId,
          resourceId: input.resourceId ?? null,
          date: new Date(input.date),
          allDay: input.allDay,
          startAt: input.allDay ? null : new Date(input.startAt!),
          endAt: input.allDay ? null : new Date(input.endAt!),
          reason: input.reason?.trim() || null,
        },
        select: { id: true },
      });
    });
  }

  remove(id: string) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.scheduleBlock.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Bloqueo no encontrado');
      await tx.scheduleBlock.delete({ where: { id } });
      return { id };
    });
  }
}
