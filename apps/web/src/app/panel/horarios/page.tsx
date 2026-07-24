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
import { useMe } from '@/features/me/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceField } from '@/components/ui/price-input';
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
  const { can, canchas } = useMe();
  const canSchedule = can('schedule:write');
  const canSettings = can('settings:write');
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources });
  const [resourceId, setResourceId] = useState<string>('');

  // Elegir el primer recurso activo por defecto.
  useEffect(() => {
    if (!resourceId && resources && resources.length) setResourceId(resources[0]!.id);
  }, [resources, resourceId]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Configuración</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {canchas
            ? 'Turnos, datos y precios por jugador, horario de atención de cada cancha y los días que el club no abre.'
            : 'Intervalo de turnos, horario de atención de cada integrante y los días que el local no abre.'}
        </p>
      </div>

      {!canSchedule && !canSettings && (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted-foreground)]">
          Con tu rol podés ver los horarios pero no editarlos.
        </p>
      )}

      {canSettings && <SlotStepCard />}

      {canSettings && <ProductsToggleCard />}

      {canSettings && canchas && <PlayersToggleCard />}

      {canSettings && canchas && <PlayerPricingCard />}

      {canSchedule && (resources ?? []).length > 1 && (
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

      {canSchedule &&
        (resourceId ? (
          <WeeklyEditor
            key={resourceId}
            resourceId={resourceId}
            courts={canchas ? (resources ?? []).map((r) => ({ id: r.id, name: r.name })) : []}
          />
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Primero cargá a alguien en <span className="font-medium">Equipo</span>.
          </p>
        ))}

      {canSchedule && <BlocksCard qc={qc} />}
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

/** Prende/apaga la sección Productos + la reserva de productos en el portal. */
function ProductsToggleCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings });
  const save = useMutation({
    mutationFn: (v: boolean) => updateTurnoSettings({ productsEnabled: v }),
    onSuccess: () => {
      toast.success('Guardado');
      qc.invalidateQueries({ queryKey: ['turno-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const on = data?.productsEnabled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Productos</CardTitle>
        <CardDescription>
          Si lo prendés, aparece la sección <span className="font-medium">Productos</span> para cargar lo que
          ofrecés, y el cliente puede reservarlos junto con el turno (se le separan del stock).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
        ) : (
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => save.mutate(e.target.checked)}
              disabled={save.isPending}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm">Ofrecer productos para reservar con el turno</span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}

/** Prende/apaga que el cliente cargue los datos de los jugadores al reservar. */
function PlayersToggleCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings });
  const save = useMutation({
    mutationFn: (v: boolean) => updateTurnoSettings({ askPlayers: v }),
    onSuccess: () => {
      toast.success('Guardado');
      qc.invalidateQueries({ queryKey: ['turno-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const on = data?.askPlayers ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de los jugadores</CardTitle>
        <CardDescription>
          Si lo prendés, al reservar el cliente carga los jugadores/acompañantes (nombre, apellido y si
          son socios). Se piden mínimo 2.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
        ) : (
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => save.mutate(e.target.checked)}
              disabled={save.isPending}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm">Pedir datos de los jugadores al reservar</span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}

/** Precios por jugador según su condición (socio + abono), con opción de precio de finde. */
function PlayerPricingCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings });
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  const [wknd, setWknd] = useState(false);
  const [aw, setAw] = useState('');
  const [bw, setBw] = useState('');
  const [cw, setCw] = useState('');

  const asStr = (n: number | null) => (n != null ? String(n) : '');
  useEffect(() => {
    if (data) {
      setA(asStr(data.priceSocioAbono));
      setB(asStr(data.priceSocioSinAbono));
      setC(asStr(data.priceNoSocio));
      setWknd(data.priceWeekendEnabled);
      setAw(asStr(data.priceSocioAbonoWknd));
      setBw(asStr(data.priceSocioSinAbonoWknd));
      setCw(asStr(data.priceNoSocioWknd));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      updateTurnoSettings({
        priceSocioAbono: a.trim() ? Number(a) : null,
        priceSocioSinAbono: b.trim() ? Number(b) : null,
        priceNoSocio: c.trim() ? Number(c) : null,
        priceWeekendEnabled: wknd,
        priceSocioAbonoWknd: aw.trim() ? Number(aw) : null,
        priceSocioSinAbonoWknd: bw.trim() ? Number(bw) : null,
        priceNoSocioWknd: cw.trim() ? Number(cw) : null,
      }),
    onSuccess: () => {
      toast.success('Precios guardados');
      qc.invalidateQueries({ queryKey: ['turno-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.askPlayers) return null;

  const norm = (s: string) => (s.trim() ? String(Number(s)) : '');
  const dirty =
    norm(a) !== asStr(data.priceSocioAbono) ||
    norm(b) !== asStr(data.priceSocioSinAbono) ||
    norm(c) !== asStr(data.priceNoSocio) ||
    wknd !== data.priceWeekendEnabled ||
    norm(aw) !== asStr(data.priceSocioAbonoWknd) ||
    norm(bw) !== asStr(data.priceSocioSinAbonoWknd) ||
    norm(cw) !== asStr(data.priceNoSocioWknd);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Precios por jugador</CardTitle>
        <CardDescription>
          Cuánto paga cada jugador según su condición. Se calcula solo en la reserva y se le muestra al
          cliente. Dejá vacío el que no uses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={wknd}
            onChange={(e) => setWknd(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          El precio cambia los fines de semana (sábado y domingo)
        </label>
        {wknd && (
          <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
            <div className="flex-1" />
            <div className="w-32 text-center">Entre semana</div>
            <div className="w-32 text-center">Fin de semana</div>
          </div>
        )}
        <PriceRow label="Socio con abono de tenis" value={a} onChange={setA} value2={wknd ? aw : undefined} onChange2={setAw} />
        <PriceRow label="Socio sin abono de tenis" value={b} onChange={setB} value2={wknd ? bw : undefined} onChange2={setBw} />
        <PriceRow label="No socio" value={c} onChange={setC} value2={wknd ? cw : undefined} onChange2={setCw} />
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PriceCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-32">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">
        $
      </span>
      <PriceField value={value} onChange={onChange} className="pl-7" placeholder="—" />
    </div>
  );
}

function PriceRow({
  label,
  value,
  onChange,
  value2,
  onChange2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  value2?: string;
  onChange2?: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="flex-1 text-sm font-normal">{label}</Label>
      <PriceCell value={value} onChange={onChange} />
      {value2 !== undefined && onChange2 && <PriceCell value={value2} onChange={onChange2} />}
    </div>
  );
}

function WeeklyEditor({ resourceId, courts }: { resourceId: string; courts: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['schedule', resourceId],
    queryFn: () => getSchedule(resourceId),
  });

  const [days, setDays] = useState<Record<number, HourRange[]>>({});
  // Canchas seleccionadas para aplicar este mismo horario (default: todas).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set(courts.map((c) => c.id))), [courts]);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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

  // Aplica el horario que se ve en pantalla a varias canchas de una.
  const applyMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const payload = {
        days: DAY_ORDER.map((dayOfWeek) => ({
          dayOfWeek,
          ranges: (days[dayOfWeek] ?? []).filter((r) => r.from && r.to && r.from < r.to),
        })),
      };
      for (const id of ids) await setSchedule(id, payload);
      return ids;
    },
    onSuccess: (ids) => {
      toast.success(`Horario aplicado a ${ids.length} cancha${ids.length === 1 ? '' : 's'}`);
      ids.forEach((id) => qc.invalidateQueries({ queryKey: ['schedule', id] }));
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
        {courts.length > 1 && (
          <div className="space-y-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-accent)]/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Aplicar este horario a varias canchas</p>
              <button
                type="button"
                className="text-xs text-[var(--color-primary)] hover:underline"
                onClick={() => setSelected(new Set(selected.size === courts.length ? [] : courts.map((c) => c.id)))}
              >
                {selected.size === courts.length ? 'Ninguna' : 'Todas'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {courts.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Guarda el horario de arriba en las canchas tildadas (incluida esta).
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={applyMany.isPending || selected.size === 0}
                onClick={() => applyMany.mutate([...selected])}
              >
                {applyMany.isPending ? 'Aplicando…' : `Aplicar a ${selected.size}`}
              </Button>
            </div>
          </div>
        )}

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
