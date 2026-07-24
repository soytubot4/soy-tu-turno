import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from '@soytuturno/shared';
import { ProductsService } from './products.service';
import { SupabaseAdminService } from '@/auth/supabase-admin.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  @Get()
  async list() {
    return { ok: true, data: await this.service.list() };
  }

  /** Firma una subida de imagen al bucket tenant-assets. */
  @Post('upload-url')
  async uploadUrl(@Body() body: { ext?: string }) {
    const ctx = requireTenantContext();
    const ext = (body?.ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'jpg';
    const path = `tenants/${ctx.tenantId}/products/${randomUUID()}.${ext}`;
    const signed = await this.supabase.signUpload(path);
    if (!signed) throw new BadRequestException('La subida de imágenes no está configurada.');
    return { ok: true, data: signed };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
  ) {
    return { ok: true, data: await this.service.update(id, body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }
}
