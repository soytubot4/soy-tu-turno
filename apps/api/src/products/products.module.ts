import { Module } from '@nestjs/common';
import { SupabaseAdminService } from '@/auth/supabase-admin.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, SupabaseAdminService],
  exports: [ProductsService],
})
export class ProductsModule {}
