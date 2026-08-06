import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  createInstructorSchema,
  updateInstructorSchema,
  instructorSlotSchema,
  slotExceptionSchema,
  type CreateInstructorInput,
  type UpdateInstructorInput,
  type InstructorSlotInput,
  type SlotExceptionInput,
} from '@soytuturno/shared';
import { InstructorsService } from './instructors.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('instructors')
export class InstructorsController {
  constructor(private readonly service: InstructorsService) {}

  @Get()
  async list() {
    return { ok: true, data: await this.service.list() };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createInstructorSchema)) body: CreateInstructorInput) {
    return { ok: true, data: await this.service.create(body) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateInstructorSchema)) body: UpdateInstructorInput,
  ) {
    return { ok: true, data: await this.service.update(id, body) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }

  // ─── Franjas de clase ───
  @Post(':id/slots')
  async addSlot(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(instructorSlotSchema)) body: InstructorSlotInput,
  ) {
    return { ok: true, data: await this.service.addSlot(id, body) };
  }

  @Patch('slots/:slotId')
  async updateSlot(
    @Param('slotId') slotId: string,
    @Body(new ZodValidationPipe(instructorSlotSchema)) body: InstructorSlotInput,
  ) {
    return { ok: true, data: await this.service.updateSlot(slotId, body) };
  }

  /** Guarda (o limpia) lo que cambia de una clase para una fecha puntual. */
  @Put('slots/:slotId/exception')
  async setException(
    @Param('slotId') slotId: string,
    @Body(new ZodValidationPipe(slotExceptionSchema)) body: SlotExceptionInput,
  ) {
    return { ok: true, data: await this.service.setException(slotId, body) };
  }

  @Delete('slots/:slotId')
  async removeSlot(@Param('slotId') slotId: string) {
    return { ok: true, data: await this.service.removeSlot(slotId) };
  }
}
