import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

type DecodedJwt = {
  sub: string;
  email?: string;
  app_metadata?: { tenant_id?: string; tenant_slug?: string; role?: string };
};

/** Verifica el JWT de Supabase (HS256 con SUPABASE_JWT_SECRET). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly jwtSecret: Uint8Array;

  constructor(private readonly reflector: Reflector) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw new Error('Falta SUPABASE_JWT_SECRET en el env');
    this.jwtSecret = new TextEncoder().encode(secret);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Falta token');

    try {
      const { payload } = await jwtVerify(token, this.jwtSecret, { algorithms: ['HS256'] });
      const decoded = payload as DecodedJwt;
      req.user = {
        id: decoded.sub,
        email: decoded.email ?? null,
        tenantId: decoded.app_metadata?.tenant_id ?? null,
        tenantSlug: decoded.app_metadata?.tenant_slug ?? null,
        role: decoded.app_metadata?.role ?? null,
      };
      return true;
    } catch (err) {
      this.logger.warn(`JWT inválido: ${(err as Error).message}`);
      throw new UnauthorizedException('Token inválido');
    }
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
