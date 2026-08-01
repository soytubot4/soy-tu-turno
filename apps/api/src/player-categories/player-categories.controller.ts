import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createPlayerCategorySchema,
  updatePlayerCategorySchema,
  type CreatePlayerCategoryInput,
  type UpdatePlayerCategoryInput,
} from '@soytuturno/shared';
import { PlayerCategoriesService } from './player-categories.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('player-categories')
export class PlayerCategoriesController {
  constructor(private readonly service: PlayerCategoriesService) {}

  @Get()
  async list() {
    return { ok: true, data: await this.service.list() };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createPlayerCategorySchema)) body: CreatePlayerCategoryInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlayerCategorySchema)) body: UpdatePlayerCategoryInput,
  ) {
    return { ok: true, data: await this.service.update(id, body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }
}
