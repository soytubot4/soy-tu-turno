import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { PublicService } from './public.service';

/** Landing pública (apex). Todo @Public(), sin tenant. */
@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Public()
  @Get('businesses')
  async businesses(@Query('q') q?: string) {
    return { ok: true, data: await this.service.listBusinesses(q) };
  }
}
