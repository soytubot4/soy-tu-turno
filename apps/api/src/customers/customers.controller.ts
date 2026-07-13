import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { createCustomerSchema, type CreateCustomerInput } from '@soytuturno/shared';
import { CustomersService } from './customers.service';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  async search(@Query('q') q?: string) {
    return { ok: true, data: await this.service.search(q) };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput) {
    return { ok: true, data: await this.service.create(body) };
  }
}
