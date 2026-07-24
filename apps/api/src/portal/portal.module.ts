import { Module } from '@nestjs/common';
import { AppointmentsModule } from '@/appointments/appointments.module';
import { ProductsModule } from '@/products/products.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [AppointmentsModule, ProductsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
