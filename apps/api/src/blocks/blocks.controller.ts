import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { createScheduleBlockSchema, type CreateScheduleBlockInput } from '@soytuturno/shared';
import { BlocksService } from './blocks.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

const listQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  resourceId: z.string().uuid().optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('blocks')
export class BlocksController {
  constructor(private readonly service: BlocksService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return { ok: true, data: await this.service.list(q.from, q.to, q.resourceId) };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createScheduleBlockSchema)) body: CreateScheduleBlockInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }
}
