import { Module } from '@nestjs/common';
import { SupabaseAdminService } from '@/auth/supabase-admin.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  controllers: [TeamController],
  providers: [TeamService, SupabaseAdminService],
})
export class TeamModule {}
