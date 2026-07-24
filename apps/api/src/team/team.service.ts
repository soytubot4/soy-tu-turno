import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '@soytuturno/db';
import {
  EDITABLE_ROLES,
  effectiveCapabilities,
  roleLabelFor,
  type InviteMemberInput,
  type RoleLabelsOverrides,
  type RolePermissionsOverrides,
  type UpdateMemberRoleInput,
  type UpdateRolesConfigInput,
} from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';
import { SupabaseAdminService } from '@/auth/supabase-admin.service';

/** Gestión de usuarios del comercio (login + rol). Todo gateado por team:manage. */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  list() {
    const ctx = requireTenantContext();
    // `users` es tabla COMPARTIDA sin la RLS por tenant → filtramos explícito.
    return this.prisma.tenantSafe((tx) =>
      tx.user.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, email: true, fullName: true, role: true, active: true },
      }),
    );
  }

  /** Config de roles del comercio: nombres + permisos efectivos por rol editable. */
  async getRolesConfig() {
    const ctx = requireTenantContext();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { turnoConfig: true },
    });
    const cfg = (tenant?.turnoConfig ?? {}) as Record<string, unknown>;
    const canchas = cfg.canchas === true;
    const labels = (cfg.roleLabels ?? undefined) as RoleLabelsOverrides | undefined;
    const perms = (cfg.rolePermissions ?? undefined) as RolePermissionsOverrides | undefined;
    return {
      canchas,
      roles: EDITABLE_ROLES.map((role) => ({
        role,
        label: roleLabelFor(role, labels, canchas),
        capabilities: effectiveCapabilities(role, perms),
      })),
    };
  }

  /** Guarda nombres y permisos por rol (merge en turnoConfig). Solo team:manage. */
  async saveRolesConfig(input: UpdateRolesConfigInput) {
    assertCan('team:manage');
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { turnoConfig: true },
      });
      const cfg = (tenant?.turnoConfig ?? {}) as Record<string, unknown>;

      // Nombres: guardamos solo los no vacíos (vacío = usar el default del rubro).
      const labels: RoleLabelsOverrides = {};
      for (const role of EDITABLE_ROLES) {
        const v = input.labels?.[role]?.trim();
        if (v) labels[role] = v;
      }
      // Permisos: guardamos el set explícito por rol editable que venga en el payload.
      const perms: RolePermissionsOverrides = {
        ...((cfg.rolePermissions ?? {}) as RolePermissionsOverrides),
      };
      for (const role of EDITABLE_ROLES) {
        const caps = input.permissions?.[role];
        if (caps) perms[role] = caps;
      }

      await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { turnoConfig: { ...cfg, roleLabels: labels, rolePermissions: perms } },
      });
      return this.getRolesConfig();
    }, ctx.tenantId);
  }

  async invite(input: InviteMemberInput) {
    assertCan('team:manage');
    const ctx = requireTenantContext();
    const email = input.email.trim().toLowerCase();

    return this.prisma.tenantSafe(async (tx) => {
      const dup = await tx.user.findFirst({
        where: { email, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (dup) throw new ConflictException('Ya hay un usuario con ese email en el comercio');

      const tenant = await tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { slug: true },
      });
      if (!tenant) throw new NotFoundException('Comercio no encontrado');

      const supabaseUserId = await this.supabase.inviteMember({
        email,
        fullName: input.fullName?.trim(),
        tenantId: ctx.tenantId,
        tenantSlug: tenant.slug,
        role: input.role,
        redirectTo: input.redirectTo,
      });
      if (!supabaseUserId) {
        throw new ServiceUnavailableException('Invitaciones deshabilitadas (Supabase no configurado)');
      }

      return tx.user.create({
        data: {
          tenantId: ctx.tenantId,
          supabaseUserId,
          email,
          fullName: input.fullName?.trim() || null,
          role: input.role as UserRole,
          active: true,
        },
        select: { id: true, email: true, fullName: true, role: true, active: true },
      });
    }, ctx.tenantId);
  }

  async updateRole(id: string, input: UpdateMemberRoleInput) {
    assertCan('team:manage');
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, role: true, supabaseUserId: true },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (user.role === 'OWNER') throw new ForbiddenException('No se puede cambiar el rol del dueño');

      const updated = await tx.user.update({
        where: { id },
        data: { role: input.role as UserRole },
        select: { id: true, email: true, fullName: true, role: true, active: true },
      });
      await this.supabase.setUserRole(user.supabaseUserId, input.role);
      return updated;
    });
  }

  async remove(id: string) {
    assertCan('team:manage');
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, role: true, supabaseUserId: true },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (user.role === 'OWNER') throw new ForbiddenException('No se puede eliminar al dueño');
      if (user.supabaseUserId === ctx.userId) {
        throw new ForbiddenException('No podés eliminarte a vos mismo');
      }
      await tx.user.delete({ where: { id } });
      await this.supabase.deleteAuthUser(user.supabaseUserId);
      return { id };
    }, ctx.tenantId);
  }
}
