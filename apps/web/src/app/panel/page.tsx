'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus, X, Check, Clock } from 'lucide-react';
import type { AppointmentStatusValue } from '@soytuturno/shared';
import {
  listAppointments,
  cancelAppointment,
  updateAppointment,
  type Appointment,
} from '@/features/agenda/api';
import { Button } from '@/components/ui/button';
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

export default function AgendaPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayYmd());
  const [dialogOpen, setDialogOpen] = useState(false);

  const { from, to } = useMemo(() => dayBounds(date), [date]);
  const { data: appts, isLoading } = useQuery({
    queryKey: ['appointments', date],
    queryFn: () => listAppointments(from, to),
  });

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
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo turno
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate(shiftYmd(date, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => setDate(shiftYmd(date, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-sm font-medium capitalize">{fmtLongDate(date)}</div>
        {date !== todayYmd() && (
          <Button variant="ghost" size="sm" onClick={() => setDate(todayYmd())}>
            Hoy
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          No hay turnos para este día.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <AppointmentRow
              key={a.id}
              appt={a}
              onCancel={() => cancel.mutate(a.id)}
              onComplete={() => setStatus.mutate({ id: a.id, status: 'COMPLETED' })}
              onNoShow={() => setStatus.mutate({ id: a.id, status: 'NO_SHOW' })}
              busy={cancel.isPending || setStatus.isPending}
            />
          ))}
        </ul>
      )}

      <NewAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={date}
        onCreated={invalidate}
      />
    </div>
  );
}

function customerName(c: Appointment['customer']): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.phone || 'Cliente';
}

function AppointmentRow({
  appt,
  onCancel,
  onComplete,
  onNoShow,
  busy,
}: {
  appt: Appointment;
  onCancel: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  busy: boolean;
}) {
  const st = STATUS[appt.status];
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div className="flex w-20 shrink-0 flex-col text-sm">
        <span className="font-semibold">{fmtTime(appt.startAt)}</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">{fmtTime(appt.endAt)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{customerName(appt.customer)}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-[var(--color-muted-foreground)]">
          <Clock className="h-3 w-3" /> {appt.service.name} · {appt.resource.name}
        </p>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${st.className}`}>
        {st.label}
      </span>
      {appt.status !== 'COMPLETED' && (
        <Button variant="ghost" size="icon" title="Marcar atendido" onClick={onComplete} disabled={busy}>
          <Check className="h-4 w-4 text-[var(--color-success)]" />
        </Button>
      )}
      {appt.status !== 'NO_SHOW' && (
        <Button variant="ghost" size="sm" title="No se presentó" onClick={onNoShow} disabled={busy}>
          No vino
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        title="Cancelar turno"
        onClick={onCancel}
        disabled={busy}
        className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}
