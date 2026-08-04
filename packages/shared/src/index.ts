import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Feature flag del ecosistema (en tenant.enabledProducts)
// ─────────────────────────────────────────────────────────────
export const TURNO_FEATURE_KEY = 'soytuturno';

// ─────────────────────────────────────────────────────────────
// Roles y permisos (RBAC del panel)
// ─────────────────────────────────────────────────────────────
/** Permisos gateables. Cada mutación del panel exige uno. */
export const TURNO_CAPABILITIES = [
  'appointments:write', // crear / editar / cancelar turnos (agenda)
  'resources:toggle', // habilitar / deshabilitar canchas o personas (activo/inactivo)
  'resources:write', // gestionar canchas / equipo (crear, editar, borrar, mapa)
  'services:write', // gestionar servicios
  'schedule:write', // horarios y bloqueos
  'settings:write', // config del turnero
  'team:manage', // invitar / gestionar usuarios y sus roles
] as const;
export type TurnoCapability = (typeof TURNO_CAPABILITIES)[number];

/** Metadata de cada permiso para la UI de roles (label + descripción en criollo). */
export const CAPABILITY_META: { key: TurnoCapability; label: string; desc: string }[] = [
  { key: 'appointments:write', label: 'Turnos (agenda)', desc: 'Crear, editar y cancelar turnos' },
  {
    key: 'resources:toggle',
    label: 'Habilitar / deshabilitar canchas',
    desc: 'Poner una cancha (o persona) fuera de servicio o volver a habilitarla',
  },
  {
    key: 'resources:write',
    label: 'Gestionar canchas y equipo',
    desc: 'Crear, editar y borrar canchas o profesionales, y acomodar el mapa',
  },
  { key: 'services:write', label: 'Servicios', desc: 'Crear y editar servicios y precios' },
  { key: 'schedule:write', label: 'Horarios', desc: 'Horarios de atención y bloqueos' },
  { key: 'settings:write', label: 'Configuración', desc: 'Ajustes del turnero y del comercio' },
  { key: 'team:manage', label: 'Usuarios y permisos', desc: 'Invitar gente y cambiar roles y permisos' },
];

/** Roles asignables a un usuario del comercio. */
export const TURNO_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'VIEWER'] as const;
export type TurnoRole = (typeof TURNO_ROLES)[number];

/** Roles que se pueden asignar/editar desde la UI (OWNER se gestiona aparte). */
export const ASSIGNABLE_ROLES = ['MANAGER', 'CASHIER', 'VIEWER'] as const;
export const EDITABLE_ROLES = ['MANAGER', 'CASHIER', 'VIEWER'] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];

/** Nombres por defecto de los roles (comercio genérico: barbería, salón, etc.). */
export const DEFAULT_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Administrador',
  CASHIER: 'Recepcionista',
  VIEWER: 'Solo lectura',
  PENDING: 'Pendiente',
  STOCK_OPERATOR: 'Operador',
};

/** Nombres sugeridos para clubes deportivos (modo canchas). */
export const CLUB_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Coordinador',
  CASHIER: 'Profesor',
  VIEWER: 'Solo lectura',
  PENDING: 'Pendiente',
};

/** Overrides de nombres de rol por tenant (guardado en turnoConfig.roleLabels). */
export type RoleLabelsOverrides = Partial<Record<EditableRole, string>>;

/** Nombres por defecto según el tipo de negocio (club vs genérico). */
export function defaultRoleLabels(canchas?: boolean): Record<string, string> {
  return canchas ? CLUB_ROLE_LABELS : DEFAULT_ROLE_LABELS;
}

/** Nombre efectivo de un rol: el custom del tenant, o el default del rubro. */
export function roleLabelFor(
  role: string | null | undefined,
  overrides?: RoleLabelsOverrides,
  canchas?: boolean,
): string {
  if (!role) return '';
  const custom = overrides?.[role as EditableRole];
  if (custom && custom.trim()) return custom.trim();
  return defaultRoleLabels(canchas)[role] ?? role;
}

