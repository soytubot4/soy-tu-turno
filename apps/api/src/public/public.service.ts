import { Injectable } from '@nestjs/common';
import { TURNO_FEATURE_KEY } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * API del marketplace (landing pública, apex). Corre SIN tenant context: lista
 * TODOS los comercios con el turnero activo. El rating sale de la tabla reviews
 * (SELECT público por RLS), agregado por comercio.
 */
@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async listBusinesses(q?: string) {
    const term = q?.trim();
    const tenants = await this.prisma.tenant.findMany({
      where: {
        active: true,
        enabledProducts: { has: TURNO_FEATURE_KEY },
        ...(term ? { name: { contains: term, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        businessType: true,
        logoUrl: true,
        address: true,
      },
    });
    if (!tenants.length) return [];

    // Rating agregado por comercio (tolerante: si la tabla reviews aún no existe,
    // el marketplace igual funciona sin ratings).
    const byTenant = new Map<string, { avg: number | null; count: number }>();
    try {
      const agg = await this.prisma.review.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenants.map((t) => t.id) } },
        _avg: { rating: true },
        _count: { _all: true },
      });
      for (const a of agg) byTenant.set(a.tenantId, { avg: a._avg.rating, count: a._count._all });
    } catch {
      // tabla reviews todavía no creada
    }

    return tenants.map((t) => {
      const r = byTenant.get(t.id);
      return {
        slug: t.slug,
        name: t.name,
        businessType: t.businessType,
        logoUrl: t.logoUrl,
        address: t.address,
        rating: r?.avg ? Math.round(r.avg * 10) / 10 : null,
        reviewCount: r?.count ?? 0,
      };
    });
  }
}
