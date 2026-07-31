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
import { DomainProvisioningService } from '@/digital-ocean/domain-provisioning.service';

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
    private readonly domains: DomainProvisioningService,
  ) {}

  /** Crea un comercio nuevo con el turnero activo e invita al dueño por email. */
  async createTenant(input: AdminCreateTenantInput) {
    const exists = await this.prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (exists) throw new ConflictException(`El slug '${input.slug}' ya está en uso`);

    const doOn = this.domains.enabled;
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
        // Provisioning de dominios: PENDING si DigitalOcean está configurado; si no, NOT_APPLICABLE.
        staffDomainStatus: doOn ? 'PENDING' : 'NOT_APPLICABLE',
        customerDomainStatus: doOn ? 'PENDING' : 'NOT_APPLICABLE',
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

    // Provisionar los subdominios en DigitalOcean (staff + customer). Best-effort:
    // si algo falla queda FAILED y se puede reintentar desde el panel.
    if (doOn) {
      await this.runDomainProvisioning(tenant.id, tenant.slug, { staff: true, customer: true });
    }

    return { tenant, ownerCreated, supabaseEnabled: this.supabase.enabled };
  }

  /** Edita datos del comercio (nombre, subdominio, teléfono, dueño, zona horaria). */
  async updateTenant(id: string, input: AdminUpdateTenantInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, turnoConfig: true, staffDomainStatus: true, customerDomainStatus: true },
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

    const updated = await this.prisma.tenant.update({
      where: { id },
      data,
      select: { id: true, slug: true, name: true },
    });

    // Si cambió el slug, des-provisionar los dominios viejos y re-provisionar con el nuevo.
    if (input.slug !== undefined && input.slug !== tenant.slug && this.domains.enabled) {
      if (tenant.staffDomainStatus === 'PROVISIONED') {
        try {
          await this.domains.unprovisionStaffDomain(tenant.slug);
        } catch (e) {
          this.logger.warn(`Unprovision staff ${tenant.slug}: ${(e as Error).message}`);
        }
      }
      if (tenant.customerDomainStatus === 'PROVISIONED') {
        try {
          await this.domains.unprovisionCustomerDomain(tenant.slug);
        } catch (e) {
          this.logger.warn(`Unprovision customer ${tenant.slug}: ${(e as Error).message}`);
        }
      }
      await this.prisma.tenant.update({
        where: { id },
        data: { staffDomainStatus: 'PENDING', customerDomainStatus: 'PENDING', domainError: null },
      });
      await this.runDomainProvisioning(id, updated.slug, { staff: true, customer: true });
    }

    return updated;
  }

  /**
   * Borra un comercio — SOLO si es exclusivo de soytuturno. Si también usa
   * soytucanje/soyuadmin, borrarlo lo eliminaría de todo el ecosistema, así que
   * se bloquea (sugerimos desactivar el turnero en su lugar).
   */
  async deleteTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, enabledProducts: true, staffDomainStatus: true, customerDomainStatus: true },
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
    // Des-provisionar los subdominios antes de borrar (best-effort, no bloquea).
    if (this.domains.enabled) {
      if (tenant.staffDomainStatus === 'PROVISIONED') {
        try {
          await this.domains.unprovisionStaffDomain(tenant.slug);
        } catch (e) {
          this.logger.warn(`Unprovision staff ${tenant.slug}: ${(e as Error).message}`);
        }
      }
      if (tenant.customerDomainStatus === 'PROVISIONED') {
        try {
          await this.domains.unprovisionCustomerDomain(tenant.slug);
        } catch (e) {
          this.logger.warn(`Unprovision customer ${tenant.slug}: ${(e as Error).message}`);
        }
      }
    }
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

  /** Re-provisiona los dominios que no estén PROVISIONED (endpoint de reintento). */
  async reprovisionDomains(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, staffDomainStatus: true, customerDomainStatus: true },
    });
    if (!tenant) throw new NotFoundException('Comercio no encontrado');
    if (!this.domains.enabled) {
      throw new ConflictException('DigitalOcean no está configurado en este entorno');
    }
    return this.runDomainProvisioning(id, tenant.slug, {
      staff: tenant.staffDomainStatus !== 'PROVISIONED',
      customer: tenant.customerDomainStatus !== 'PROVISIONED',
    });
  }

  /**
   * Provisiona las superficies indicadas contra DigitalOcean y persiste el estado
   * (PROVISIONED/FAILED + domainError) en el tenant. No lanza: acumula errores.
   */
  private async runDomainProvisioning(
    tenantId: string,
    slug: string,
    which: { staff: boolean; customer: boolean },
  ) {
    const errors: string[] = [];
    const data: Prisma.TenantUpdateInput = {};

    if (which.staff) {
      try {
        await this.domains.provisionStaffDomain(slug);
        data.staffDomainStatus = 'PROVISIONED';
      } catch (e) {
        const msg = (e as Error).message;
        this.logger.error(`Provisioning staff ${slug}: ${msg}`);
        data.staffDomainStatus = 'FAILED';
        errors.push(`staff: ${msg}`);
      }
    }
    if (which.customer) {
      try {
        await this.domains.provisionCustomerDomain(slug);
        data.customerDomainStatus = 'PROVISIONED';
      } catch (e) {
        const msg = (e as Error).message;
        this.logger.error(`Provisioning customer ${slug}: ${msg}`);
        data.customerDomainStatus = 'FAILED';
        errors.push(`customer: ${msg}`);
      }
    }
    data.domainError = errors.length ? errors.join(' | ') : null;
    if (!errors.length) data.domainProvisionedAt = new Date();

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        id: true,
        slug: true,
        staffDomainStatus: true,
        customerDomainStatus: true,
        domainError: true,
        domainProvisionedAt: true,
      },
    });
  }
}
