import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createServiceSchema,
  updateServiceSchema,
  type CreateServiceInput,
  type UpdateServiceInput,
} from '@soytuturno/shared';
import { ServicesService } from './services.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('services')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  async list() {
    return { ok: true, data: await this.service.list() };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createServiceSchema)) body: CreateServiceInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) body: UpdateServiceInput,
  ) {
    return { ok: true, data: await this.service.update(id, body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }
}
