import { Injectable, Logger } from '@nestjs/common';
import { DigitalOceanService } from './digital-ocean.service';

/**
 * Lógica de alto nivel para provisionar/des-provisionar los subdominios de un tenant.
 *
 * Cada tenant tiene 2 superficies (soytuturno provisiona SIEMPRE las dos):
 *  - staff:    admin.<slug>.<root>  (panel de gestión del comercio)
 *  - customer: <slug>.<root>        (portal donde el cliente reserva turno)
 *
 * Cada provisión = 2 llamadas a DO: crear CNAME + agregar domain al app spec.
 * Es idempotente: si algo ya existe, no falla.
 */
@Injectable()
export class DomainProvisioningService {
  private readonly logger = new Logger(DomainProvisioningService.name);

  constructor(private readonly doService: DigitalOceanService) {}

  /** true si DigitalOcean está configurado (si no, todo es no-op). */
  get enabled(): boolean {
    return this.doService.enabled;
  }

  /** admin.<slug>.<root> */
  async provisionStaffDomain(slug: string): Promise<void> {
    const subdomain = `admin.${slug}`;
    await this.doService.createCname(subdomain);
    await this.doService.addAppDomain(this.fullDomain(subdomain));
    this.logger.log(`Staff domain provisionado: admin.${slug}`);
  }

  async unprovisionStaffDomain(slug: string): Promise<void> {
    const subdomain = `admin.${slug}`;
    await this.doService.removeAppDomain(this.fullDomain(subdomain));
    await this.doService.deleteCname(subdomain);
    this.logger.log(`Staff domain des-provisionado: admin.${slug}`);
  }

  /** <slug>.<root> */
  async provisionCustomerDomain(slug: string): Promise<void> {
    await this.doService.createCname(slug);
    await this.doService.addAppDomain(this.fullDomain(slug));
    this.logger.log(`Customer domain provisionado: ${slug}`);
  }

  async unprovisionCustomerDomain(slug: string): Promise<void> {
    await this.doService.removeAppDomain(this.fullDomain(slug));
    await this.doService.deleteCname(slug);
    this.logger.log(`Customer domain des-provisionado: ${slug}`);
  }

  private fullDomain(subdomain: string): string {
    const root = process.env.DIGITALOCEAN_DOMAIN_ROOT ?? '';
    return `${subdomain}.${root}`;
  }
}
