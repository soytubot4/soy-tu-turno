'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Repeat, Clock } from 'lucide-react';
import { DAY_LABELS, type CreateRecurringInput } from '@soytuturno/shared';
import {
  listRecurring,
  createRecurring,
  deleteRecurring,
  type RecurringAppointment,
} from '@/features/fijos/api';
import { listResources } from '@/features/equipo/api';
import { listServices } from '@/features/servicios/api';
import { searchCustomers, type CustomerLite } from '@/features/agenda/api';
import { getTurnoSettings } from '@/features/horarios/settings-api';
import { useMe } from '@/features/me/api';
import { resourceLabel } from '@/lib/labels';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const selectClass =
  'h-9 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm';

// Lunes primero, como se lee un horario.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function fmtDate(ymd: string | null): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-') as [string, string, string];
  return `${d}/${m}/${y.slice(2)}`;
}

export default function FijosPage() {
  const qc = useQueryClient();
  const { can, canchas } = useMe();
  const canWrite = can('appointments:write');
  const { data: settings } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings });
  const { data: fijos, isLoading } = useQuery({ queryKey: ['recurring'], queryFn: listRecurring });
  const [adding, setAdding] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['recurring'] });
    // Los turnos generados cambian la agenda y la disponibilidad.
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['availability'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecurring(id),
    onSuccess: (r) => {
      toast.success(
        r.liberados > 0
          ? `Turno fijo dado de baja · se liberaron ${r.liberados} turnos futuros`
          : 'Turno fijo dado de baja',
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = fijos ?? [];

  if (settings && !settings.recurringEnabled) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Turnos fijos</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Los turnos fijos están apagados. Prendelos en{' '}
            <span className="font-medium">Configuración → Turnos fijos</span>.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Turnos fijos</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Los que tienen {canchas ? 'la cancha' : 'el turno'} reservado todas las semanas a la
            misma hora. Se agendan solos: si una semana no vienen, cancelás ese turno desde la
            agenda y los demás siguen.
          </p>
        </div>
        {canWrite && !adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Nuevo turno fijo
          </Button>
        )}
      </div>

      {adding && (
        <NewFijoForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            invalidate();
          }}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Todavía no cargaste turnos fijos.
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
          {list.map((f) => (
            <FijoRow
              key={f.id}
              fijo={f}
              canWrite={canWrite}
              busy={remove.isPending}
              onRemove={() => remove.mutate(f.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FijoRow({
  fijo: f,
  canWrite,
  busy,
  onRemove,
}: {
  fijo: RecurringAppointment;
  canWrite: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="p-3">
      <div className="flex items-center gap-3">
        <Repeat className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.customerName}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {DAY_LABELS[f.dayOfWeek]} {f.startTime}
            </span>
            <span>· {f.resourceName}</span>
            <span>· {f.serviceName}</span>
            {(f.startsOn || f.endsOn) && (
              <span>
                · {f.startsOn ? `desde ${fmtDate(f.startsOn)}` : ''}
                {f.endsOn ? ` hasta ${fmtDate(f.endsOn)}` : ''}
              </span>
            )}
          </p>
        </div>
        {canWrite && !confirm && (
          <Button
            variant="ghost"
            size="icon"
            className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
            onClick={() => setConfirm(true)}
            title="Dar de baja"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {confirm && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <p className="text-sm">
            ¿Dar de baja el fijo de {f.customerName}? Los turnos que ya pasaron quedan; los futuros
            se liberan.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive)]/90"
              onClick={onRemove}
              disabled={busy}
            >
              Dar de baja
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Alta de un turno fijo. */
function NewFijoForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const { canchas } = useMe();
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources });
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: listServices });
  const bookable = (resources ?? []).filter((r) => r.active && !r.reference);
  const activeServices = (services ?? []).filter((s) => s.active);

  const [q, setQ] = useState('');
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const { data: found } = useQuery({
    queryKey: ['customers', q],
    queryFn: () => searchCustomers(q),
    enabled: q.trim().length >= 2 && !customer,
  });

  const [form, setForm] = useState<Omit<CreateRecurringInput, 'customerId'>>({
    resourceId: '',
    serviceId: '',
    dayOfWeek: 1,
    startTime: '19:00',
    startsOn: null,
    endsOn: null,
    notes: null,
  });
  const [conFin, setConFin] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      createRecurring({
        ...form,
        customerId: customer!.id,
        resourceId: form.resourceId || bookable[0]!.id,
        serviceId: form.serviceId || activeServices[0]!.id,
        endsOn: conFin ? form.endsOn : null,
      }),
    onSuccess: (r) => {
      toast.success(
        r.salteados > 0
          ? `Turno fijo creado · ${r.creados} turnos agendados, ${r.salteados} salteados por estar ocupados`
          : `Turno fijo creado · ${r.creados} turnos agendados`,
      );
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = !!customer && bookable.length > 0 && activeServices.length > 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {/* Cliente */}
        <div className="flex flex-col gap-1.5">
          <Label>Cliente</Label>
          {customer ? (
            <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2 text-sm">
              <span className="flex-1 truncate">
                {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.phone}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre o teléfono"
              />
              {(found ?? []).length > 0 && (
                <ul className="max-h-40 divide-y divide-[var(--color-border)] overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border)]">
                  {(found ?? []).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setCustomer(c)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent)]"
                      >
                        {[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Cliente'}
                        <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                          {c.phone}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Cuándo y dónde */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Día</Label>
            <select
              className={selectClass}
              value={form.dayOfWeek}
              onChange={(e) => set({ dayOfWeek: Number(e.target.value) })}
            >
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Hora</Label>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
              className="w-[9.5rem] px-2"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{resourceLabel(canchas)}</Label>
            <select
              className={selectClass}
              value={form.resourceId || bookable[0]?.id || ''}
              onChange={(e) => set({ resourceId: e.target.value })}
            >
              {bookable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Servicio</Label>
            <select
              className={selectClass}
              value={form.serviceId || activeServices[0]?.id || ''}
              onChange={(e) => set({ serviceId: e.target.value })}
            >
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMin}′)
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={conFin}
            onChange={(e) => setConFin(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Hasta una fecha (si no, sigue hasta que lo des de baja)
        </label>

        {conFin && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-[var(--color-muted-foreground)]">Hasta</Label>
            <Input
              type="date"
              value={form.endsOn ?? ''}
              onChange={(e) => set({ endsOn: e.target.value || null })}
              className="w-44 px-2"
            />
          </div>
        )}

        <p className="text-xs text-[var(--color-muted-foreground)]">
          Se agendan las próximas 12 semanas y se van renovando solas. Si algún horario ya está
          ocupado, esa fecha se saltea y el resto se agenda igual.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!ready || save.isPending}>
            {save.isPending ? 'Agendando…' : 'Crear turno fijo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
