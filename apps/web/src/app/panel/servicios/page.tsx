'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Clock, Pencil } from 'lucide-react';
import { PRICE_UNITS, PRICE_UNIT_LABELS, type PriceUnit } from '@soytuturno/shared';
import { listServices, createService, deleteService, updateService, type Service } from '@/features/servicios/api';
import { useMe } from '@/features/me/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceField } from '@/components/ui/price-input';
import { Label } from '@/components/ui/label';

const selectClass =
  'h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm';

/** "$1.234 por jugador" — precio + unidad (si tiene). */
function priceLabel(price: string | number | null, unit: PriceUnit | null): string {
  if (price == null) return '';
  const p = `$${Number(price).toLocaleString('es-AR')}`;
  return unit ? `${p} ${PRICE_UNIT_LABELS[unit]}` : p;
}

export default function ServiciosPage() {
  const qc = useQueryClient();
  const { can, canchas } = useMe();
  const canWrite = can('services:write');
  const { data: services, isLoading } = useQuery({ queryKey: ['services'], queryFn: listServices });

  const [name, setName] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit | ''>('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['services'] });

  const create = useMutation({
    mutationFn: () =>
      createService({
        name: name.trim(),
        durationMin: Number(durationMin),
        price: price.trim() ? Number(price) : null,
        priceUnit: priceUnit || null,
        active: true,
        sortOrder: 0,
        resourceIds: [],
      }),
    onSuccess: () => {
      toast.success('Servicio creado');
      setName('');
      setDurationMin('');
      setPrice('');
      setPriceUnit('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: (s: Service) => updateService(s.id, { active: !s.active }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => {
      toast.success('Servicio eliminado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = services ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Servicios</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Lo que ofrecés y cuánto dura cada cosa. La duración define los horarios que ve el cliente.
        </p>
      </div>

      {canWrite && (
      <Card>
        <CardContent className="pt-5">
          <div className={`grid gap-3 sm:items-end ${canchas ? 'sm:grid-cols-[1fr_auto_auto_auto_auto]' : 'sm:grid-cols-[1fr_auto_auto_auto]'}`}>
            <div className="flex flex-col gap-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Corte de pelo" />
            </div>
            {/* Duración + Precio (+ Unidad) en una fila también en mobile. */}
            <div className="flex flex-wrap gap-3 sm:contents">
              <div className="flex flex-1 flex-col gap-1.5 sm:flex-none">
                <Label>Duración (min)</Label>
                <Input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  className="w-full sm:w-28"
                  placeholder="30"
                  min={5}
                  step={5}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5 sm:flex-none">
                <Label>Precio (opcional)</Label>
                <PriceField value={price} onChange={setPrice} className="w-full sm:w-32" placeholder="—" />
              </div>
              {canchas && (
                <div className="flex flex-1 flex-col gap-1.5 sm:flex-none">
                  <Label>Unidad</Label>
                  <select
                    className={`${selectClass} w-full sm:w-auto`}
                    value={priceUnit}
                    onChange={(e) => setPriceUnit(e.target.value as PriceUnit | '')}
                  >
                    <option value="">—</option>
                    {PRICE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {PRICE_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() => create.mutate()}
              disabled={create.isPending || !name.trim() || Number(durationMin) < 5}
            >
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no cargaste servicios.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
          {list.map((s) => (
            <ServiceRow
              key={s.id}
              service={s}
              canWrite={canWrite}
              canchas={canchas}
              onToggle={() => toggleActive.mutate(s)}
              onRemove={() => remove.mutate(s.id)}
              toggling={toggleActive.isPending}
              removing={remove.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fila de servicio con modo lectura (activar/borrar) y modo edición inline. */
function ServiceRow({
  service,
  canWrite,
  canchas,
  onToggle,
  onRemove,
  toggling,
  removing,
}: {
  service: Service;
  canWrite: boolean;
  canchas: boolean;
  onToggle: () => void;
  onRemove: () => void;
  toggling: boolean;
  removing: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [durationMin, setDurationMin] = useState(String(service.durationMin));
  const [price, setPrice] = useState(service.price != null ? String(service.price) : '');
  const [priceUnit, setPriceUnit] = useState<PriceUnit | ''>(service.priceUnit ?? '');

  const save = useMutation({
    mutationFn: () =>
      updateService(service.id, {
        name: name.trim(),
        durationMin: Number(durationMin),
        price: price.trim() ? Number(price) : null,
        priceUnit: priceUnit || null,
      }),
    onSuccess: () => {
      toast.success('Servicio actualizado');
      qc.invalidateQueries({ queryKey: ['services'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit() {
    setName(service.name);
    setDurationMin(String(service.durationMin));
    setPrice(service.price != null ? String(service.price) : '');
    setPriceUnit(service.priceUnit ?? '');
    setEditing(true);
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1 sm:min-w-0 sm:flex-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 sm:contents">
          <div className="flex flex-1 flex-col gap-1 sm:flex-none">
            <Label className="text-[10px] text-[var(--color-muted-foreground)]">Duración (min)</Label>
            <Input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className="w-full sm:w-24" min={5} step={5} />
          </div>
          <div className="flex flex-1 flex-col gap-1 sm:flex-none">
            <Label className="text-[10px] text-[var(--color-muted-foreground)]">Precio</Label>
            <PriceField value={price} onChange={setPrice} className="w-full sm:w-28" placeholder="—" />
          </div>
          {canchas && (
            <div className="flex flex-1 flex-col gap-1 sm:flex-none">
              <Label className="text-[10px] text-[var(--color-muted-foreground)]">Unidad</Label>
              <select className={`${selectClass} w-full sm:w-auto`} value={priceUnit} onChange={(e) => setPriceUnit(e.target.value as PriceUnit | '')}>
                <option value="">—</option>
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {PRICE_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 sm:flex-none" size="sm" onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || Number(durationMin) < 5}>
            Guardar
          </Button>
          <Button className="flex-1 sm:flex-none" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
            Cancelar
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{service.name}</p>
        <p className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <Clock className="h-3 w-3" /> {service.durationMin} min
          {service.price != null && <span>· {priceLabel(service.price, service.priceUnit)}</span>}
        </p>
      </div>
      {canWrite && (
        <Button variant="ghost" size="icon" onClick={startEdit} title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant={service.active ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggle}
        disabled={toggling || !canWrite}
      >
        {service.active ? 'Activo' : 'Inactivo'}
      </Button>
      {canWrite && (
        <Button
          variant="ghost"
          size="icon"
          className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
          onClick={onRemove}
          disabled={removing}
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
