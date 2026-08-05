'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus, X, Check, Users, Phone, MapPin, Package } from 'lucide-react';
import type { AppointmentStatusValue } from '@soytuturno/shared';
import {
  listAppointments,
  cancelAppointment,
  updateAppointment,
  type Appointment,
} from '@/features/agenda/api';
import { getTurnoSettings } from '@/features/horarios/settings-api';
import { useMe } from '@/features/me/api';
import { resourceLabel } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
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

  const openNew = (time: string | null) => {
    setNewTime(time);
    setDialogOpen(true);
  };

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
  const { data: settings } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings });
  const slotStepMin = settings?.slotStepMin ?? 15;

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
    <div className="mx-auto max-w-3xl space-y-6">
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
            slotStepMin={slotStepMin}
            nowMs={nowMs}
            canWrite={canWrite}
            onOpen={setDetail}
            onSlotClick={(m) => openNew(fmtMin(m))}
          />
        </div>
      )}

      <NewAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={date}
        defaultTime={newTime ?? undefined}
        onCreated={invalidate}
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
  slotStepMin,
  nowMs,
  canWrite,
  onOpen,
  onSlotClick,
}: {
  date: string;
  appts: Appointment[];
  slotStepMin: number;
  nowMs: number;
  canWrite: boolean;
  onOpen: (a: Appointment) => void;
  onSlotClick: (minutes: number) => void;
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
      className="overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] [scrollbar-gutter:stable]"
      style={{ maxHeight: 'calc(100vh - 230px)' }}
    >
      {/* py-3: aire arriba/abajo para que la primera y última etiqueta no se corten */}
      <div className="flex py-3">
        {/* Columna de horas (incluye la hora de cierre al final) */}
        <div className="w-14 shrink-0 border-r border-[var(--color-border)]">
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

        {/* Área de turnos */}
        <div className="relative flex-1" style={{ height: gridH }}>
          {/* Celdas del intervalo: cada una es una "fila" clickeable para agregar
              un turno a esa hora. El hover la resalta y muestra el "+ turno". */}
          {cells.map((m, i) => (
            <button
              key={m}
              type="button"
              disabled={!canWrite}
              onClick={() => onSlotClick(m)}
              style={{ top: i * CELL_PX, height: CELL_PX }}
              className={`group absolute inset-x-0 flex items-center gap-1.5 border-t px-2 text-left transition-colors ${
                m % 60 === 0 ? 'border-[var(--color-border)]' : 'border-[var(--color-border)]/40'
              } ${canWrite ? 'cursor-pointer hover:bg-[var(--color-accent)]/50' : 'cursor-default'}`}
            >
              {canWrite && (
                <span className="pointer-events-none flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
                  <Plus className="h-3.5 w-3.5" /> Agregar turno a las {fmtMin(m)}
                </span>
              )}
            </button>
          ))}

          {/* Línea de cierre (borde inferior de la grilla) */}
          <div className="absolute inset-x-0 border-t border-[var(--color-border)]" style={{ top: gridH }} />

          {/* Línea de "ahora" */}
          {isToday && nowMin >= winStart && nowMin <= winEnd && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
              style={{ top: (nowMin - winStart) * pxPerMin }}
            >
              <div className="-ml-1 h-2 w-2 rounded-full bg-[var(--color-destructive)]" />
              <div className="h-px flex-1 bg-[var(--color-destructive)]" />
            </div>
          )}

          {/* Bloques de turnos (los bloques van encima de las celdas clickeables) */}
          {placed.map(({ a, s, e, col, cols }) => (
            <AppointmentBlock
              key={a.id}
              appt={a}
              top={(s - winStart) * pxPerMin}
              height={Math.max(20, (e - s) * pxPerMin)}
              leftPct={(col / cols) * 100}
              widthPct={(1 / cols) * 100}
              onOpen={() => onOpen(a)}
            />
          ))}

        </div>
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
      <span className="truncate text-xs font-semibold">
        {fmtTime(appt.startAt)} · {customerName(appt.customer)}
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
