import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePlayerCategoryInput,
  UpdatePlayerCategoryInput,
  PlayerCategoryDto,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

const assertCanWrite = () => assertCan('settings:write');

/** Categorías de persona (cuánto paga cada una) configurables por el club. */
@Injectable()
export class PlayerCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<PlayerCategoryDto[]> {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const rows = await tx.playerCategory.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map(toDto);
    });
  }

  create(input: CreatePlayerCategoryInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      // Si no mandan orden, va al final de la lista.
      const sortOrder = input.sortOrder || (await tx.playerCategory.count({ where: { tenantId: ctx.tenantId } }));
      const row = await tx.playerCategory.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name.trim(),
          price: input.price ?? null,
          priceWeekend: input.priceWeekend ?? null,
          sortOrder,
          active: input.active,
        },
      });
      return toDto(row);
    });
  }

  update(id: string, input: UpdatePlayerCategoryInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.playerCategory.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!found) throw new NotFoundException('Categoría no encontrada');
      const row = await tx.playerCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.price !== undefined ? { price: input.price ?? null } : {}),
          ...(input.priceWeekend !== undefined ? { priceWeekend: input.priceWeekend ?? null } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      return toDto(row);
    });
  }

  remove(id: string) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const found = await tx.playerCategory.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!found) throw new NotFoundException('Categoría no encontrada');
      // Los turnos ya reservados guardan el nombre y el precio dentro del JSON
      // `players`, así que borrar la categoría no les cambia el histórico.
      await tx.playerCategory.delete({ where: { id } });
      return { id };
    });
  }
}

/** Decimal de Prisma → number (o null si no está configurado). */
function toDto(row: {
  id: string;
  name: string;
  price: unknown;
  priceWeekend: unknown;
  sortOrder: number;
  active: boolean;
}): PlayerCategoryDto {
  return {
    id: row.id,
    name: row.name,
    price: row.price != null ? Number(row.price) : null,
    priceWeekend: row.priceWeekend != null ? Number(row.priceWeekend) : null,
    sortOrder: row.sortOrder,
    active: row.active,
  };
}
