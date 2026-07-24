import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SPORT_ASPECT,
  type Sport,
  type CreateResourceInput,
  type UpdateResourceInput,
  type SetResourceScheduleInput,
  type SaveCourtLayoutInput,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan, assertCanAny } from '@/auth/capabilities';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

const assertCanWrite = () => assertCan('resources:write');

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const rows = await tx.resource.findMany({
        where: { tenantId: ctx.tenantId },
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
      // Si es una cancha (tiene deporte), le damos tamaño y una posición inicial
      // en el mapa (escalonada según cuántas canchas ya hay) para que aparezca en
      // el canvas y el admin la acomode.
      const isCourt = input.sport != null;
      let { mapX = null, mapY = null, mapW = null, mapH = null, mapRotation = null } = input;
      if (isCourt) {
        const aspect = SPORT_ASPECT[input.sport as Sport] ?? SPORT_ASPECT.otro;
        if (mapW == null) mapW = aspect.w;
        if (mapH == null) mapH = aspect.h;
        if (mapRotation == null) mapRotation = 0;
        if (mapX == null || mapY == null) {
          const n = await tx.resource.count({
            where: { tenantId: ctx.tenantId, sport: { not: null } },
          });
          mapX = 40 + (n % 6) * 40;
          mapY = 40 + Math.floor(n / 6) * 60 + (n % 2) * 20;
        }
      }
      return tx.resource.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name.trim(),
          title: input.title?.trim() || null,
          phone: input.phone?.trim() || null,
          avatarUrl: input.avatarUrl || null,
          color: input.color || null,
          active: input.active,
          sortOrder: input.sortOrder,
          userId: input.userId ?? null,
          sport: input.sport ?? null,
          surface: input.surface?.trim() || null,
          // Por defecto, los espacios "Otra" (bar/entrada) nacen como referencia;
          // las canchas de un deporte real nacen como alquiler.
          reference: input.reference ?? input.sport === 'otro',
          mapX,
          mapY,
          mapW,
          mapH,
          mapRotation,
        },
        select: { id: true },
      });
    });
  }

  update(id: string, input: UpdateResourceInput) {
    // Si SOLO se cambia activo/inactivo alcanza con 'resources:toggle' (ej: un
    // profe deshabilita una cancha). Cualquier otro cambio exige 'resources:write'.
    const { active: _active, ...rest } = input;
    const touchesWrite = Object.values(rest).some((v) => v !== undefined);
    if (touchesWrite) assertCanWrite();
    else assertCanAny(['resources:toggle', 'resources:write']);
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!found) throw new NotFoundException('Recurso no encontrado');
      return tx.resource.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
          ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
          ...(input.color !== undefined ? { color: input.color || null } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.userId !== undefined ? { userId: input.userId ?? null } : {}),
          ...(input.sport !== undefined ? { sport: input.sport ?? null } : {}),
          ...(input.surface !== undefined ? { surface: input.surface?.trim() || null } : {}),
          ...(input.reference !== undefined ? { reference: input.reference } : {}),
          ...(input.mapX !== undefined ? { mapX: input.mapX } : {}),
          ...(input.mapY !== undefined ? { mapY: input.mapY } : {}),
          ...(input.mapW !== undefined ? { mapW: input.mapW } : {}),
          ...(input.mapH !== undefined ? { mapH: input.mapH } : {}),
          ...(input.mapRotation !== undefined ? { mapRotation: input.mapRotation } : {}),
        },
        select: { id: true },
      });
    });
  }

  /** Guarda en lote las posiciones/rotaciones de las canchas (editor de mapa). */
  saveLayout(input: SaveCourtLayoutInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      for (const c of input.courts) {
        await tx.resource.updateMany({
          where: { id: c.id, tenantId: ctx.tenantId },
          data: {
            mapX: c.mapX,
            mapY: c.mapY,
            mapW: c.mapW,
            mapH: c.mapH,
            mapRotation: c.mapRotation,
            ...(c.name !== undefined ? { name: c.name.trim() } : {}),
            ...(c.color !== undefined ? { color: c.color } : {}),
            ...(c.reference !== undefined ? { reference: c.reference } : {}),
          },
        });
      }
      return { ok: true };
    });
  }

  remove(id: string) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!found) throw new NotFoundException('Recurso no encontrado');
      // Restrict en appointments: si tiene turnos, la FK lo frena. Damos mensaje claro.
      const withTurnos = await tx.appointment.count({ where: { resourceId: id, tenantId: ctx.tenantId } });
      if (withTurnos > 0) {
        throw new ForbiddenException('El recurso tiene turnos; desactivalo en vez de borrarlo');
      }
      await tx.resource.delete({ where: { id } });
      return { id };
    });
  }

  // ── Horario semanal ─────────────────────────────────────────
  getSchedule(resourceId: string) {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({
        where: { id: resourceId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Recurso no encontrado');
      const days = await tx.resourceSchedule.findMany({
        where: { resourceId, tenantId: ctx.tenantId },
        orderBy: { dayOfWeek: 'asc' },
        select: { dayOfWeek: true, ranges: true },
      });
      return days;
    });
  }

  setSchedule(resourceId: string, input: SetResourceScheduleInput) {
    assertCan('schedule:write');
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.resource.findFirst({
        where: { id: resourceId, tenantId: ctx.tenantId },
        select: { id: true },
      });
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
