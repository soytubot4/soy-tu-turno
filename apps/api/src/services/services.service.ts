import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateServiceInput, UpdateServiceInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

const assertCanWrite = () => assertCan('services:write');

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.tenantSafe(async (tx) => {
      const rows = await tx.service.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { resources: { select: { resourceId: true } } },
      });
      // Aplanamos los links → ids de recursos que ofrecen el servicio.
      return rows.map((s) => ({ ...s, resourceIds: s.resources.map((r) => r.resourceId) }));
    });
  }

  create(input: CreateServiceInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const service = await tx.service.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          durationMin: input.durationMin,
          price: input.price ?? null,
          color: input.color || null,
          active: input.active,
          sortOrder: input.sortOrder,
        },
        select: { id: true },
      });
      await this.syncResources(tx, ctx.tenantId, service.id, input.resourceIds);
      return service;
    });
  }

  update(id: string, input: UpdateServiceInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.service.findFirst({ where: { id } });
      if (!found) throw new NotFoundException('Servicio no encontrado');
      const updated = await tx.service.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
          ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
          ...(input.price !== undefined ? { price: input.price ?? null } : {}),
          ...(input.color !== undefined ? { color: input.color || null } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
        select: { id: true },
      });
      if (input.resourceIds !== undefined) {
        await this.syncResources(tx, ctx.tenantId, id, input.resourceIds);
      }
      return updated;
    });
  }

  remove(id: string) {
    assertCanWrite();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.service.findFirst({ where: { id } });
      if (!found) throw new NotFoundException('Servicio no encontrado');
      await tx.service.delete({ where: { id } });
      return { id };
    });
  }

  /** Reemplaza el set de recursos que ofrecen el servicio (solo recursos del tenant). */
  private async syncResources(tx: Tx, tenantId: string, serviceId: string, resourceIds: string[]) {
    const valid = await tx.resource.findMany({
      where: { id: { in: resourceIds } },
      select: { id: true },
    });
    const validIds = valid.map((r) => r.id);
    await tx.resourceService.deleteMany({
      where: { serviceId, ...(validIds.length ? { resourceId: { notIn: validIds } } : {}) },
    });
    if (validIds.length) {
      const existing = await tx.resourceService.findMany({
        where: { serviceId },
        select: { resourceId: true },
      });
      const existingIds = new Set(existing.map((e) => e.resourceId));
      const toCreate = validIds.filter((rid) => !existingIds.has(rid));
      if (toCreate.length) {
        await tx.resourceService.createMany({
          data: toCreate.map((resourceId) => ({ tenantId, serviceId, resourceId })),
        });
      }
    }
  }
}
