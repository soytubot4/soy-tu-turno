import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  adminUpdateTurnoSchema,
  adminCreateTenantSchema,
  type AdminUpdateTurnoInput,
  type AdminCreateTenantInput,
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

  @Patch('tenants/:id/turno')
  async updateTurno(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateTurnoSchema)) body: AdminUpdateTurnoInput,
  ) {
    return { ok: true, data: await this.service.updateTurno(id, body) };
  }
}
