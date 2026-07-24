import { Module } from '@nestjs/common';
import { ProductsModule } from '@/products/products.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [ProductsModule],
  controllers: [AppointmentsController, AvailabilityController],
  providers: [AppointmentsService, AvailabilityService],
  exports: [AppointmentsService, AvailabilityService],
})
export class AppointmentsModule {}
