import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminUserType } from '@soytuturno/db';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Valida que el user autenticado sea un SUPERADMIN activo (tabla compartida
 * admin_users). Corre DESPUÉS de JwtAuthGuard. Attacha req.adminUser.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly logger = new Logger(SuperAdminGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user?.id) throw new ForbiddenException('Sin user autenticado');

    const adminUser = await this.prisma.adminUser.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true, email: true, type: true, belongsToTenantId: true, active: true },
    });

    if (!adminUser || !adminUser.active) {
      this.logger.warn(`Acceso admin denegado: ${user.email ?? user.id}`);
      throw new ForbiddenException('Acceso restringido al panel admin');
    }
    if (adminUser.type !== AdminUserType.SUPERADMIN) {
      throw new ForbiddenException('Acceso restringido a SUPERADMIN');
    }

    req.adminUser = {
      id: adminUser.id,
      email: adminUser.email,
      type: adminUser.type,
      belongsToTenantId: adminUser.belongsToTenantId,
    };
    return true;
  }
}