/** Mapa completo de nombres efectivos (para poblar dropdowns en la UI). */
export function roleLabelsFor(
  overrides?: RoleLabelsOverrides,
  canchas?: boolean,
): Record<string, string> {
  const base = { ...defaultRoleLabels(canchas) };
  for (const r of EDITABLE_ROLES) {
    const c = overrides?.[r];
    if (c && c.trim()) base[r] = c.trim();
  }
  return base;
}

/** Permisos por defecto (baseline). Cada tenant puede overridearlos por rol. */
export const DEFAULT_ROLE_CAPABILITIES: Record<string, TurnoCapability[]> = {
  OWNER: [...TURNO_CAPABILITIES],
  MANAGER: [
    'appointments:write',
    'resources:toggle',
    'resources:write',
    'services:write',
    'schedule:write',
    'settings:write',
  ],
  CASHIER: ['appointments:write'],
  VIEWER: [],
  PENDING: [],
  STOCK_OPERATOR: [],
};

/** Overrides de permisos por tenant: rol → permisos (turnoConfig.rolePermissions). */
export type RolePermissionsOverrides = Partial<Record<EditableRole, TurnoCapability[]>>;

/**
 * Permisos EFECTIVOS de un rol, considerando los overrides del tenant.
 * OWNER siempre tiene todo (no se puede limitar); PENDING nunca tiene nada.
 */
export function effectiveCapabilities(
  role: string | null | undefined,
  overrides?: RolePermissionsOverrides,
): TurnoCapability[] {
  if (!role || role === 'PENDING') return [];
  if (role === 'OWNER') return [...TURNO_CAPABILITIES];
  const override = overrides?.[role as EditableRole];
  return override ?? DEFAULT_ROLE_CAPABILITIES[role] ?? [];
}

export function capabilitiesFor(
  role: string | null | undefined,
  overrides?: RolePermissionsOverrides,
): TurnoCapability[] {
  return effectiveCapabilities(role, overrides);
}

export function roleCan(
  role: string | null | undefined,
  cap: TurnoCapability,
  overrides?: RolePermissionsOverrides,
): boolean {
  return effectiveCapabilities(role, overrides).includes(cap);
}

// Gestión de usuarios del comercio (requiere team:manage).
export const inviteMemberSchema = z.object({
  email: z.string().email('Email inválido'),
  fullName: z.string().trim().max(120).optional(),
  role: z.enum(['MANAGER', 'CASHIER', 'VIEWER']),
  redirectTo: z.string().url().optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(['MANAGER', 'CASHIER', 'VIEWER']),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/** Guardado de la config de roles del tenant: nombres + permisos por rol editable. */
export const updateRolesConfigSchema = z.object({
  labels: z.record(z.enum(EDITABLE_ROLES), z.string().trim().max(40)).optional(),
  permissions: z
    .record(z.enum(EDITABLE_ROLES), z.array(z.enum(TURNO_CAPABILITIES)))
    .optional(),
});
export type UpdateRolesConfigInput = z.infer<typeof updateRolesConfigSchema>;

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
/** Unidad del precio de un servicio. */
export const PRICE_UNITS = ['court', 'player'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];
export const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  court: 'por cancha',
  player: 'por jugador',
};

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  description: z.string().trim().max(1000).optional(),
  durationMin: z.coerce.number().int().min(5, 'Mínimo 5 minutos').max(1440),
  price: z.coerce.number().nonnegative().nullable().optional(),
  priceUnit: z.enum(PRICE_UNITS).nullable().optional(),
  color: z.string().max(20).optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  // Si el servicio pide los datos de las personas al reservar (ej: singles = 2, dobles = 4).
  askPeople: z.boolean().default(false),
  peopleCount: z.coerce.number().int().min(1).max(12).nullable().optional(),
  // Qué recursos ofrecen el servicio (vacío = todos).
  resourceIds: z.array(z.string().uuid()).default([]),
});
export const updateServiceSchema = createServiceSchema.partial();
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// ─────────────────────────────────────────────────────────────
// Productos — el CRUD de soytuturno escribe en las tablas de soytuadmin
// (products + product_variants + stock_levels + price_list_items). 1 producto =
// 1 variante, 1 lista de precios (la default), stock en el depósito default.
// ─────────────────────────────────────────────────────────────
export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  price: z.coerce.number().nonnegative().nullable().optional(),
  stock: z.coerce.number().int().nonnegative().optional(),
  active: z.boolean().default(true),
  // URL de la imagen (subida al bucket tenant-assets). '' o null = sin foto.
  imageUrl: z.string().url().or(z.literal('')).nullable().optional(),
});
export const updateProductSchema = createProductSchema.partial();
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Ítem de producto elegido al reservar (variante + cantidad). */
export const bookProductSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(99),
});
export type BookProductInput = z.infer<typeof bookProductSchema>;

