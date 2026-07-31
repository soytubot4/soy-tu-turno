import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente de bajo nivel para la API de DigitalOcean.
 * Maneja DNS records (Networking) y domains de App Platform.
 *
 * Auth: Personal Access Token con scopes domain:* y app:read+update.
 *
 * Si faltan las env vars, queda DESHABILITADO (los métodos son no-op). Así en
 * dev/local se puede crear tenants sin tener credenciales de DigitalOcean.
 *
 * Endpoints usados:
 *  - POST   /v2/domains/{domain}/records           crear CNAME
 *  - GET    /v2/domains/{domain}/records?name=...  buscar para borrar
 *  - DELETE /v2/domains/{domain}/records/{id}      borrar CNAME
 *  - GET    /v2/apps/{app_id}                      leer spec
 *  - PUT    /v2/apps/{app_id}                      actualizar spec (incluyendo domains)
 */
@Injectable()
export class DigitalOceanService {
  private readonly logger = new Logger(DigitalOceanService.name);
  private readonly base = 'https://api.digitalocean.com/v2';

  /** true si están las 4 env vars → el provisioning está activo. */
  readonly enabled: boolean;
  private readonly token: string;
  private readonly appId: string;
  private readonly domainRoot: string;
  private readonly appTarget: string;

  constructor() {
    this.token = process.env.DIGITALOCEAN_API_TOKEN ?? '';
    this.appId = process.env.DIGITALOCEAN_APP_ID ?? '';
    this.domainRoot = process.env.DIGITALOCEAN_DOMAIN_ROOT ?? '';
    this.appTarget = process.env.DIGITALOCEAN_APP_TARGET ?? '';
    this.enabled = !!(this.token && this.appId && this.domainRoot && this.appTarget);
    if (!this.enabled) {
      this.logger.warn(
        'DigitalOcean no configurado (faltan DIGITALOCEAN_API_TOKEN / _APP_ID / _DOMAIN_ROOT / _APP_TARGET). El provisioning de dominios queda deshabilitado.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DNS — CNAME records
  // ─────────────────────────────────────────────────────────────

  /**
   * Crea un CNAME `<subdomain>.<domainRoot>` apuntando al app target.
   * Si ya existe (422), lo trata como éxito idempotente.
   */
  async createCname(subdomain: string): Promise<void> {
    if (!this.enabled) return;
    // En DO el `name` del record es el subdominio sin el root, ej: "admin.padel"
    const body = {
      type: 'CNAME',
      name: subdomain,
      data: `${this.appTarget}.`, // CNAME values necesitan trailing dot
      ttl: 43200,
    };
    const res = await this.fetch(`/domains/${this.domainRoot}/records`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (res.status === 422) {
      // DO devuelve 422 cuando el record ya existe — idempotente
      this.logger.warn(`CNAME ${subdomain}.${this.domainRoot} ya existía, lo dejo`);
      return;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error creando CNAME ${subdomain}: ${res.status} ${text}`);
    }
  }

  /** Borra el CNAME `<subdomain>.<domainRoot>`. Si no existe, no error. */
  async deleteCname(subdomain: string): Promise<void> {
    if (!this.enabled) return;
    const fullName = `${subdomain}.${this.domainRoot}`;
    const listRes = await this.fetch(
      `/domains/${this.domainRoot}/records?name=${encodeURIComponent(fullName)}&type=CNAME`,
      { method: 'GET' },
    );
    if (!listRes.ok) {
      const text = await listRes.text();
      throw new Error(`Error listando CNAMEs: ${listRes.status} ${text}`);
    }
    const list = (await listRes.json()) as { domain_records: Array<{ id: number; name: string }> };
    const matches = list.domain_records.filter((r) => r.name === subdomain);
    for (const rec of matches) {
      const delRes = await this.fetch(`/domains/${this.domainRoot}/records/${rec.id}`, { method: 'DELETE' });
      if (!delRes.ok && delRes.status !== 404) {
        const text = await delRes.text();
        throw new Error(`Error borrando CNAME ${fullName}: ${delRes.status} ${text}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // App Platform — domains en el spec del app
  // ─────────────────────────────────────────────────────────────

  /** Agrega un domain al app spec si no estaba. Idempotente. Tipo ALIAS (DO maneja DNS + cert). */
  async addAppDomain(fullDomain: string): Promise<void> {
    if (!this.enabled) return;
    const spec = await this.getAppSpec();
    const domains = (spec.domains ?? []) as Array<{ domain: string; type?: string }>;
    if (domains.some((d) => d.domain === fullDomain)) {
      this.logger.log(`App domain ${fullDomain} ya estaba en el spec`);
      return;
    }
    domains.push({ domain: fullDomain, type: 'ALIAS' });
    await this.updateAppSpec({ ...spec, domains });
  }

  /** Saca un domain del app spec. Idempotente. */
  async removeAppDomain(fullDomain: string): Promise<void> {
    if (!this.enabled) return;
    const spec = await this.getAppSpec();
    const domains = (spec.domains ?? []) as Array<{ domain: string; type?: string }>;
    const filtered = domains.filter((d) => d.domain !== fullDomain);
    if (filtered.length === domains.length) {
      this.logger.log(`App domain ${fullDomain} no estaba en el spec`);
      return;
    }
    await this.updateAppSpec({ ...spec, domains: filtered });
  }

  // ─────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────

  private async getAppSpec(): Promise<Record<string, unknown>> {
    const res = await this.fetch(`/apps/${this.appId}`, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error leyendo app spec: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { app: { spec: Record<string, unknown> } };
    return json.app.spec;
  }

  private async updateAppSpec(spec: Record<string, unknown>): Promise<void> {
    const res = await this.fetch(`/apps/${this.appId}`, {
      method: 'PUT',
      body: JSON.stringify({ spec }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error actualizando app spec: ${res.status} ${text}`);
    }
  }

  private fetch(path: string, init: RequestInit) {
    return fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  }
}
