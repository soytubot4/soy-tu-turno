import { SetMetadata } from '@nestjs/common';

export const IS_SUPERADMIN_KEY = 'isSuperAdminEndpoint';

/**
 * Marca un endpoint como exclusivo de SUPERADMIN. Hace que el
 * TenantContextInterceptor skipee la resolución de tenant. Combinar con
 * `@UseGuards(SuperAdminGuard)` en el controller.
 */
export const SuperAdminEndpoint = () => SetMetadata(IS_SUPERADMIN_KEY, true);
