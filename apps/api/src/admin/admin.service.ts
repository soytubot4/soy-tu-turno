import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@soytuturno/db';
import {
  TURNO_FEATURE_KEY,
  type AdminUpdateTurnoInput,
  type AdminCreateTenantInput,
  type AdminUpdateTenantInput,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { SupabaseAdminService } from '@/auth/supabase-admin.service';

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Consola superadmin de soytuturno. Corre SIN tenant context (cross-tenant), así
 * las queries a `tenants` ven todos los comercios. Para insertar filas
 * tenant-scoped (users) al crear un comercio se usa tenantSafe(fn, tenantId).
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  /** Crea un comercio nuevo con el turnero activo e invita al dueño por email. */
  async createTenant(input: AdminCreateTenantInput) {
    const exists = await this.prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (exists) throw new ConflictException(`El slug '${input.slug}' ya está en uso`);

    const tenant = await this.prisma.tenant.create({
      data: {
        slug: input.slug,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        ownerEmail: input.ownerEmail.trim(),
        ownerName: input.ownerName?.trim() || null,
        enabledProducts: [TURNO_FEATURE_KEY],
        turnoConfig: {
          timezone: input.timezone?.trim() || DEFAULT_TIMEZONE,
          slotStepMin: 15,
          minLeadMinutes: 0,
          canchas: input.canchas === true, // modo club deportivo
        },
        // soytuturno no usa el aprovisionamiento de dominios de soytucanje.
        staffDomainStatus: 'NOT_APPLICABLE',
        customerDomainStatus: 'NOT_APPLICABLE',
      },
      select: { id: true, slug: true, name: true },
    });

    // Invitar al OWNER y crear su fila en users (best-effort: si falla, el
    // comercio queda creado y se puede reinvitar).
    let ownerCreated = false;
    try {
      const supabaseUserId = await this.supabase.inviteOwner({
        email: input.ownerEmail.trim(),
        fullName: input.ownerName?.trim(),
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        redirectTo: input.redirectTo,
      });
      if (supabaseUserId) {
        await this.prisma.tenantSafe(
          (tx) =>
            tx.user.create({
              data: {
                tenantId: tenant.id,
                supabaseUserId,
                email: input.ownerEmail.trim(),
                fullName: input.ownerName?.trim() || null,
                role: UserRole.OWNER,
                active: true,
              },
            }),
          tenant.id,
        );
        ownerCreated = true;
      }
    } catch (err) {
      this.logger.error(`Error invitando al OWNER de ${tenant.slug}: ${(err as Error).message}`);
    }

    return { tenant, ownerCreated, supabaseEnabled: this.supabase.enabled };
  }

  /** Edita datos del comercio (nombre, subdominio, teléfono, dueño, zona horaria). */
  async updateTenant(id: string, input: AdminUpdateTenantInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, turnoConfig: true },
    });
    if (!tenant) throw new NotFoundException('Comercio no encontrado');

    if (input.slug) {
      const other = await this.prisma.tenant.findFirst({
        where: { slug: input.slug, NOT: { id } },
        select: { id: true },
      });
      if (other) throw new ConflictException(`El slug '${input.slug}' ya está en uso`);
    }

    const data: Prisma.TenantUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
    if (input.ownerName !== undefined) data.ownerName = input.ownerName?.trim() || null;
    if (input.timezone !== undefined) {
      const cfg = (tenant.turnoConfig && typeof tenant.turnoConfig === 'object'
        ? tenant.turnoConfig
        : {}) as Record<string, unknown>;
      data.turnoConfig = { ...cfg, timezone: input.timezone.trim() } as Prisma.InputJsonValue;
    }

    return this.prisma.tenant.update({
      where: { id },
      data,
      select: { id: true, slug: true, name: true },
    });
  }

  /**
   * Borra un comercio — SOLO si es exclusivo de soytuturno. Si también usa
   * soytucanje/soyuadmin, borrarlo lo eliminaría de todo el ecosistema, así que
   * se bloquea (sugerimos desactivar el turnero en su lugar).
   */
  async deleteTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, enabledProducts: true },
    });
    if (!tenant) throw new NotFoundException('Comercio no encontrado');

    const others = tenant.enabledProducts.filter((p) => p !== TURNO_FEATURE_KEY);
    if (others.length) {
      throw new ConflictException(
        `Este comercio también usa ${others.join(', ')}. Desde acá solo podés desactivar el turnero, no borrarlo.`,
      );
    }

    // Guardamos los users para limpiar sus cuentas de Supabase Auth tras el borrado.
    // `users` es tabla compartida sin RLS por tenant → filtramos explícito por id.
    const users = await this.prisma.tenantSafe(
      (tx) => tx.user.findMany({ where: { tenantId: id }, select: { supabaseUserId: true } }),
      id,
    );
    await this.prisma.tenant.delete({ where: { id } });
    for (const u of users) {
      await this.supabase.deleteAuthUser(u.supabaseUserId);
    }
    return { id };
  }

  /** Todos los comercios del ecosistema, marcando cuáles tienen el turnero activo. */
  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        phone: true,
        ownerName: true,
        enabledProducts: true,
        turnoConfig: true,
      },
    });
    return tenants.map((t) => {
      const otherProducts = t.enabledProducts.filter((p) => p !== TURNO_FEATURE_KEY);
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        phone: t.phone,
        ownerName: t.ownerName,
        turnoEnabled: t.enabledProducts.includes(TURNO_FEATURE_KEY),
        turnoConfig: t.turnoConfig,
        // Productos del ecosistema que también usa (si hay, no se puede borrar).
        otherProducts,
        deletable: otherProducts.length === 0,
      };
    });
  }

  /** Activa/desactiva el turnero para un comercio y actualiza su config. */
  async updateTurno(tenantId: string, input: AdminUpdateTurnoInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { enabledProducts: true, turnoConfig: true },
    });
    if (!tenant) throw new NotFoundException('Comercio no encontrado');

    const set = new Set(tenant.enabledProducts);
    if (input.enabled) set.add(TURNO_FEATURE_KEY);
    else set.delete(TURNO_FEATURE_KEY);

    // Merge de config (solo pisamos las claves que llegan).
    const prevCfg =
      tenant.turnoConfig && typeof tenant.turnoConfig === 'object'
        ? (tenant.turnoConfig as Record<string, unknown>)
        : {};
    const nextCfg: Record<string, unknown> = { ...prevCfg };
    if (input.timezone !== undefined) nextCfg.timezone = input.timezone;
    if (input.slotStepMin !== undefined) nextCfg.slotStepMin = input.slotStepMin;
    if (input.minLeadMinutes !== undefined) nextCfg.minLeadMinutes = input.minLeadMinutes;
    if (input.canchas !== undefined) nextCfg.canchas = input.canchas;

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { enabledProducts: [...set], turnoConfig: nextCfg as Prisma.InputJsonValue },
      select: { id: true, enabledProducts: true, turnoConfig: true },
    });
    return {
      id: updated.id,
      turnoEnabled: updated.enabledProducts.includes(TURNO_FEATURE_KEY),
      turnoConfig: updated.turnoConfig,
    };
  }
}
