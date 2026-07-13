import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PortalBookInput, PortalReviewInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { AvailabilityService } from '@/appointments/availability.service';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

/** Promedio (1 decimal) + cantidad de un set de puntuaciones. */
function ratingOf(ratings: number[]): { avg: number | null; count: number } {
  if (!ratings.length) return { avg: null, count: 0 };
  const sum = ratings.reduce((a, b) => a + b, 0);
  return { avg: Math.round((sum / ratings.length) * 10) / 10, count: ratings.length };
}

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

  /** Info pública del comercio + servicios + profesionales, con rating de cada uno. */
  async info(slug: string) {
    const tenantId = await this.tenantId(slug);
    const base = await this.prisma.tenantSafe(async (tx) => {
      const tenant = await tx.tenant.findFirst({
        select: { name: true, logoUrl: true, address: true, phone: true, currency: true },
      });
      const services = await tx.service.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, description: true, durationMin: true, price: true },
      });
      const resources = await tx.resource.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, title: true, avatarUrl: true },
      });
      return { tenant, services, resources };
    }, tenantId);

    // Ratings en una tx aparte y tolerante: si la tabla reviews aún no se creó,
    // devolvemos "sin reseñas" en vez de romper el portal.
    let business = ratingOf([]);
    const byResource = new Map<string, number[]>();
    try {
      const all = await this.prisma.tenantSafe(
        (tx) => tx.review.findMany({ select: { resourceId: true, rating: true } }),
        tenantId,
      );
      business = ratingOf(all.map((r) => r.rating));
      for (const r of all) {
        if (!r.resourceId) continue;
        const arr = byResource.get(r.resourceId) ?? [];
        arr.push(r.rating);
        byResource.set(r.resourceId, arr);
      }
    } catch {
      // tabla reviews todavía no creada
    }

    return {
      tenant: base.tenant,
      rating: business,
      services: base.services,
      resources: base.resources.map((r) => ({ ...r, rating: ratingOf(byResource.get(r.id) ?? []) })),
    };
  }

  /** Deja una reseña del negocio (sin resourceId) o de un profesional. */
  async review(slug: string, input: PortalReviewInput) {
    const tenantId = await this.tenantId(slug);
    return this.prisma.tenantSafe(async (tx) => {
      if (input.resourceId) {
        const r = await tx.resource.findFirst({
          where: { id: input.resourceId },
          select: { id: true },
        });
        if (!r) throw new BadRequestException('El profesional no existe');
      }
      let customerId: string | null = null;
      if (input.phone?.trim()) {
        const c = await tx.customer.findFirst({
          where: { phone: input.phone.trim() },
          select: { id: true },
        });
        customerId = c?.id ?? null;
      }
      await tx.review.create({
        data: {
          tenantId,
          resourceId: input.resourceId ?? null,
          customerId,
          rating: input.rating,
          comment: input.comment?.trim() || null,
          authorName: input.authorName?.trim() || null,
        },
      });
      return { ok: true };
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