// ─────────────────────────────────────────────────────────────
// Recursos (profesionales / boxes / sillas) — y canchas en modo club
// ─────────────────────────────────────────────────────────────
/** Deportes soportados para el modo "canchas" (clubes deportivos). */
export const SPORTS = ['padel', 'tenis', 'futbol', 'futsal', 'basquet', 'otro'] as const;
export type Sport = (typeof SPORTS)[number];
export const SPORT_LABELS: Record<Sport, string> = {
  padel: 'Pádel',
  tenis: 'Tenis',
  futbol: 'Fútbol',
  futsal: 'Futsal',
  basquet: 'Básquet',
  otro: 'Otra',
};
/** Proporción (ancho:alto) real aproximada de cada deporte, para el tamaño por defecto en el mapa. */
export const SPORT_ASPECT: Record<Sport, { w: number; h: number }> = {
  padel: { w: 100, h: 200 }, // 10 x 20 m
  tenis: { w: 110, h: 238 }, // 10.97 x 23.77 m
  futbol: { w: 200, h: 300 }, // cancha grande
  futsal: { w: 100, h: 200 }, // 20 x 40 m
  basquet: { w: 150, h: 280 }, // 15 x 28 m
  otro: { w: 140, h: 200 },
};

export const createResourceSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  title: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  avatarUrl: z.string().url().or(z.literal('')).optional(),
  color: z.string().max(20).optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  userId: z.string().uuid().nullable().optional(),
  // Qué servicios ofrece (vacío = todos). Es el mismo vínculo que `resourceIds`
  // del servicio, visto desde el otro lado.
  serviceIds: z.array(z.string().uuid()).optional(),
  // Modo canchas:
  sport: z.enum(SPORTS).nullable().optional(),
  surface: z.string().trim().max(60).nullable().optional(),
  // true = solo referencia del mapa (bar, entrada, cancha que no se alquila):
  // se ve en el plano pero no aparece en Canchas ni se reserva.
  reference: z.boolean().optional(),
  mapX: z.number().nullable().optional(),
  mapY: z.number().nullable().optional(),
  mapW: z.number().nullable().optional(),
  mapH: z.number().nullable().optional(),
  mapRotation: z.number().nullable().optional(),
});
export const updateResourceSchema = createResourceSchema.partial();
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

/** Guardado en lote de las posiciones de las canchas en el mapa (editor del admin). */
export const saveCourtLayoutSchema = z.object({
  courts: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        mapX: z.number(),
        mapY: z.number(),
        mapW: z.number().positive(),
        mapH: z.number().positive(),
        mapRotation: z.number(),
        color: z.string().max(20).nullable().optional(),
        reference: z.boolean().optional(),
      }),
    )
    .max(200),
});
export type SaveCourtLayoutInput = z.infer<typeof saveCourtLayoutSchema>;

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
// Jugadores / acompañantes (clubes)
// ─────────────────────────────────────────────────────────────
/** Un jugador / acompañante del turno. */
export const playerSchema = z.object({
  firstName: z.string().trim().min(1, 'Poné el nombre').max(120),
  lastName: z.string().trim().max(120).optional().default(''),
  // Categoría que define cuánto paga (la configura el club). Null = sin categoría.
  categoryId: z.string().uuid().nullable().optional(),
});
export type Player = z.infer<typeof playerSchema>;

