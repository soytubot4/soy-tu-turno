import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Feature flag del ecosistema (en tenant.enabledProducts)
// ─────────────────────────────────────────────────────────────
export const TURNO_FEATURE_KEY = 'soytuturno';

// Días de semana: 0=Domingo … 6=Sábado (igual que JS Date.getDay()).
export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

// 'HH:MM' 24hs, o vacío.
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)')
  .or(z.literal(''));

/** Franja horaria 'HH:MM'–'HH:MM' (para horario cortado). */
export const hourRangeSchema = z.object({ from: hhmm, to: hhmm });
export type HourRange = z.infer<typeof hourRangeSchema>;

// ─────────────────────────────────────────────────────────────
// Servicios
// ─────────────────────────────────────────────────────────────
export const createServiceSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  description: z.string().trim().max(1000).optional(),
  durationMin: z.coerce.number().int().min(5, 'Mínimo 5 minutos').max(1440),
  price: z.coerce.number().nonnegative().nullable().optional(),
  color: z.string().max(20).optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  // Qué recursos ofrecen el servicio (vacío = todos).
  resourceIds: z.array(z.string().uuid()).default([]),
});
export const updateServiceSchema = createServiceSchema.partial();
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// ─────────────────────────────────────────────────────────────
// Recursos (profesionales / boxes / sillas)
// ─────────────────────────────────────────────────────────────
export const createResourceSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  title: z.string().trim().max(80).optional(),
  avatarUrl: z.string().url().or(z.literal('')).optional(),
  color: z.string().max(20).optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  userId: z.string().uuid().nullable().optional(),
});
export const updateResourceSchema = createResourceSchema.partial();
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

// ─────────────────────────────────────────────────────────────
// Horario semanal por recurso
// ─────────────────────────────────────────────────────────────
export const resourceScheduleDaySchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  ranges: z.array(hourRangeSchema).max(6),
});
/** Setea el horario completo del recurso (los días que se manden). */
export const setResourceScheduleSchema = z.object({
  days: z.array(resourceScheduleDaySchema),
});
export type SetResourceScheduleInput = z.infer<typeof setResourceScheduleSchema>;

// ─────────────────────────────────────────────────────────────
// Bloqueos / feriados
// ─────────────────────────────────────────────────────────────
export const createScheduleBlockSchema = z.object({
  resourceId: z.string().uuid().nullable().optional(), // null = todo el local
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  allDay: z.boolean().default(true),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  reason: z.string().trim().max(200).optional(),
});
export type CreateScheduleBlockInput = z.infer<typeof createScheduleBlockSchema>;

// ─────────────────────────────────────────────────────────────
// Turnos
// ─────────────────────────────────────────────────────────────
export const APPOINTMENT_STATUS = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatusValue = (typeof APPOINTMENT_STATUS)[number];

export const createAppointmentSchema = z.object({
  customerId: z.string().uuid(),
  resourceId: z.string().uuid(),
  serviceId: z.string().uuid(),
  // ISO 8601. El backend calcula endAt según la duración del servicio.
  startAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  resourceId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  startAt: z.string().datetime().optional(),
  status: z.enum(APPOINTMENT_STATUS).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

/** Listado de turnos para la agenda/calendario (ventana [from, to)). */
export const listAppointmentsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  resourceId: z.string().uuid().optional(),
  status: z.enum(APPOINTMENT_STATUS).optional(),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

// ─────────────────────────────────────────────────────────────
// Disponibilidad (para el picker de horarios y el bot)
// ─────────────────────────────────────────────────────────────
export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  resourceId: z.string().uuid().optional(), // sin esto → cualquier recurso que ofrezca el servicio
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

// ─────────────────────────────────────────────────────────────
// Clientes (tabla compartida del ecosistema)
// ─────────────────────────────────────────────────────────────
export const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1, 'Poné un nombre').max(120),
  lastName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().email().or(z.literal('')).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ─────────────────────────────────────────────────────────────
// Portal público del cliente (reserva self-service)
// ─────────────────────────────────────────────────────────────
export const portalBookSchema = z.object({
  serviceId: z.string().uuid(),
  resourceId: z.string().uuid(),
  startAt: z.string().datetime(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  firstName: z.string().trim().min(1, 'Poné tu nombre').max(120),
  lastName: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(5, 'Poné un teléfono válido').max(40),
});
export type PortalBookInput = z.infer<typeof portalBookSchema>;

// ─────────────────────────────────────────────────────────────
// Config de turnos del comercio (la edita el propio OWNER/MANAGER)
// ─────────────────────────────────────────────────────────────
/** Intervalos posibles para ofrecer turnos (minutos). */
export const SLOT_STEP_OPTIONS = [10, 15, 20, 30, 45, 60] as const;

export const updateTurnoSettingsSchema = z.object({
  // Cada cuánto se ofrecen turnos: 08:00, 08:30, 09:00… (según el paso).
  slotStepMin: z.coerce.number().int().min(5).max(240).optional(),
  // Anticipación mínima para reservar (minutos desde ahora).
  minLeadMinutes: z.coerce.number().int().min(0).max(10080).optional(),
});
export type UpdateTurnoSettingsInput = z.infer<typeof updateTurnoSettingsSchema>;

// ─────────────────────────────────────────────────────────────
// Superadmin: activar el turnero por comercio + config
// ─────────────────────────────────────────────────────────────
export const adminUpdateTurnoSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().trim().min(1).max(64).optional(),
  slotStepMin: z.coerce.number().int().min(5).max(120).optional(),
  minLeadMinutes: z.coerce.number().int().min(0).max(10080).optional(),
});
export type AdminUpdateTurnoInput = z.infer<typeof adminUpdateTurnoSchema>;

// Paginación estándar (igual que el resto del ecosistema).
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;
