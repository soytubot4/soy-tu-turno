/**
 * Augmenta el Request de Express con los campos que populan los guards.
 *   req.user      → seteado por JwtAuthGuard (info del JWT de Supabase)
 *   req.adminUser → seteado por SuperAdminGuard (info de admin_users)
 */
import type { AdminUserType } from '@soytuturno/db';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string | null;
        tenantId: string | null;
        tenantSlug: string | null;
        role: string | null;
      };
      adminUser?: {
        id: string;
        email: string;
        type: AdminUserType;
        belongsToTenantId: string | null;
      };
    }
  }
}

export {};
