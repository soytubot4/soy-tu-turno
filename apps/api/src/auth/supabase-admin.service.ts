import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente admin de Supabase (service role). Lo usa el superadmin para invitar al
 * dueño de un comercio nuevo y setear su app_metadata (tenant_id / tenant_slug /
 * role) — así el MISMO proyecto Supabase sirve a todo el ecosistema (SSO).
 *
 * Si faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY queda deshabilitado (devuelve
 * null) para que el api corra en dev sin romper.
 */
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      this.client = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } else {
      this.client = null;
      this.logger.warn('Supabase admin no configurado — alta de OWNER deshabilitada (dev).');
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** Invita al OWNER por email y setea su app_metadata. Devuelve el user id (o null). */
  async inviteOwner(params: {
    email: string;
    fullName?: string;
    tenantId: string;
    tenantSlug: string;
    redirectTo?: string;
  }): Promise<string | null> {
    if (!this.client) return null;
    const appMetadata = {
      tenant_id: params.tenantId,
      tenant_slug: params.tenantSlug,
      role: 'OWNER',
    };
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(params.email, {
      data: { ...appMetadata, full_name: params.fullName ?? '' },
      // Sin esto Supabase usa el Site URL por default y el dueño cae en el app
      // equivocado. Apunta a admin.<slug>.soytuturno.com/set-password.
      redirectTo: params.redirectTo,
    });
    if (error) throw new Error(`Supabase inviteUser: ${error.message}`);

    const id = data.user?.id ?? null;
    if (id) {
      // Reasegura el app_metadata (algunos flujos no lo persisten desde `data`).
      await this.client.auth.admin
        .updateUserById(id, { app_metadata: appMetadata })
        .catch((e) => this.logger.warn(`No pude setear app_metadata: ${(e as Error).message}`));
    }
    return id;
  }

  /** Invita a un miembro del equipo con un rol y setea su app_metadata. */
  async inviteMember(params: {
    email: string;
    fullName?: string;
    tenantId: string;
    tenantSlug: string;
    role: string;
    redirectTo?: string;
  }): Promise<string | null> {
    if (!this.client) return null;
    const appMetadata = {
      tenant_id: params.tenantId,
      tenant_slug: params.tenantSlug,
      role: params.role,
    };
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(params.email, {
      data: { ...appMetadata, full_name: params.fullName ?? '' },
      redirectTo: params.redirectTo,
    });
    if (error) throw new Error(`Supabase inviteUser: ${error.message}`);
    const id = data.user?.id ?? null;
    if (id) {
      await this.client.auth.admin
        .updateUserById(id, { app_metadata: appMetadata })
        .catch((e) => this.logger.warn(`No pude setear app_metadata: ${(e as Error).message}`));
    }
    return id;
  }

  /** Cambia el role en app_metadata (para que el próximo JWT lo refleje). Best-effort. */
  async setUserRole(userId: string, role: string): Promise<void> {
    if (!this.client) return;
    const { data } = await this.client.auth.admin
      .getUserById(userId)
      .catch(() => ({ data: null }) as { data: null });
    const prev = (data?.user?.app_metadata ?? {}) as Record<string, unknown>;
    await this.client.auth.admin
      .updateUserById(userId, { app_metadata: { ...prev, role } })
      .catch((e) => this.logger.warn(`No pude actualizar el role: ${(e as Error).message}`));
  }

  /** Borra un user de Supabase Auth (best-effort, para rollback). */
  async deleteAuthUser(userId: string): Promise<void> {
    if (!this.client) return;
    await this.client.auth.admin
      .deleteUser(userId)
      .catch((e) => this.logger.warn(`No pude borrar el user ${userId}: ${(e as Error).message}`));
  }
}