/**
 * Categoría de persona: cuánto paga cada una según su condición. La lista la
 * arma cada club (socio con abono, socio sin abono, no socio, menor, invitado…).
 */
export const createPlayerCategorySchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  // Null = sin precio configurado (no suma). Para "no paga" usar 0.
  price: z.coerce.number().nonnegative().nullable().optional(),
  priceWeekend: z.coerce.number().nonnegative().nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean().default(true),
});
export const updatePlayerCategorySchema = createPlayerCategorySchema.partial();
export type CreatePlayerCategoryInput = z.infer<typeof createPlayerCategorySchema>;
export type UpdatePlayerCategoryInput = z.infer<typeof updatePlayerCategorySchema>;

/** Una categoría tal como la ve el front (precios ya resueltos a number). */
export type PlayerCategoryDto = {
  id: string;
  name: string;
  price: number | null;
  priceWeekend: number | null;
  sortOrder: number;
  active: boolean;
};

/**
 * Precio que paga una persona según su categoría y si el turno cae fin de semana.
 * Devuelve null si no está configurado ese precio (no suma al total).
 */
export function playerPrice(
  categoryId: string | null | undefined,
  categories: Pick<PlayerCategoryDto, 'id' | 'price' | 'priceWeekend'>[],
  weekend: boolean,
): number | null {
  if (!categoryId) return null;
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return null;
  // Si el finde no tiene precio propio, cae al de entre semana.
  return weekend ? (cat.priceWeekend ?? cat.price) : cat.price;
}

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
  // Jugadores/acompañantes (si el club los pide). El backend calcula el precio.
  players: z.array(playerSchema).max(12).optional(),
  // Productos a reservar junto al turno (el backend separa el stock).
  products: z.array(bookProductSchema).max(50).optional(),
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
// Reseñas / puntuaciones (negocio o profesional)
// ─────────────────────────────────────────────────────────────
export const portalReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Poné al menos 1 estrella').max(5),
  comment: z.string().trim().max(500).optional(),
  // Sin resourceId => reseña del negocio. Con resourceId => del profesional.
  resourceId: z.string().uuid().optional(),
  authorName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});
export type PortalReviewInput = z.infer<typeof portalReviewSchema>;

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
  // Jugadores/acompañantes (si el comercio los pide). Máx 12.
  players: z.array(playerSchema).max(12).optional(),
  // Productos a reservar junto al turno (el backend separa el stock).
  products: z.array(bookProductSchema).max(50).optional(),
});
export type PortalBookInput = z.infer<typeof portalBookSchema>;

// ─────────────────────────────────────────────────────────────
// Config de turnos del comercio (la edita el propio OWNER/MANAGER)
// ─────────────────────────────────────────────────────────────
/** Intervalos posibles para ofrecer turnos (minutos). */
export const SLOT_STEP_OPTIONS = [10, 15, 20, 30, 45, 60, 90] as const;

export const updateTurnoSettingsSchema = z.object({
  // Cada cuánto se ofrecen turnos: 08:00, 08:30, 09:00… (según el paso).
  slotStepMin: z.coerce.number().int().min(5).max(240).optional(),
  // Anticipación mínima para reservar (minutos desde ahora).
  minLeadMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  // Pedir los datos de las personas al reservar, con su categoría (modo club).
  askPlayers: z.boolean().optional(),
  // Habilitar productos propios (el comercio los ofrece para reservar con el turno).
  productsEnabled: z.boolean().optional(),
  // Aparecer en el directorio público (landing de soytuturno.com).
  listedOnLanding: z.boolean().optional(),
  // Precios diferenciados de fin de semana (sábado/domingo) en las categorías.
  priceWeekendEnabled: z.boolean().optional(),
  // Recargo por luz: se suma solo a los turnos que usan luz artificial.
  lightEnabled: z.boolean().optional(),
  // 'HH:MM' — desde qué hora se considera que el turno usa luz.
  lightFrom: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)')
    .optional(),
  lightPrice: z.coerce.number().nonnegative().nullable().optional(),
  // Ubicación: link de Google Maps que pega el comercio (se muestra en el portal).
  mapsUrl: z.string().trim().max(600).optional(),
});

