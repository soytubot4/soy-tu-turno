'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, CalendarOff } from 'lucide-react';
import { DAY_LABELS, SLOT_STEP_OPTIONS, type HourRange } from '@soytuturno/shared';
import { listResources } from '@/features/equipo/api';
import {
  getSchedule,
  setSchedule,
  listBlocks,
  createBlock,
  deleteBlock,
} from '@/features/horarios/api';
import { getTurnoSettings, updateTurnoSettings } from '@/features/horarios/settings-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Orden de visualización: Lunes → Domingo.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function plusDaysYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HorariosPage() {
  const qc = useQueryClient();
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources });
  const [resourceId, setResourceId] = useState<string>('');

  // Elegir el primer recurso activo por defecto.
  useEffect(() => {
    if (!resourceId && resources && resources.length) setResourceId(resources[0]!.id);
  }, [resources, resourceId]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Horarios</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Horario de atención semanal de cada integrante y los días que el local no abre.
        </p>
      </div>

      <SlotStepCard />

      {(resources ?? []).length > 1 && (
        <div className="flex flex-wrap gap-2">
          {resources!.map((r) => (
            <Button
              key={r.id}
              variant={r.id === resourceId ? 'default' : 'outline'}
              size="sm"
              onClick={() => setResourceId(r.id)}
            >
              {r.name}
            </Button>
          ))}
        </div>
      )}

      {resourceId ? (
        <WeeklyEditor key={resourceId} resourceId={resourceId} />
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Primero cargá a alguien en <span className="font-medium">Equipo</span>.
        </p>
      )}

      <BlocksCard qc={qc} />
    </div>
  );
}

function SlotStepCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings });
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (data) setStep(data.slotStepMin);
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateTurnoSettings({ slotStepMin: step! }),
    onSuccess: () => {
      toast.success('Intervalo guardado');
      qc.invalidateQueries({ queryKey: ['turno-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = !!data && step != null && step !== data.slotStepMin;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Intervalo de turnos</CardTitle>
        <CardDescription>
          Cada cuánto puede arrancar un turno. Ej: cada 30 min → 08:00, 08:30, 09:00…
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || step == null ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {SLOT_STEP_OPTIONS.map((opt) => (
              <Button
                key={opt}
                variant={step === opt ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStep(opt)}
              >
                {opt} min
              </Button>
            ))}
            <Button
              className="ml-auto"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyEditor({ resourceId }: { resourceId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['schedule', resourceId],
    queryFn: () => getSchedule(resourceId),
  });

  const [days, setDays] = useState<Record<number, HourRange[]>>({});

  useEffect(() => {
    if (!data) return;
    const map: Record<number, HourRange[]> = {};
    for (const d of DAY_ORDER) map[d] = [];
    for (const d of data) map[d.dayOfWeek] = d.ranges.length ? d.ranges : [];
    setDays(map);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      setSchedule(resourceId, {
        days: DAY_ORDER.map((dayOfWeek) => ({
          dayOfWeek,
          ranges: (days[dayOfWeek] ?? []).filter((r) => r.from && r.to && r.from < r.to),
        })),
      }),
    onSuccess: () => {
      toast.success('Horario guardado');
      qc.invalidateQueries({ queryKey: ['schedule', resourceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function setRange(day: number, idx: number, patch: Partial<HourRange>) {
    setDays((prev) => {
      const arr = [...(prev[day] ?? [])];
      arr[idx] = { ...arr[idx]!, ...patch };
      return { ...prev, [day]: arr };
    });
  }
  function addRange(day: number) {
    setDays((prev) => ({ ...prev, [day]: [...(prev[day] ?? []), { from: '09:00', to: '18:00' }] }));
  }
  function removeRange(day: number, idx: number) {
    setDays((prev) => ({ ...prev, [day]: (prev[day] ?? []).filter((_, i) => i !== idx) }));
  }

  if (isLoading) return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando horario…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario semanal</CardTitle>
        <CardDescription>
          Dejá un día sin franjas para marcarlo cerrado. Podés cargar horario cortado (varias
          franjas por día).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {DAY_ORDER.map((day) => {
          const ranges = days[day] ?? [];
          return (
            <div key={day} className="flex flex-col gap-2 border-b border-[var(--color-border)] pb-3 last:border-0 sm:flex-row sm:items-start">
              <div className="w-24 shrink-0 pt-2 text-sm font-medium">{DAY_LABELS[day]}</div>
              <div className="flex-1 space-y-2">
                {ranges.length === 0 ? (
                  <span className="text-sm text-[var(--color-muted-foreground)]">Cerrado</span>
                ) : (
                  ranges.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={r.from}
                        onChange={(e) => setRange(day, idx, { from: e.target.value })}
                        className="w-32"
                      />
                      <span className="text-[var(--color-muted-foreground)]">a</span>
                      <Input
                        type="time"
                        value={r.to}
                        onChange={(e) => setRange(day, idx, { to: e.target.value })}
                        className="w-32"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                        onClick={() => removeRange(day, idx)}
                        title="Quitar franja"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <Button variant="outline" size="sm" onClick={() => addRange(day)}>
                  <Plus className="h-3 w-3" /> Franja
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar horario'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BlocksCard({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const from = todayYmd();
  const to = plusDaysYmd(90);
  const { data: blocks } = useQuery({ queryKey: ['blocks', from, to], queryFn: () => listBlocks(from, to) });

  const [date, setDate] = useState(todayYmd());
  const [reason, setReason] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['blocks'] });

  const create = useMutation({
    mutationFn: () => createBlock({ date, allDay: true, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success('Día bloqueado');
      setReason('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteBlock(id),
    onSuccess: () => {
      toast.success('Bloqueo quitado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => (blocks ?? []).filter((b) => b.allDay), [blocks]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feriados y días cerrados</CardTitle>
        <CardDescription>Días en los que el local no atiende (vale para todo el equipo).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Motivo (opcional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feriado nacional" />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <CalendarOff className="h-4 w-4" /> Bloquear
          </Button>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No hay días bloqueados próximos.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
            {list.map((b) => (
              <li key={b.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{b.date.slice(0, 10)}</p>
                  {b.reason && (
                    <p className="truncate text-xs text-[var(--color-muted-foreground)]">{b.reason}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  onClick={() => remove.mutate(b.id)}
                  disabled={remove.isPending}
                  title="Quitar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
