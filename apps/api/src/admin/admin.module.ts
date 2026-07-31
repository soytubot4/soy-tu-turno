import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { SupabaseAdminService } from '@/auth/supabase-admin.service';
import { DigitalOceanModule } from '@/digital-ocean/digital-ocean.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, DigitalOceanModule],
  controllers: [AdminController],
  providers: [AdminService, SupabaseAdminService],
})
export class AdminModule {}
