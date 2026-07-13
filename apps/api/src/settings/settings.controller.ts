import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateTurnoSettingsSchema, type UpdateTurnoSettingsInput } from '@soytuturno/shared';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  async get() {
    return { ok: true, data: await this.service.get() };
  }

  @Patch()
  async update(
    @Body(new ZodValidationPipe(updateTurnoSettingsSchema)) body: UpdateTurnoSettingsInput,
  ) {
    return { ok: true, data: await this.service.update(body) };
  }
}
