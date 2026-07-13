import { ConflictException, Injectable } from '@nestjs/common';
import type { CreateCustomerInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca clientes por nombre, apellido o teléfono (para el alta de turnos). */
  search(q?: string) {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const term = q?.trim();
      // `customers` es tabla compartida sin RLS por tenant → filtramos explícito.
      return tx.customer.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(term
            ? {
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                  { phone: { contains: term } },
                ],
              }
            : {}),
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: 20,
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
    });
  }

  create(input: CreateCustomerInput) {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const phone = input.phone?.trim() || null;
      if (phone) {
        const dup = await tx.customer.findFirst({
          where: { phone, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (dup) throw new ConflictException('Ya hay un cliente con ese teléfono');
      }
      return tx.customer.create({
        data: {
          tenantId: ctx.tenantId,
          firstName: input.firstName.trim(),
          lastName: input.lastName?.trim() || null,
          phone,
          email: input.email?.trim() || null,
        },
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
    });
  }
}
