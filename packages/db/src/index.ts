export { PrismaClient, Prisma } from '@prisma/client';

// Modelos como TYPES (no son valores en runtime).
export type {
  Tenant,
  User,
  Customer,
  AdminUser,
  Service,
  Resource,
  ResourceService,
  ResourceSchedule,
  ScheduleBlock,
  Appointment,
} from '@prisma/client';

// Enums como VALUES (Prisma los genera como const objects).
export {
  BusinessType,
  UserRole,
  AdminUserType,
  DomainProvisioningStatus,
  AppointmentStatus,
  AppointmentSource,
} from '@prisma/client';
