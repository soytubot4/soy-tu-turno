import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  createResourceSchema,
  updateResourceSchema,
  setResourceScheduleSchema,
  type CreateResourceInput,
  type UpdateResourceInput,
  type SetResourceScheduleInput,
} from '@soytuturno/shared';
import { ResourcesService } from './resources.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  @Get()
  async list() {
    return { ok: true, data: await this.service.list() };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createResourceSchema)) body: CreateResourceInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateResourceSchema)) body: UpdateResourceInput,
  ) {
    return { ok: true, data: await this.service.update(id, body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }

  // ── Horario semanal ─────────────────────────────────────────
  @Get(':id/schedule')
  async getSchedule(@Param('id') id: string) {
    return { ok: true, data: await this.service.getSchedule(id) };
  }

  @Put(':id/schedule')
  async setSchedule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setResourceScheduleSchema)) body: SetResourceScheduleInput,
  ) {
    return { ok: true, data: await this.service.setSchedule(id, body) };
  }
}
