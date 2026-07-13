'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Clock } from 'lucide-react';
import { listServices, createService, deleteService, updateService, type Service } from '@/features/servicios/api';
import { useMe } from '@/features/me/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ServiciosPage() {
  const qc = useQueryClient();
  const { can } = useMe();
  const canWrite = can('services:write');
  const { data: services, isLoading } = useQuery({ queryKey: ['services'], queryFn: listServices });

  const [name, setName] = useState('');
  const [durationMin, setDurationMin] = useState('30');
  const [price, setPrice] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['services'] });

  const create = useMutation({
    mutationFn: () =>
      createService({
        name: name.trim(),
        durationMin: Number(durationMin),
        price: price.trim() ? Number(price) : null,
        active: true,
        sortOrder: 0,
        resourceIds: [],
      }),
    onSuccess: () => {
      toast.success('Servicio creado');
      setName('');
      setDurationMin('30');
      setPrice('');
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
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Corte de pelo" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Duración (min)</Label>
              <Input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="w-28"
                min={5}
                step={5}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Precio (opcional)</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-32"
                placeholder="—"
              />
            </div>
            <Button
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
            <li key={s.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                  <Clock className="h-3 w-3" /> {s.durationMin} min
                  {s.price != null && <span>· ${Number(s.price).toLocaleString('es-AR')}</span>}
                </p>
              </div>
              <Button
                variant={s.active ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => toggleActive.mutate(s)}
                disabled={toggleActive.isPending || !canWrite}
              >
                {s.active ? 'Activo' : 'Inactivo'}
              </Button>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  onClick={() => remove.mutate(s.id)}
                  disabled={remove.isPending}
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
