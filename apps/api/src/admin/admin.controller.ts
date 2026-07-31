import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  adminUpdateTurnoSchema,
  adminCreateTenantSchema,
  adminUpdateTenantSchema,
  type AdminUpdateTurnoInput,
  type AdminCreateTenantInput,
  type AdminUpdateTenantInput,
} from '@soytuturno/shared';
import { SuperAdminGuard } from '@/auth/super-admin.guard';
import { SuperAdminEndpoint } from '@/auth/decorators/super-admin.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

@Controller('admin')
@SuperAdminEndpoint()
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('tenants')
  async listTenants() {
    return { ok: true, data: await this.service.listTenants() };
  }

  @Post('tenants')
  async createTenant(
    @Body(new ZodValidationPipe(adminCreateTenantSchema)) body: AdminCreateTenantInput,
  ) {
    return { ok: true, data: await this.service.createTenant(body) };
  }

  @Patch('tenants/:id')
  async updateTenant(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateTenantSchema)) body: AdminUpdateTenantInput,
  ) {
    return { ok: true, data: await this.service.updateTenant(id, body) };
  }

  @Delete('tenants/:id')
  async deleteTenant(@Param('id') id: string) {
    return { ok: true, data: await this.service.deleteTenant(id) };
  }

  @Patch('tenants/:id/turno')
  async updateTurno(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateTurnoSchema)) body: AdminUpdateTurnoInput,
  ) {
    return { ok: true, data: await this.service.updateTurno(id, body) };
  }

  /** Reintenta el provisioning de dominios en DigitalOcean (para los que quedaron FAILED). */
  @Post('tenants/:id/reprovision-domains')
  async reprovisionDomains(@Param('id') id: string) {
    return { ok: true, data: await this.service.reprovisionDomains(id) };
  }
}
