import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  playerPrice,
  isWeekendDate,
  type PortalBookInput,
  type PortalReviewInput,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { AvailabilityService } from '@/appointments/availability.service';
import { ProductsService } from '@/products/products.service';

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
    private readonly products: ProductsService,
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
        where: { id: tenantId },
        select: {
          name: true,
          logoUrl: true,
          address: true,
          phone: true,
          currency: true,
          turnoConfig: true,
        },
      });
      const services = await tx.service.findMany({
        where: { active: true, tenantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          durationMin: true,
          price: true,
          priceUnit: true,
          askPeople: true,
          peopleCount: true,
        },
      });
      const resources = await tx.resource.findMany({
        // Canchas de alquiler activas + todas las referencias del mapa (bar,
        // entrada, etc.) aunque estén inactivas — se ven pero no se reservan.
        where: { tenantId, OR: [{ reference: true }, { active: true }] },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          title: true,
          avatarUrl: true,
          color: true,
          sport: true,
          surface: true,
          reference: true,
          mapX: true,
          mapY: true,
          mapW: true,
          mapH: true,
          mapRotation: true,
        },
      });
      const cfg0 = (tenant?.turnoConfig ?? {}) as Record<string, unknown>;
      const products = cfg0.productsEnabled === true ? await this.products.offerings(tx, tenantId) : [];
      // Categorías de persona (cuánto paga cada una) para el selector del portal.
      const cats = await tx.playerCategory.findMany({
        where: { tenantId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const playerCategories = cats.map((c) => ({
        id: c.id,
        name: c.name,
        price: c.price != null ? Number(c.price) : null,
        priceWeekend: c.priceWeekend != null ? Number(c.priceWeekend) : null,
        sortOrder: c.sortOrder,
        active: c.active,
      }));
      return { tenant, services, resources, products, playerCategories };
    }, tenantId);

    // Ratings en una tx aparte y tolerante: si la tabla reviews aún no se creó,
    // devolvemos "sin reseñas" en vez de romper el portal.
    let business = ratingOf([]);
    const byResource = new Map<string, number[]>();
    try {
      const all = await this.prisma.tenantSafe(
        (tx) => tx.review.findMany({ where: { tenantId }, select: { resourceId: true, rating: true } }),
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

    const cfg = (base.tenant?.turnoConfig ?? {}) as Record<string, unknown>;
    const { turnoConfig: _omit, ...tenantPublic } = base.tenant ?? {};
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      tenant: tenantPublic,
      canchas: cfg.canchas === true,
      askPlayers: cfg.askPlayers === true,
      weekendPricing: cfg.priceWeekendEnabled === true,
      playerCategories: base.playerCategories,
      rating: business,
      services: base.services,
      products: base.products,
      resources: base.resources.map((r) => ({ ...r, rating: ratingOf(byResource.get(r.id) ?? []) })),
    };
  }

  /** Deja una reseña del negocio (sin resourceId) o de un profesional. */
  async review(slug: string, input: PortalReviewInput) {
    const tenantId = await this.tenantId(slug);
    return this.prisma.tenantSafe(async (tx) => {
      if (input.resourceId) {
        const r = await tx.resource.findFirst({
          where: { id: input.resourceId, tenantId },
          select: { id: true },
        });
        if (!r) throw new BadRequestException('El profesional no existe');
      }
      let customerId: string | null = null;
      if (input.phone?.trim()) {
        const c = await tx.customer.findFirst({
          where: { phone: input.phone.trim(), tenantId },
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
        where: { id: input.serviceId, active: true, tenantId },
      });
      if (!service) throw new NotFoundException('Servicio no disponible');

      const customer = await this.findOrCreateCustomer(tx, tenantId, input);

      const startAt = new Date(input.startAt);
      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);

      // Pre-chequeo de choque (la exclusion constraint es el backstop de carrera).
      const clash = await tx.appointment.findFirst({
        where: {
          tenantId,
          resourceId: input.resourceId,
          status: { not: 'CANCELLED' },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Ese horario ya no está disponible');

      try {
        // Precio de cada persona según su categoría (la configura el club).
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { turnoConfig: true },
        });
        const cfg = (tenant?.turnoConfig ?? {}) as Record<string, unknown>;
        // Fin de semana (si está habilitado el precio diferenciado) → precio de finde.
        const weekend = cfg.priceWeekendEnabled === true && isWeekendDate(input.date);
        const cats = (await tx.playerCategory.findMany({ where: { tenantId } })).map((c) => ({
          id: c.id,
          name: c.name,
          price: c.price != null ? Number(c.price) : null,
          priceWeekend: c.priceWeekend != null ? Number(c.priceWeekend) : null,
        }));
        // El turno guarda el nombre y el precio de la categoría, así que el
        // histórico no cambia si después la renombran o la borran.
        const players = (input.players ?? [])
          .filter((p) => p.firstName?.trim())
          .map((p) => ({
            firstName: p.firstName.trim(),
            lastName: (p.lastName ?? '').trim(),
            categoryId: p.categoryId ?? null,
            categoryName: cats.find((c) => c.id === p.categoryId)?.name ?? null,
            price: playerPrice(p.categoryId, cats, weekend),
          }));
        const playersTotal = players.reduce((sum, p) => sum + (p.price ?? 0), 0);
        const hasAnyPrice = players.some((p) => p.price != null);

        // Reserva de productos (descuenta stock dentro de la misma tx).
        const reserved = await this.products.reserve(tx, tenantId, input.products ?? []);
        const productsTotal = reserved.reduce((s, p) => s + (p.price ?? 0) * p.qty, 0);

        const baseTotal = hasAnyPrice ? playersTotal : service.price != null ? Number(service.price) : 0;
        const anyPrice = hasAnyPrice || service.price != null || productsTotal > 0;
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
            priceAtBooking: anyPrice ? baseTotal + productsTotal : null,
            players: players.length ? players : undefined,
            products: reserved.length ? reserved : undefined,
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
    // `customers` es tabla compartida sin RLS por tenant → filtramos explícito.
    const existing = await tx.customer.findFirst({
      where: { phone, tenantId },
      select: { id: true },
    });
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
