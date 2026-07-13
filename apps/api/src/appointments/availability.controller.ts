import { Controller, Get, Query } from '@nestjs/common';
import { availabilityQuerySchema, type AvailabilityQuery } from '@soytuturno/shared';
import { AvailabilityService } from './availability.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  /** Slots libres para un servicio en una fecha (para el picker y el bot). */
  @Get()
  async slots(@Query(new ZodValidationPipe(availabilityQuerySchema)) q: AvailabilityQuery) {
    return { ok: true, data: await this.service.getSlots(q) };
  }
}
