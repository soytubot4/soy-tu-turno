'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  Users,
  Phone,
  MapPin,
  Package,
  Repeat,
} from 'lucide-react';
import { resolveClassFor, type ClassRange, type AppointmentStatusValue } from '@soytuturno/shared';
import {
  listAppointments,
  cancelAppointment,
  updateAppointment,
  type Appointment,
} from '@/features/agenda/api';
import { getTurnoSettings } from '@/features/horarios/settings-api';
import { listResources } from '@/features/equipo/api';
import { listInstructors, setSlotException } from '@/features/profesores/api';
import { ensureRecurring } from '@/features/fijos/api';
import { useMe } from '@/features/me/api';
import { resourceLabel } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { NewAppointmentDialog } from './new-appointment-dialog';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function dayBounds(ymd: string): { from: string; to: string } {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const start = new Date(y, m - 1, d, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
/** Minutos desde medianoche (hora local) de un ISO. */
function minutesOfIso(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
/** 'HH:MM' → minutos desde medianoche. */
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Una clase de profesor dibujada en la agenda (no es un turno reservado). */
type ClassBlock = {
  id: string;
  /** La franja semanal de la que sale (para editar ese día puntual). */
  slotId: string;
  resourceId: string;
  /** Cancha configurada para ese día (null = ocupa todas). */
  baseResourceId: string | null;
  /** Todos los tramos de la clase ese día (uno solo = clase corrida). */
  baseRanges: ClassRange[];
  startMin: number;
  endMin: number;
  instructor: string;
  label: string | null;
  /** true si ese día tiene una excepción (se movió de horario o cancha). */
  moved: boolean;
};

/** 'HH:MM' desde minutos desde medianoche. */
function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function fmtLongDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const STATUS: Record<AppointmentStatusValue, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'text-[var(--color-warning)] border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10' },
  CONFIRMED: { label: 'Confirmado', className: 'text-[var(--color-primary)] border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10' },
  COMPLETED: { label: 'Atendido', className: 'text-[var(--color-success)] border-[var(--color-success)]/40 bg-[var(--color-success)]/10' },
  CANCELLED: { label: 'Cancelado', className: 'text-[var(--color-muted-foreground)] border-[var(--color-border)] bg-[var(--color-muted)]' },
  NO_SHOW: { label: 'No vino', className: 'text-[var(--color-destructive)] border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10' },
};

// Alto (px) de cada celda del intervalo. Un turno más largo que el intervalo
// ocupa varias celdas (ej: con intervalo de 15 min, un turno de 30 min = 2 celdas).
const CELL_PX = 44;

export default function AgendaPage() {
  const qc = useQueryClient();
  const { can } = useMe();
  const canWrite = can('appointments:write');
  const [date, setDate] = useState(todayYmd());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTime, setNewTime] = useState<string | null>(null); // hora precargada al tocar un slot
  const [detail, setDetail] = useState<Appointment | null>(null);
  // Clase de un profe que se está editando para ESE día.
  const [classDetail, setClassDetail] = useState<ClassBlock | null>(null);

  const [newResource, setNewResource] = useState<string | null>(null);
  const openNew = (time: string | null, resourceId: string | null = null) => {
    setNewTime(time);
    setNewResource(resourceId);
    setDialogOpen(true);
  };

  // Turnos fijos: al abrir la agenda rellenamos los que falten generar, así se
  // renuevan solos sin depender de un proceso aparte. Es idempotente; si no hay
  // nada que crear no hace nada. Corre una sola vez por visita.
  const { data: settings } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings });
  const ensured = useRef(false);
  useEffect(() => {
    if (ensured.current || !settings?.recurringEnabled) return;
    ensured.current = true;
    ensureRecurring()
      .then((r) => {
        if (r.creados > 0) qc.invalidateQueries({ queryKey: ['appointments'] });
      })
      .catch(() => undefined); // si falla, la agenda funciona igual
  }, [settings?.recurringEnabled, qc]);

  // Reloj para mover la línea de "ahora" (se actualiza cada minuto).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { from, to } = useMemo(() => dayBounds(date), [date]);
  const { data: appts, isLoading } = useQuery({
    queryKey: ['appointments', date],
    queryFn: () => listAppointments(from, to),
  });
  const slotStepMin = settings?.slotStepMin ?? 15;
  // Una columna por cancha/profesional. Las referencias del mapa (bar, entrada)
  // no se reservan, así que no tienen columna.
  const { data: allResources } = useQuery({ queryKey: ['resources'], queryFn: listResources });
  const bookable = (allResources ?? []).filter((r) => r.active && !r.reference);
  // null = ver todas. Si filtran por una, queda esa sola columna.
  const [onlyResource, setOnlyResource] = useState<string | null>(null);
  const columns = onlyResource ? bookable.filter((r) => r.id === onlyResource) : bookable;

  // Clases de los profesores: ocupan la cancha aunque no sean una reserva, así
  // que tienen que verse en la agenda o el club cree que está libre.
  const { data: instructors } = useQuery({ queryKey: ['instructors'], queryFn: listInstructors });
  const classes = useMemo(() => {
    const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
    const dow = new Date(y, mo - 1, d).getDay();
    const out: ClassBlock[] = [];
    for (const prof of instructors ?? []) {
      if (!prof.active) continue;
      for (const sl of prof.slots) {
        // Lo que cambia ESE día: movida de horario/cancha, o suspendida.
        const ex = sl.exceptions.find((e) => e.date === date) ?? null;
        const eff = resolveClassFor(sl, date, dow, ex);
        if (!eff) continue; // no toca hoy, o está suspendida
        // Una franja sin cancha ocupa todas: se dibuja en cada columna.
        const targets = eff.resourceId ? [eff.resourceId] : bookable.map((r) => r.id);
        for (const rid of targets) {
          eff.ranges.forEach((r, i) => {
            out.push({
              id: `${sl.id}-${rid}-${i}`,
              slotId: sl.id,
              resourceId: rid,
              baseResourceId: eff.resourceId,
              baseRanges: eff.ranges,
              startMin: hhmmToMin(r.from),
              endMin: hhmmToMin(r.to),
              instructor: prof.name,
              label: sl.label,
              moved: !!ex && !ex.cancelled,
            });
          });
        }
      }
    }
    return out;
  }, [instructors, date, bookable]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['appointments'] });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      toast.success('Turno cancelado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: AppointmentStatusValue }) =>
      updateAppointment(v.id, { status: v.status }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (appts ?? []).filter((a) => a.status !== 'CANCELLED');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Agenda</h1>
        {canWrite && (
          <Button onClick={() => openNew(null)}>
            <Plus className="h-4 w-4" /> Nuevo turno
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate(shiftYmd(date, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center">
          <div className="text-sm font-medium capitalize">{fmtLongDate(date)}</div>
          {date !== todayYmd() && (
            <button
              type="button"
              onClick={() => setDate(todayYmd())}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              Volver a hoy
            </button>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={() => setDate(shiftYmd(date, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Filtro: por defecto se ven todas; sirve para aislar una y verla sola. */}
      {bookable.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={onlyResource === null ? 'default' : 'outline'}
            onClick={() => setOnlyResource(null)}
          >
            Todas
          </Button>
          {bookable.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant={onlyResource === r.id ? 'default' : 'outline'}
              onClick={() => setOnlyResource(r.id === onlyResource ? null : r.id)}
            >
              {r.name}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : (
        <div className="space-y-2">
          {canWrite && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {list.length === 0
                ? 'No hay turnos para este día. Tocá un horario para agregar uno.'
                : 'Tocá un horario libre para agregar un turno.'}
            </p>
          )}
          <DayGrid
            date={date}
            appts={list}
            classes={classes}
            columns={columns}
            slotStepMin={slotStepMin}
            nowMs={nowMs}
            canWrite={canWrite}
            onOpen={setDetail}
            onOpenClass={setClassDetail}
            onSlotClick={(m, resourceId) => openNew(fmtMin(m), resourceId)}
          />
        </div>
      )}

      <NewAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={date}
        defaultTime={newTime ?? undefined}
        defaultResourceId={newResource}
        onCreated={invalidate}
      />

      <ClassDayDialog
        clase={classDetail}
        date={date}
        canWrite={canWrite}
        onClose={() => setClassDetail(null)}
        onSaved={() => {
          setClassDetail(null);
          qc.invalidateQueries({ queryKey: ['instructors'] });
          qc.invalidateQueries({ queryKey: ['availability'] });
        }}
      />

      <AppointmentDetailDialog
        appt={detail}
        canWrite={canWrite}
        busy={cancel.isPending || setStatus.isPending}
        onClose={() => setDetail(null)}
        onCancel={(id) => cancel.mutate(id)}
        onComplete={(id) => setStatus.mutate({ id, status: 'COMPLETED' })}
        onNoShow={(id) => setStatus.mutate({ id, status: 'NO_SHOW' })}
      />
    </div>
  );
}

function customerName(c: Appointment['customer']): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.phone || 'Cliente';
}

// ── Grilla de día ──────────────────────────────────────────────
type Placed = { a: Appointment; s: number; e: number; col: number; cols: number };

/**
 * Reparte los turnos en columnas para que los que se pisan en horario (ej: dos
 * canchas a la misma hora) queden lado a lado en vez de encimados.
 */
function layoutAppts(appts: Appointment[]): Placed[] {
  const evs = appts
    .map((a) => ({ a, s: minutesOfIso(a.startAt), e: minutesOfIso(a.endAt) }))
    .sort((x, y) => x.s - y.s || x.e - y.e);

  const out: Placed[] = [];
  let cluster: typeof evs = [];
  let clusterEnd = -1;

  const flush = () => {
    const laneEnds: number[] = []; // por columna, el fin del último turno
    const laneOf = new Map<(typeof evs)[number], number>();
    for (const ev of cluster) {
      let placed = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i]! <= ev.s) {
          laneEnds[i] = ev.e;
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        placed = laneEnds.length;
        laneEnds.push(ev.e);
      }
      laneOf.set(ev, placed);
    }
    const cols = laneEnds.length || 1;
    for (const ev of cluster) out.push({ ...ev, col: laneOf.get(ev) ?? 0, cols });
    cluster = [];
    clusterEnd = -1;
  };

  for (const ev of evs) {
    if (cluster.length && ev.s >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  if (cluster.length) flush();
  return out;
}

function DayGrid({
  date,
  appts,
  classes,
  columns,
  slotStepMin,
  nowMs,
  canWrite,
  onOpen,
  onOpenClass,
  onSlotClick,
}: {
  date: string;
  appts: Appointment[];
  /** Clases de profesores que ocupan la cancha ese día. */
  classes: ClassBlock[];
  /** Una columna por cancha/profesional, en orden. */
  columns: { id: string; name: string; color: string | null }[];
  slotStepMin: number;
  nowMs: number;
  canWrite: boolean;
  onOpen: (a: Appointment) => void;
  onOpenClass: (c: ClassBlock) => void;
  onSlotClick: (minutes: number, resourceId: string | null) => void;
}) {
  const step = Math.max(5, slotStepMin);
  const pxPerMin = CELL_PX / step;

  const now = new Date(nowMs);
  const isToday = date === todayYmd();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Ventana visible: por defecto 08–20, expandida por los turnos del día (y por
  // "ahora" si es hoy). Se redondea a la hora entera.
  let winStart = 8 * 60;
  let winEnd = 20 * 60;
  for (const a of appts) {
    winStart = Math.min(winStart, minutesOfIso(a.startAt));
    winEnd = Math.max(winEnd, minutesOfIso(a.endAt));
  }
  // Las clases también entran en la ventana: si hay una a las 21:00, esa hora
  // tiene que verse aunque no haya ningún turno.
  for (const c of classes) {
    winStart = Math.min(winStart, c.startMin);
    winEnd = Math.max(winEnd, c.endMin);
  }
  if (isToday) {
    winStart = Math.min(winStart, nowMin);
    winEnd = Math.max(winEnd, nowMin + 30);
  }
  winStart = Math.max(0, Math.floor(winStart / 60) * 60);
  winEnd = Math.min(24 * 60, Math.ceil(winEnd / 60) * 60);
  if (winEnd <= winStart) winEnd = winStart + 60;

  const cells: number[] = [];
  for (let m = winStart; m < winEnd; m += step) cells.push(m);
  const gridH = (winEnd - winStart) * pxPerMin;
  const placed = layoutAppts(appts);

  return (
    <div
      className="overflow-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] [scrollbar-gutter:stable]"
      style={{ maxHeight: 'calc(100vh - 260px)' }}
    >
      {/* Encabezado: qué cancha es cada columna. Sticky para no perderlo al
          scrollear un día largo. */}
      <div className="sticky top-0 z-30 flex border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="w-14 shrink-0 border-r border-[var(--color-border)]" />
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex min-w-[150px] flex-1 items-center gap-1.5 border-r border-[var(--color-border)] px-2 py-2 last:border-r-0"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: col.color || 'var(--color-primary)' }}
            />
            <span className="truncate text-xs font-medium">{col.name}</span>
          </div>
        ))}
      </div>

      {/* py-3: aire arriba/abajo para que la primera y última etiqueta no se corten */}
      <div className="flex py-3">
        {/* Columna de horas (incluye la hora de cierre al final) */}
        <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)]">
          {cells.map((m) => (
            <div key={m} style={{ height: CELL_PX }} className="relative">
              <span className="absolute -top-1.5 right-1.5 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                {fmtMin(m)}
              </span>
            </div>
          ))}
          {/* Hora de cierre (borde inferior de la última celda) */}
          <div className="relative">
            <span className="absolute -top-1.5 right-1.5 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
              {fmtMin(winEnd)}
            </span>
          </div>
        </div>

        {/* Un área por cancha: la columna es SIEMPRE la misma cancha, así se ve
            de un vistazo cuál está libre a cada hora. */}
        {columns.map((col) => {
          // Turnos de esta cancha. Si dos se pisan (no debería, pero puede pasar
          // con solapamientos parciales), se reparten dentro de su columna.
          const placed = layoutAppts(appts.filter((a) => a.resource.id === col.id));
          const colClasses = classes.filter((c) => c.resourceId === col.id);
          // Una celda tapada por una clase no se puede reservar: la cancha está
          // ocupada. Sin esto el hover invitaba a agregar un turno ahí.
          const enClase = (m: number) =>
            colClasses.some((c) => m < c.endMin && m + step > c.startMin);
          return (
            <div
              key={col.id}
              className="relative min-w-[150px] flex-1 border-r border-[var(--color-border)] last:border-r-0"
              style={{ height: gridH }}
            >
              {cells.map((m, i) => {
                const ocupada = enClase(m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!canWrite || ocupada}
                    onClick={() => onSlotClick(m, col.id)}
                    style={{ top: i * CELL_PX, height: CELL_PX }}
                    className={`group absolute inset-x-0 flex items-center gap-1.5 border-t px-2 text-left transition-colors ${
                      m % 60 === 0 ? 'border-[var(--color-border)]' : 'border-[var(--color-border)]/40'
                    } ${
                      canWrite && !ocupada
                        ? 'cursor-pointer hover:bg-[var(--color-accent)]/50'
                        : 'cursor-default'
                    }`}
                  >
                    {canWrite && !ocupada && (
                      <span className="pointer-events-none truncate text-xs font-medium text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
                        <Plus className="mr-0.5 inline h-3.5 w-3.5" />
                        {fmtMin(m)}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Línea de cierre */}
              <div className="absolute inset-x-0 border-t border-[var(--color-border)]" style={{ top: gridH }} />

              {/* Línea de "ahora" */}
              {isToday && nowMin >= winStart && nowMin <= winEnd && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                  style={{ top: (nowMin - winStart) * pxPerMin }}
                >
                  <div className="h-px flex-1 bg-[var(--color-destructive)]" />
                </div>
              )}

              {/* Clases del profe: van DEBAJO de los turnos (z menor) y sin
                  click, porque no son una reserva. */}
              {classes
                .filter((c) => c.resourceId === col.id)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpenClass(c)}
                    title="Tocá para cambiar esta clase solo este día"
                    className="absolute inset-x-0 z-[5] overflow-hidden border-y border-[var(--color-border)] px-2 py-1 text-left transition-opacity hover:opacity-80"
                    style={{
                      top: (c.startMin - winStart) * pxPerMin,
                      height: Math.max(20, (c.endMin - c.startMin) * pxPerMin),
                      // Rayado diagonal sobre fondo sólido: tapa las líneas de la
                      // grilla y se lee como "acá no se puede reservar".
                      backgroundColor: 'var(--color-card)',
                      backgroundImage:
                        'repeating-linear-gradient(45deg, var(--color-muted) 0 6px, transparent 6px 12px)',
                    }}
                  >
                    <p className="truncate text-[11px] font-medium text-[var(--color-muted-foreground)]">
                      {fmtMin(c.startMin)}–{fmtMin(c.endMin)} · {c.label || 'Clase'}
                    </p>
                    <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                      {c.instructor}
                      {c.moved && ' · movida'}
                    </p>
                  </button>
                ))}

              {placed.map(({ a, s: st, e, col: c, cols }) => (
                <AppointmentBlock
                  key={a.id}
                  appt={a}
                  top={(st - winStart) * pxPerMin}
                  height={Math.max(20, (e - st) * pxPerMin)}
                  leftPct={(c / cols) * 100}
                  widthPct={(1 / cols) * 100}
                  onOpen={() => onOpen(a)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentBlock({
  appt,
  top,
  height,
  leftPct,
  widthPct,
  onOpen,
}: {
  appt: Appointment;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  onOpen: () => void;
}) {
  const st = STATUS[appt.status];
  const accent = appt.resource.color || appt.service.color || null;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${fmtTime(appt.startAt)}–${fmtTime(appt.endAt)} · ${customerName(appt.customer)}`}
      className={`absolute z-10 flex flex-col overflow-hidden rounded-md border px-2 py-1 text-left leading-tight transition-shadow hover:shadow-md ${st.className}`}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        borderLeft: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <span className="flex items-center gap-1 truncate text-xs font-semibold">
        {/* El ícono marca que es un turno fijo (se repite todas las semanas). */}
        {appt.recurringId && <Repeat className="h-3 w-3 shrink-0" aria-label="Turno fijo" />}
        <span className="truncate">
          {fmtTime(appt.startAt)} · {customerName(appt.customer)}
        </span>
      </span>
      {height > 30 && (
        <span className="truncate text-[11px] opacity-80">
          {appt.resource.name}
          {appt.service?.name ? ` · ${appt.service.name}` : ''}
        </span>
      )}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  );
}

/** Detalle de una reserva (se abre al tocar el turno en la agenda). */
function AppointmentDetailDialog({
  appt,
  canWrite,
  busy,
  onClose,
  onCancel,
  onComplete,
  onNoShow,
}: {
  appt: Appointment | null;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onCancel: (id: string) => void;
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
}) {
  // El recurso se llama distinto según el rubro: cancha en un club, profesional
  // en una peluquería.
  const { canchas } = useMe();
  return (
    <Dialog open={!!appt} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {appt && (
          <>
            <DialogHeader>
              <DialogTitle>{customerName(appt.customer)}</DialogTitle>
              <DialogDescription>Detalle de la reserva</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-muted-foreground)]">Estado</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS[appt.status].className}`}>
                  {STATUS[appt.status].label}
                </span>
              </div>
              <DetailRow
                label="Cuándo"
                value={`${new Date(appt.startAt).toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })} · ${fmtTime(appt.startAt)}–${fmtTime(appt.endAt)}`}
              />
              <DetailRow label="Servicio" value={appt.service.name} />
              {appt.recurringId && (
                <DetailRow label="Tipo" value="Turno fijo (se repite todas las semanas)" />
              )}
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-[var(--color-muted-foreground)]">
                  {resourceLabel(canchas)}
                </span>
                <span className="flex items-center gap-1.5 text-right font-medium">
                  <MapPin className="h-3.5 w-3.5 text-[var(--color-primary)]" /> {appt.resource.name}
                </span>
              </div>
              {appt.customer.phone && (
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-[var(--color-muted-foreground)]">Teléfono</span>
                  <span className="flex items-center gap-1.5 text-right font-medium">
                    <Phone className="h-3.5 w-3.5" /> {appt.customer.phone}
                  </span>
                </div>
              )}

              {appt.players && appt.players.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                    <Users className="h-3.5 w-3.5" /> Jugadores
                  </p>
                  <ul className="space-y-1.5 rounded-[var(--radius)] border border-[var(--color-border)] p-2.5">
                    {appt.players.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>{[p.firstName, p.lastName].filter(Boolean).join(' ')}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {p.categoryName ??
                              // Turnos viejos: la condición era socio + abono.
                              (p.isSocio ? (p.hasAbono ? 'socio c/abono' : 'socio') : 'no socio')}
                          </span>
                          {p.price != null && (
                            <span className="font-medium tabular-nums">${p.price.toLocaleString('es-AR')}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {appt.products && appt.products.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                    <Package className="h-3.5 w-3.5" /> Productos reservados
                  </p>
                  <ul className="space-y-1.5 rounded-[var(--radius)] border border-[var(--color-border)] p-2.5">
                    {appt.products.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>
                          {p.qty}× {p.name}
                        </span>
                        {p.price != null && (
                          <span className="font-medium tabular-nums">
                            ${(p.price * p.qty).toLocaleString('es-AR')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {appt.priceAtBooking != null && (
                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">${Number(appt.priceAtBooking).toLocaleString('es-AR')}</span>
                </div>
              )}

              {appt.notes && (
                <div>
                  <p className="text-[var(--color-muted-foreground)]">Notas</p>
                  <p>{appt.notes}</p>
                </div>
              )}

              {canWrite && appt.status !== 'CANCELLED' && (
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
                  {appt.status !== 'COMPLETED' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onComplete(appt.id);
                        onClose();
                      }}
                      disabled={busy}
                    >
                      <Check className="h-4 w-4" /> Atendido
                    </Button>
                  )}
                  {appt.status !== 'NO_SHOW' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onNoShow(appt.id);
                        onClose();
                      }}
                      disabled={busy}
                    >
                      No vino
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                    onClick={() => {
                      onCancel(appt.id);
                      onClose();
                    }}
                    disabled={busy}
                  >
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


/**
 * Cambiar una clase SOLO para el día que se está viendo: moverla de horario o
 * de cancha, o suspenderla. La clase semanal queda intacta.
 */
function ClassDayDialog({
  clase,
  date,
  canWrite,
  onClose,
  onSaved,
}: {
  clase: ClassBlock | null;
  date: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources });
  const bookable = (resources ?? []).filter((r) => r.active && !r.reference);

  // La clase de ese día son uno o más tramos. Con varios, los huecos del medio
  // quedan libres para reservar.
  const [tramos, setTramos] = useState<ClassRange[]>([]);
  const [resourceId, setResourceId] = useState('');
  useEffect(() => {
    if (!clase) return;
    setTramos(clase.baseRanges.map((r) => ({ ...r })));
    setResourceId(clase.baseResourceId ?? '');
  }, [clase]);

  const setTramo = (i: number, patch: Partial<ClassRange>) =>
    setTramos((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const quitarTramo = (i: number) => setTramos((prev) => prev.filter((_, idx) => idx !== i));
  const agregarTramo = () =>
    setTramos((prev) => {
      const ultimo = prev[prev.length - 1];
      // Arranca una hora después del último, para no pisarlo.
      const desde = ultimo ? fmtMin(Math.min(hhmmToMin(ultimo.to) + 60, 23 * 60)) : '18:00';
      return [...prev, { from: desde, to: fmtMin(Math.min(hhmmToMin(desde) + 60, 23 * 60 + 59)) }];
    });

  const tramosOk =
    tramos.length > 0 &&
    tramos.every((t) => t.from && t.to && t.from < t.to) &&
    [...tramos]
      .sort((a, b) => a.from.localeCompare(b.from))
      .every((t, i, arr) => i === 0 || arr[i - 1]!.to <= t.from);

  const save = useMutation({
    mutationFn: (suspender: boolean) =>
      setSlotException(clase!.slotId, {
        date,
        cancelled: suspender,
        ranges: suspender ? null : tramos,
        resourceId: suspender ? null : resourceId || null,
      }),
    onSuccess: (_, suspender) => {
      toast.success(suspender ? 'Ese día no hay clase' : 'Clase movida solo ese día');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const volver = useMutation({
    mutationFn: () => setSlotException(clase!.slotId, { date, cancelled: false }),
    onSuccess: () => {
      toast.success('Vuelve al horario de siempre');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!clase} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {clase && (
          <>
            <DialogHeader>
              <DialogTitle>{clase.label || 'Clase'} · {clase.instructor}</DialogTitle>
              <DialogDescription>
                Los cambios valen solo para el {fmtLongDate(date)}. La clase de todas las semanas
                queda como está.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-2">
                {tramos.map((t, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      {i === 0 && (
                        <Label className="text-[10px] text-[var(--color-muted-foreground)]">
                          Desde
                        </Label>
                      )}
                      <Input
                        type="time"
                        value={t.from}
                        onChange={(e) => setTramo(i, { from: e.target.value })}
                        disabled={!canWrite}
                        className="w-[9.5rem] px-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      {i === 0 && (
                        <Label className="text-[10px] text-[var(--color-muted-foreground)]">
                          Hasta
                        </Label>
                      )}
                      <Input
                        type="time"
                        value={t.to}
                        onChange={(e) => setTramo(i, { to: e.target.value })}
                        disabled={!canWrite}
                        className="w-[9.5rem] px-2"
                      />
                    </div>
                    {canWrite && tramos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarTramo(i)}
                        title="Quitar este tramo"
                        className="mb-1 rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {canWrite && tramos.length < 6 && (
                  <button
                    type="button"
                    onClick={agregarTramo}
                    className="text-xs text-[var(--color-primary)] hover:underline"
                  >
                    + Cortar la clase en otro tramo
                  </button>
                )}
                {tramos.length > 1 && (
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    Los huecos entre tramos quedan libres para reservar.
                  </p>
                )}
                {!tramosOk && (
                  <p className="text-[11px] text-[var(--color-destructive)]">
                    Revisá los horarios: cada tramo tiene que terminar después de empezar y no
                    pisarse con otro.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-[var(--color-muted-foreground)]">Cancha</Label>
                <select
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  disabled={!canWrite}
                  className="h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
                >
                  <option value="">Todas</option>
                  {bookable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {clase.moved && (
                <button
                  type="button"
                  onClick={() => volver.mutate()}
                  disabled={!canWrite || volver.isPending}
                  className="text-xs text-[var(--color-primary)] hover:underline"
                >
                  Volver al horario de siempre
                </button>
              )}
            </div>

            {canWrite && (
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  onClick={() => save.mutate(true)}
                  disabled={save.isPending}
                >
                  No hay clase ese día
                </Button>
                <Button onClick={() => save.mutate(false)} disabled={save.isPending || !tramosOk}>
                  {save.isPending ? 'Guardando…' : 'Guardar solo ese día'}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
