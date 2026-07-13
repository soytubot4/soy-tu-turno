import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { SuperAdminGuard } from './super-admin.guard';

@Module({
  imports: [PrismaModule],
  providers: [SuperAdminGuard],
  exports: [SuperAdminGuard],
})
export class AuthModule {}
