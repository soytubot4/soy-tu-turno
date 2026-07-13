import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, switchMap } from 'rxjs';
import type { Request } from 'express';
import { tenantStorage } from '@/prisma/tenant-context';
import { PrismaService } from '@/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '@/auth/decorators/public.decorator';
import { IS_SUPERADMIN_KEY } from '@/auth/decorators/super-admin.decorator';

/**
 * Resuelve el tenant del request (del JWT o del header x-tenant-slug que setea
 * el middleware del web) y corre el handler dentro de tenantStorage.run(...).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const isSuperAdmin = this.reflector.getAllAndOverride<boolean>(IS_SUPERADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isSuperAdmin) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Sin usuario autenticado');

    const headerSlug = (req.headers['x-tenant-slug'] as string | undefined) ?? null;
    let tenantId = user.tenantId;

    // Cross-tenant guard: JWT de tenant A no puede pedir tenant B.
    if (tenantId && headerSlug && user.tenantSlug && headerSlug !== user.tenantSlug) {
      throw new ForbiddenException('No tenés acceso a este local');
    }

    if (!tenantId) {
      const slug = headerSlug ?? user.tenantSlug ?? null;
      if (!slug) throw new ForbiddenException('No se pudo resolver el tenant');
      const tenant = await this.prisma.resolveTenantBySlug(slug);
      if (!tenant) throw new ForbiddenException(`Tenant '${slug}' no encontrado`);
      tenantId = tenant.id;
    }

    // El SUPERADMIN del ecosistema tiene acceso total en CUALQUIER comercio.
    // Su token no trae rol de tenant, así que lo resolvemos contra admin_users
    // (solo cuando no vino un rol en el JWT → no penaliza a los usuarios normales).
    let role = user.role ?? 'CASHIER';
    let userIsSuperAdmin = false;
    if (!user.role) {
      const admin = await this.prisma.adminUser.findUnique({
        where: { supabaseUserId: user.id },
        select: { type: true, active: true },
      });
      if (admin?.active && admin.type === 'SUPERADMIN') {
        role = 'OWNER';
        userIsSuperAdmin = true;
      }
    }

    return from(
      new Promise<Observable<unknown>>((resolve) => {
        tenantStorage.run(
          {
            tenantId: tenantId!,
            userId: user.id,
            role,
            isSuperAdmin: userIsSuperAdmin,
            email: user.email ?? undefined,
          },
          () => resolve(next.handle()),
        );
      }),
    ).pipe(switchMap((obs) => obs));
  }
}
