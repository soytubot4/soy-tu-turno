import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PortalBookInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { AvailabilityService } from '@/appointments/availability.service';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

/**
 * API pública del portal del cliente (<slug>.soytuturno.com). No hay sesión de
 * Supabase: el tenant se resuelve por el slug del subdominio (header
 * x-tenant-slug) y las queries corren con RLS vía tenantSafe(fn, tenantId).
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  private async tenantId(slug: string): Promise<string> {
    const tenant = await this.prisma.resolveTenantBySlug(slug);
    if (!tenant) throw new NotFoundException('Comercio no encontrado');
    return tenant.id;
  }

  /** Info pública del comercio + servicios activos (para armar la pantalla). */
  async info(slug: string) {
    const tenantId = await this.tenantId(slug);
    return this.prisma.tenantSafe(async (tx) => {
      const tenant = await tx.tenant.findFirst({
        select: { name: true, logoUrl: true, address: true, phone: true, currency: true },
      });
      const services = await tx.service.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, description: true, durationMin: true, price: true },
      });
      return { tenant, services };
    }, tenantId);
  }

  /** Slots libres para un servicio en una fecha (reusa el motor de disponibilidad). */
  async availabilityFor(slug: string, serviceId: string, date: string, resourceId?: string) {
    const tenantId = await this.tenantId(slug);
    return this.availability.getSlots({ serviceId, resourceId, date }, tenantId);
  }

  /** Reserva self-service: crea (o reusa) el cliente por teléfono y agenda el turno. */
  async book(slug: string, input: PortalBookInput) {
    const tenantId = await this.tenantId(slug);

    // 1) El horario elegido tiene que seguir libre (valida horario del local + choques).
    const slots = await this.availability.getSlots(
      { serviceId: input.serviceId, resourceId: input.resourceId, date: input.date },
      tenantId,
    );
    const stillFree = slots.some(
      (s) => s.startAt === input.startAt && s.resourceId === input.resourceId,
    );
    if (!stillFree) throw new ConflictException('Ese horario ya no está disponible');

    // 2) Alta del turno dentro de una transacción con RLS del tenant.
    return this.prisma.tenantSafe(async (tx) => {
      const service = await tx.service.findFirst({
        where: { id: input.serviceId, active: true },
      });
      if (!service) throw new NotFoundException('Servicio no disponible');

      const customer = await this.findOrCreateCustomer(tx, tenantId, input);

      const startAt = new Date(input.startAt);
      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);

      // Pre-chequeo de choque (la exclusion constraint es el backstop de carrera).
      const clash = await tx.appointment.findFirst({
        where: {
          resourceId: input.resourceId,
          status: { not: 'CANCELLED' },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Ese horario ya no está disponible');

      try {
        const appt = await tx.appointment.create({
          data: {
            tenantId,
            customerId: customer.id,
            resourceId: input.resourceId,
            serviceId: input.serviceId,
            startAt,
            endAt,
            status: 'CONFIRMED',
            source: 'WEB',
            priceAtBooking: service.price ?? null,
          },
          select: { id: true, startAt: true, endAt: true },
        });
        return { ...appt, customerId: customer.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('appointments_no_overlap') || msg.includes('23P01')) {
          throw new ConflictException('Ese horario ya no está disponible');
        }
        throw err;
      }
    }, tenantId);
  }

  private async findOrCreateCustomer(tx: Tx, tenantId: string, input: PortalBookInput) {
    const phone = input.phone.trim();
    const existing = await tx.customer.findFirst({ where: { phone }, select: { id: true } });
    if (existing) return existing;
    return tx.customer.create({
      data: {
        tenantId,
        firstName: input.firstName.trim(),
        lastName: input.lastName?.trim() || null,
        phone,
      },
      select: { id: true },
    });
  }
}
