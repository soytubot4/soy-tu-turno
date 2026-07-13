import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getTenantContext } from '@/prisma/tenant-context';

export const CurrentTenant = createParamDecorator((_, _ctx: ExecutionContext) => {
  const tenant = getTenantContext();
  if (!tenant) throw new ForbiddenException('Sin tenant context');
  return tenant;
});
