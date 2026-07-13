import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { HealthModule } from './health/health.module';
import { ServicesModule } from './services/services.module';
import { ResourcesModule } from './resources/resources.module';
import { BlocksModule } from './blocks/blocks.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CustomersModule } from './customers/customers.module';
import { PortalModule } from './portal/portal.module';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    ServicesModule,
    ResourcesModule,
    BlocksModule,
    AppointmentsModule,
    CustomersModule,
    PortalModule,
    AdminModule,
    SettingsModule,
  ],
  providers: [
    // Auth global: valida el JWT de Supabase salvo endpoints @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Resuelve el tenant y corre el handler dentro del tenantStorage (RLS).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
