import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsQuerySchema,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
  type ListAppointmentsQuery,
} from '@soytuturno/shared';
import { AppointmentsService } from './appointments.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(listAppointmentsQuerySchema)) q: ListAppointmentsQuery) {
    return { ok: true, data: await this.service.list(q) };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAppointmentSchema)) body: UpdateAppointmentInput,
  ) {
    return { ok: true, data: await this.service.update(id, body) };
  }

  @Delete(':id')
  async cancel(@Param('id') id: string) {
    return { ok: true, data: await this.service.cancel(id) };
  }
}
