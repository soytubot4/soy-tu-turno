/**
 * Utilidades de fecha/hora con timezone, sin dependencias externas (usa Intl).
 *
 * Los turnos se guardan como instantes UTC (timestamptz), pero el horario del
 * comercio ("abre 09:00") es hora de pared en la timezone del tenant. Acá
 * convertimos entre ambos mundos.
 *
 * Limitación conocida: en la hora exacta de un cambio de horario de verano el
 * offset puede quedar mal por 1h. Es un caso de borde aceptable para la Fase 1.
 */

export const DEFAULT_TIMEZONE = 'America/Asuncion';

/** Lee la timezone del tenant desde turnoConfig (JSON), con fallback. */
export function tenantTimezone(turnoConfig: unknown): string {
  if (turnoConfig && typeof turnoConfig === 'object') {
    const tz = (turnoConfig as Record<string, unknown>).timezone;
    if (typeof tz === 'string' && tz.length > 0) return tz;
  }
  return DEFAULT_TIMEZONE;
}

/** Offset (ms) de la timezone respecto de UTC para un instante dado. TZ adelantada → negativo. */
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  // '24' aparece a medianoche en algunos runtimes → normalizar a 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(
    map.year ?? 1970,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    hour ?? 0,
    map.minute ?? 0,
    map.second ?? 0,
  );
  return asUtc - date.getTime();
}

/** 'YYYY-MM-DD' + minutos-desde-medianoche (hora de pared en TZ) → instante UTC. */
export function wallTimeToUtc(dateYmd: string, minutesFromMidnight: number, timeZone: string): Date {
  const [y, m, d] = dateYmd.split('-').map(Number) as [number, number, number];
  const hh = Math.floor(minutesFromMidnight / 60);
  const mm = minutesFromMidnight % 60;
  // Primera aproximación: interpretar la hora de pared como si fuera UTC.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMs(timeZone, new Date(guess));
  return new Date(guess - offset);
}

/** Día de la semana (0=Dom … 6=Sáb) de una fecha 'YYYY-MM-DD' en la TZ del tenant. */
export function dayOfWeekInTz(dateYmd: string, timeZone: string): number {
  // Mediodía evita cruces de día por el offset.
  const instant = wallTimeToUtc(dateYmd, 12 * 60, timeZone);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  return idx < 0 ? 0 : idx;
}

/** 'HH:MM' → minutos desde medianoche. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** ¿Se solapan [aStart,aEnd) y [bStart,bEnd)? (instantes UTC en ms) */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