/**
 * ¿El turno usa luz? Se cobra si CUALQUIER parte cae después de la hora de luz,
 * no solo si arranca ahí: un turno de 18:30 a 20:00 usa luz una hora y media.
 * Los minutos se cuentan desde la medianoche del día en que empieza, así un
 * turno que cruza las 00:00 queda siempre del lado de la noche.
 */
export function usesLight(
  startHHMM: string,
  durationMin: number,
  lightFrom: string,
): boolean {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const from = toMin(lightFrom);
  const end = toMin(startHHMM) + durationMin;
  return end > from;
}

/**
 * Link de Google Maps → URL embebible en un iframe.
 *
 * Los links de «Compartir» (maps.app.goo.gl/…) no se pueden embeber, así que
 * sacamos las coordenadas del link cuando están y armamos el embed con eso. Si
 * no hay forma, caemos a buscar la dirección del comercio. Devuelve null si no
 * hay ni link ni dirección.
 */
export function mapsEmbedUrl(rawUrl: string | null | undefined, address?: string | null): string | null {
  const url = (rawUrl ?? '').trim();
  const q = (v: string) => `https://maps.google.com/maps?q=${encodeURIComponent(v)}&z=16&output=embed`;

  if (url) {
    // Ya es un embed (el del botón «Insertar un mapa»): se usa tal cual.
    if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(url)) return url;
    // Coordenadas dentro del link: /@-32.94,-60.65,17z  o  !3d-32.94!4d-60.65
    const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const bang = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const qq = url.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    const hit = bang ?? at ?? qq;
    if (hit) return q(`${hit[1]},${hit[2]}`);
    // Link con el lugar por nombre: /maps/place/Club+Talleres/…
    const place = url.match(/\/maps\/place\/([^/@?]+)/);
    if (place?.[1]) return q(decodeURIComponent(place[1].replace(/\+/g, ' ')));
  }
  return address?.trim() ? q(address.trim()) : null;
}

/** ¿La fecha YYYY-MM-DD cae sábado o domingo? (día local). */
export function isWeekendDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}
export type UpdateTurnoSettingsInput = z.infer<typeof updateTurnoSettingsSchema>;

// ─────────────────────────────────────────────────────────────
// Superadmin: activar el turnero por comercio + config
// ─────────────────────────────────────────────────────────────
/** Alta de un comercio nuevo desde el superadmin (crea tenant + invita al dueño). */
export const adminCreateTenantSchema = z.object({
  name: z.string().trim().min(1, 'Poné el nombre del comercio').max(120),
  slug: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  ownerEmail: z.string().email('Email inválido'),
  ownerName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  // Modo club deportivo: habilita las canchas + el mapa del predio.
  canchas: z.boolean().optional(),
  // A dónde vuelve el dueño tras aceptar la invitación (lo arma el front).
  redirectTo: z.string().url().optional(),
});
export type AdminCreateTenantInput = z.infer<typeof adminCreateTenantSchema>;

/** Edición de datos de un comercio desde el superadmin. */
export const adminUpdateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones')
    .optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  ownerName: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});
export type AdminUpdateTenantInput = z.infer<typeof adminUpdateTenantSchema>;

export const adminUpdateTurnoSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().trim().min(1).max(64).optional(),
  slotStepMin: z.coerce.number().int().min(5).max(120).optional(),
  minLeadMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  // Modo club deportivo (canchas + mapa).
  canchas: z.boolean().optional(),
});
export type AdminUpdateTurnoInput = z.infer<typeof adminUpdateTurnoSchema>;

// Paginación estándar (igual que el resto del ecosistema).
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;
