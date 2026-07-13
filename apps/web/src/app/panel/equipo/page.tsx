'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  listResources,
  createResource,
  updateResource,
  deleteResource,
  type Resource,
} from '@/features/equipo/api';
import { useMe } from '@/features/me/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function EquipoPage() {
  const qc = useQueryClient();
  const { can } = useMe();
  const canWrite = can('resources:write');
  const { data: resources, isLoading } = useQuery({ queryKey: ['resources'], queryFn: listResources });

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['resources'] });

  const create = useMutation({
    mutationFn: () =>
      createResource({ name: name.trim(), title: title.trim() || undefined, active: true, sortOrder: 0 }),
    onSuccess: () => {
      toast.success('Agregado al equipo');
      setName('');
      setTitle('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: (r: Resource) => updateResource(r.id, { active: !r.active }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: () => {
      toast.success('Eliminado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = resources ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Equipo</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Quién atiende: profesionales, boxes o sillas. Cada uno tiene su agenda y horario.
        </p>
      </div>

      {canWrite && (
      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Título (opcional)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Barbero" />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no cargaste a nadie.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold">
                {r.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                {r.title && (
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">{r.title}</p>
                )}
              </div>
              <Button
                variant={r.active ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => toggleActive.mutate(r)}
                disabled={toggleActive.isPending || !canWrite}
              >
                {r.active ? 'Activo' : 'Inactivo'}
              </Button>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  onClick={() => remove.mutate(r.id)}
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
