import { BadRequestException, Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { portalBookSchema, type PortalBookInput } from '@soytuturno/shared';
import { Public } from '@/auth/decorators/public.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { PortalService } from './portal.service';

const availabilityQ = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  resourceId: z.string().uuid().optional(),
});
type AvailabilityQ = z.infer<typeof availabilityQ>;

/**
 * Portal público del cliente. Todo @Public() (sin JWT). El tenant sale del
 * header x-tenant-slug que setea el middleware del web por subdominio.
 */
@Controller('portal')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  private slugOrThrow(slug?: string): string {
    if (!slug) throw new BadRequestException('Falta el comercio (x-tenant-slug)');
    return slug;
  }

  @Public()
  @Get('info')
  async info(@Headers('x-tenant-slug') slug?: string) {
    return { ok: true, data: await this.service.info(this.slugOrThrow(slug)) };
  }

  @Public()
  @Get('availability')
  async availability(
    @Query(new ZodValidationPipe(availabilityQ)) q: AvailabilityQ,
    @Headers('x-tenant-slug') slug?: string,
  ) {
    return {
      ok: true,
      data: await this.service.availabilityFor(this.slugOrThrow(slug), q.serviceId, q.date, q.resourceId),
    };
  }

  @Public()
  @Post('book')
  async book(
    @Body(new ZodValidationPipe(portalBookSchema)) body: PortalBookInput,
    @Headers('x-tenant-slug') slug?: string,
  ) {
    return { ok: true, data: await this.service.book(this.slugOrThrow(slug), body) };
  }
}
