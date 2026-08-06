'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { playerPrice, isWeekendDate } from '@soytuturno/shared';
import { listServices } from '@/features/servicios/api';
import { listResources } from '@/features/equipo/api';
import { getTurnoSettings } from '@/features/horarios/settings-api';
import { listPlayerCategories } from '@/features/player-categories/api';
import {
  getAvailability,
  searchCustomers,
  createCustomer,
  createAppointment,
  type CustomerLite,
} from '@/features/agenda/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';

const selectCls =
  'flex h-9 w-full rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
/** Minutos desde medianoche (hora local) de un ISO. */
function minutesOfIso(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
/** 'HH:MM' → minutos desde medianoche. */
function hhmmToMin(hhmm: string): number | null {
  const [h, m] = hhmm.split(':').map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  defaultResourceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: string;
  /** Cancha/profesional precargado (al tocar un slot de esa columna). */
  defaultResourceId?: string | null;
  /** Hora 'HH:MM' precargada (al tocar un slot en la agenda). */
  defaultTime?: string;
  onCreated: () => void;
}) {
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: listServices, enabled: open });
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources, enabled: open });

  const [serviceId, setServiceId] = useState('');
  const [resourceId, setResourceId] = useState(''); // '' = cualquiera
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState<{ startAt: string; resourceId: string } | null>(null);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [players, setPlayers] = useState<
    { firstName: string; lastName: string; categoryId: string | null }[]
  >([
    { firstName: '', lastName: '', categoryId: null },
    { firstName: '', lastName: '', categoryId: null },
  ]);

  const { data: settings } = useQuery({ queryKey: ['turno-settings'], queryFn: getTurnoSettings, enabled: open });
  const { data: cats } = useQuery({
    queryKey: ['player-categories'],
    queryFn: listPlayerCategories,
    enabled: open,
  });
  const askPlayers = !!settings?.askPlayers;
  const isWeekend = !!settings?.priceWeekendEnabled && isWeekendDate(date);
  const categories = (cats ?? []).filter((c) => c.active);
  const hasPricing = categories.some((c) => c.price != null || c.priceWeekend != null);
  // El servicio puede pedir los datos de las personas con una cantidad fija
  // (ej: singles = 2, dobles = 4). Si no, cae al modo del comercio (mínimo 2).
  const service = (services ?? []).find((s) => s.id === serviceId);
  const serviceAskPeople = !!service?.askPeople;
  const showPlayers = serviceAskPeople || askPlayers;
  const requiredPlayers = serviceAskPeople ? (service?.peopleCount ?? 2) : 2;
  const fixedPlayers = serviceAskPeople && service?.peopleCount != null;
  const validPlayers = players.filter((p) => p.firstName.trim()).length;
  const playersTotal = players
    .filter((p) => p.firstName.trim())
    .reduce((sum, p) => sum + (playerPrice(p.categoryId, categories, isWeekend) ?? 0), 0);
  const setPlayer = (i: number, patch: Partial<(typeof players)[number]>) =>
    setPlayers((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setServiceId('');
      // Si vino de tocar una columna de la agenda, ya sabemos la cancha.
      setResourceId(defaultResourceId ?? '');
      setDate(defaultDate);
      setSlot(null);
      setCustomer(null);
      setPlayers([
        { firstName: '', lastName: '', categoryId: null },
        { firstName: '', lastName: '', categoryId: null },
      ]);
    }
  }, [open, defaultDate, defaultResourceId]);

  // Al cambiar servicio/recurso/fecha, se invalida el slot elegido.
  useEffect(() => {
    setSlot(null);
  }, [serviceId, resourceId, date]);

  // Si el servicio pide una cantidad fija, dejamos exactamente esa cantidad de filas.
  useEffect(() => {
    if (!fixedPlayers) return;
    setPlayers((ps) => {
      if (ps.length === requiredPlayers) return ps;
      const next = ps.slice(0, requiredPlayers);
      while (next.length < requiredPlayers) {
        next.push({ firstName: '', lastName: '', categoryId: null });
      }
      return next;
    });
  }, [fixedPlayers, requiredPlayers]);

  const activeServices = (services ?? []).filter((s) => s.active);
  const activeResources = (resources ?? []).filter((r) => r.active);

  // Si hay una sola opción, la elegimos sola (una vez, al abrir): no tiene sentido
  // que el usuario seleccione a mano lo único que hay. Un ref evita re-forzarlo
  // después (ej: que el "Cualquiera" del profesional no se pueda volver a poner).
  const autoPicked = useRef(false);
  useEffect(() => {
    if (open) autoPicked.current = false;
  }, [open]);
  useEffect(() => {
    if (!open || autoPicked.current || !services || !resources) return;
    const s0 = activeServices[0];
    const r0 = activeResources[0];
    if (activeServices.length === 1 && s0) setServiceId(s0.id);
    if (!defaultResourceId && activeResources.length === 1 && r0) setResourceId(r0.id);
    autoPicked.current = true;
  }, [open, services, resources, activeServices, activeResources, defaultResourceId]);
  const resourceName = useMemo(() => {
    const map = new Map(activeResources.map((r) => [r.id, r.name]));
    return (id: string) => map.get(id) ?? '';
  }, [activeResources]);

  const { data: slots, isFetching: loadingSlots } = useQuery({
    queryKey: ['availability', serviceId, date, resourceId],
    queryFn: () => getAvailability(serviceId, date, resourceId || undefined),
    enabled: open && !!serviceId && !!date,
  });

  // Si se abrió tocando un slot de la agenda (defaultTime), auto-elegimos el
  // horario que coincide una vez que cargan los disponibles del servicio.
  useEffect(() => {
    if (!open || !defaultTime || slot) return;
    const target = hhmmToMin(defaultTime);
    if (target == null) return;
    const match = (slots ?? []).find(
      (s) => minutesOfIso(s.startAt) === target && (!resourceId || s.resourceId === resourceId),
    );
    if (match) setSlot({ startAt: match.startAt, resourceId: match.resourceId });
  }, [open, defaultTime, slots, slot, resourceId]);

  const create = useMutation({
    mutationFn: () =>
      createAppointment({
        customerId: customer!.id,
        resourceId: slot!.resourceId,
        serviceId,
        startAt: slot!.startAt,
        players: showPlayers
          ? players
              .filter((p) => p.firstName.trim())
              .map((p) => ({
                firstName: p.firstName.trim(),
                lastName: p.lastName.trim(),
                categoryId: p.categoryId,
              }))
          : undefined,
      }),
    onSuccess: () => {
      toast.success('Turno agendado');
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    !!serviceId &&
    !!slot &&
    !!customer &&
    !create.isPending &&
    (!showPlayers || validPlayers >= requiredPlayers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo turno</DialogTitle>
          <DialogDescription>
            {defaultTime
              ? `Elegí servicio y cliente para las ${defaultTime}.`
              : 'Elegí servicio, horario y cliente.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Servicio</Label>
              <select className={selectCls} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Elegí…</option>
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMin}′)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Con</Label>
              <select className={selectCls} value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                <option value="">Cualquiera</option>
                {activeResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Día</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>

          {serviceId && (
            <div className="space-y-2">
              <Label>Horario disponible</Label>
              {loadingSlots ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">Buscando horarios…</p>
              ) : (slots ?? []).length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  No hay horarios libres ese día. Probá otra fecha o revisá el horario del equipo.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(slots ?? []).map((s) => {
                    const active = slot?.startAt === s.startAt && slot?.resourceId === s.resourceId;
                    return (
                      <Button
                        key={`${s.startAt}-${s.resourceId}`}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSlot({ startAt: s.startAt, resourceId: s.resourceId })}
                      >
                        {fmtTime(s.startAt)}
                        {!resourceId && (
                          <span className="text-xs opacity-70">· {resourceName(s.resourceId)}</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <CustomerPicker value={customer} onChange={setCustomer} />

          {showPlayers && (
            <div className="space-y-2">
              <Label>{fixedPlayers ? `Jugadores (${requiredPlayers})` : 'Jugadores (mínimo 2)'}</Label>
              {players.map((p, i) => (
                <div key={i} className="space-y-2 rounded-[var(--radius)] border border-[var(--color-border)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-xs text-[var(--color-muted-foreground)]">{i + 1}.</span>
                    <Input
                      value={p.firstName}
                      onChange={(e) => setPlayer(i, { firstName: e.target.value })}
                      placeholder="Nombre"
                      className="flex-1"
                    />
                    {/* Apellido + socio/abono son del modo club; si el servicio solo pide
                        las personas, alcanza con el nombre. */}
                    {askPlayers && (
                      <Input
                        value={p.lastName}
                        onChange={(e) => setPlayer(i, { lastName: e.target.value })}
                        placeholder="Apellido"
                        className="flex-1"
                      />
                    )}
                    {!fixedPlayers && players.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPlayers((ps) => ps.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                        title="Quitar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {askPlayers && categories.length > 0 && (
                  <div className="ml-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <select
                      className={`${selectCls} flex-1`}
                      value={p.categoryId ?? ''}
                      onChange={(e) => setPlayer(i, { categoryId: e.target.value || null })}
                    >
                      <option value="">¿Qué es?</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {hasPricing && p.firstName.trim() && (
                      <span className="text-sm font-medium">
                        {(() => {
                          const pr = playerPrice(p.categoryId, categories, isWeekend);
                          return pr != null ? `$${pr.toLocaleString('es-AR')}` : '—';
                        })()}
                      </span>
                    )}
                  </div>
                  )}
                </div>
              ))}
              {!fixedPlayers && players.length < 12 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setPlayers((ps) => [...ps, { firstName: '', lastName: '', categoryId: null }])}
                >
                  <Plus className="h-4 w-4" /> Agregar jugador
                </Button>
              )}
              {hasPricing && validPlayers > 0 && (
                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-sm font-semibold">
                  <span>Total a pagar</span>
                  <span>${playersTotal.toLocaleString('es-AR')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit}>
            {create.isPending ? 'Agendando…' : 'Agendar turno'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function customerLabel(c: CustomerLite): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.phone || 'Cliente';
}

function CustomerPicker({
  value,
  onChange,
}: {
  value: CustomerLite | null;
  onChange: (c: CustomerLite | null) => void;
}) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');

  const { data: results } = useQuery({
    queryKey: ['customers', q],
    queryFn: () => searchCustomers(q),
    enabled: q.trim().length >= 2,
  });

  const create = useMutation({
    mutationFn: () => createCustomer({ firstName: firstName.trim(), phone: phone.trim() || undefined }),
    onSuccess: (c) => {
      onChange(c);
      setCreating(false);
      setFirstName('');
      setPhone('');
      toast.success('Cliente creado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (value) {
    return (
      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <div className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] p-2.5">
          <span className="text-sm font-medium">{customerLabel(value)}</span>
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Cliente</Label>
        <Button variant="ghost" size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Buscar existente' : 'Cliente nuevo'}
        </Button>
      </div>

      {creating ? (
        <div className="grid gap-2">
          <Input placeholder="Nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <PhoneInput onChange={setPhone} placeholder="Teléfono" />
          <Button onClick={() => create.mutate()} disabled={create.isPending || !firstName.trim()}>
            Crear cliente
          </Button>
        </div>
      ) : (
        <>
          <Input placeholder="Buscar por nombre o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim().length >= 2 && (
            <ul className="max-h-40 overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border)]">
              {(results ?? []).length === 0 ? (
                <li className="p-2.5 text-sm text-[var(--color-muted-foreground)]">Sin resultados.</li>
              ) : (
                (results ?? []).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onChange(c)}
                      className="flex w-full items-center justify-between px-2.5 py-2 text-left text-sm hover:bg-[var(--color-accent)]"
                    >
                      <span>{customerLabel(c)}</span>
                      {c.phone && <span className="text-xs text-[var(--color-muted-foreground)]">{c.phone}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
