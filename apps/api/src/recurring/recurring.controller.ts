import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { createRecurringSchema, type CreateRecurringInput } from '@soytuturno/shared';
import { RecurringService } from './recurring.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

/** Turnos fijos: el socio tiene la cancha todas las semanas a la misma hora. */
@Controller('recurring')
export class RecurringController {
  constructor(private readonly service: RecurringService) {}

  @Get()
  async list() {
    return { ok: true, data: await this.service.list() };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createRecurringSchema)) body: CreateRecurringInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }

  /** Rellena los turnos faltantes. Lo llama el panel al abrir la agenda. */
  @Post('ensure')
  async ensure() {
    return { ok: true, data: await this.service.ensureGenerated() };
  }
}
