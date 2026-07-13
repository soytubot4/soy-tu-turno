'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listServices } from '@/features/servicios/api';
import { listResources } from '@/features/equipo/api';
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

const selectCls =
  'flex h-9 w-full rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: string;
  onCreated: () => void;
}) {
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: listServices, enabled: open });
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources, enabled: open });

  const [serviceId, setServiceId] = useState('');
  const [resourceId, setResourceId] = useState(''); // '' = cualquiera
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState<{ startAt: string; resourceId: string } | null>(null);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setServiceId('');
      setResourceId('');
      setDate(defaultDate);
      setSlot(null);
      setCustomer(null);
    }
  }, [open, defaultDate]);

  // Al cambiar servicio/recurso/fecha, se invalida el slot elegido.
  useEffect(() => {
    setSlot(null);
  }, [serviceId, resourceId, date]);

  const activeServices = (services ?? []).filter((s) => s.active);
  const activeResources = (resources ?? []).filter((r) => r.active);
  const resourceName = useMemo(() => {
    const map = new Map(activeResources.map((r) => [r.id, r.name]));
    return (id: string) => map.get(id) ?? '';
  }, [activeResources]);

  const { data: slots, isFetching: loadingSlots } = useQuery({
    queryKey: ['availability', serviceId, date, resourceId],
    queryFn: () => getAvailability(serviceId, date, resourceId || undefined),
    enabled: open && !!serviceId && !!date,
  });

  const create = useMutation({
    mutationFn: () =>
      createAppointment({
        customerId: customer!.id,
        resourceId: slot!.resourceId,
        serviceId,
        startAt: slot!.startAt,
      }),
    onSuccess: () => {
      toast.success('Turno agendado');
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = !!serviceId && !!slot && !!customer && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo turno</DialogTitle>
          <DialogDescription>Elegí servicio, horario y cliente.</DialogDescription>
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
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input placeholder="Nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <Input placeholder="Teléfono (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button onClick={() => create.mutate()} disabled={create.isPending || !firstName.trim()}>
            Crear
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
