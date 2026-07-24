'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { SPORTS, SPORT_LABELS, type Sport } from '@soytuturno/shared';
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

const selectClass =
  'h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm';

/** Deportes reales (sin "Otra", que es referencia del mapa). */
const REAL_SPORTS = SPORTS.filter((s) => s !== 'otro');

export default function EquipoPage() {
  const qc = useQueryClient();
  const { can, canchas } = useMe();
  const canWrite = can('resources:write');
  // Activar/desactivar una cancha alcanza con 'resources:toggle' (o write).
  const canToggle = canWrite || can('resources:toggle');
  const { data: resources, isLoading } = useQuery({ queryKey: ['resources'], queryFn: listResources });

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [sport, setSport] = useState<Sport>('padel');
  const [surface, setSurface] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['resources'] });

  const create = useMutation({
    mutationFn: () =>
      createResource(
        canchas
          ? { name: name.trim(), sport, surface: surface.trim() || undefined, active: true, sortOrder: 0 }
          : {
              name: name.trim(),
              title: title.trim() || undefined,
              phone: phone.trim() || undefined,
              active: true,
              sortOrder: 0,
            },
      ),
    onSuccess: () => {
      toast.success(canchas ? 'Cancha agregada' : 'Agregado al equipo');
      setName('');
      setTitle('');
      setPhone('');
      setSurface('');
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

  // En modo canchas, la lista muestra solo las de alquiler. Las referencias del
  // mapa (bar, entrada, etc.) se ven y configuran desde “Mapa”, no acá.
  const list = (resources ?? []).filter((r) => !canchas || !r.reference);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{canchas ? 'Canchas' : 'Equipo'}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {canchas
            ? 'Tus canchas de alquiler: deporte, superficie y horario. Ubicalas en el plano y sumá referencias (bar, entrada) desde “Mapa”.'
            : 'Quién atiende: profesionales, boxes o sillas. Cada uno tiene su agenda y horario.'}
        </p>
      </div>

      {canWrite && (
        <Card>
          <CardContent className="pt-5">
            {canchas ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label>Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cancha 1" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Deporte</Label>
                  <select className={selectClass} value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
                    {REAL_SPORTS.map((s) => (
                      <option key={s} value={s}>
                        {SPORT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Superficie (opcional)</Label>
                  <Input value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="Polvo de ladrillo" />
                </div>
                <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label>Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Título (opcional)</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Barbero" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Teléfono (opcional)</Label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="11 2345-6789"
                  />
                </div>
                <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {canchas ? 'Todavía no cargaste ninguna cancha.' : 'Todavía no cargaste a nadie.'}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
          {list.map((r) =>
            canchas ? (
              <li key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold">
                  {r.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {canWrite ? (
                    <input
                      key={`name-${r.id}-${r.name}`}
                      defaultValue={r.name}
                      title="Nombre de la cancha"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== r.name) updateResource(r.id, { name: v }).then(invalidate);
                      }}
                      className="w-full truncate rounded bg-transparent text-sm font-medium outline-none focus:bg-[var(--color-accent)] focus:px-1.5 focus:py-0.5"
                    />
                  ) : (
                    <p className="truncate text-sm font-medium">{r.name}</p>
                  )}
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                    {r.sport ? SPORT_LABELS[r.sport] : 'Sin deporte'}
                  </p>
                </div>
                {canWrite && (
                  <Input
                    key={`surf-${r.id}-${r.surface ?? ''}`}
                    defaultValue={r.surface ?? ''}
                    placeholder="Superficie"
                    title="Superficie de la cancha"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (r.surface ?? '')) updateResource(r.id, { surface: v || null }).then(invalidate);
                    }}
                    className="hidden h-9 w-36 shrink-0 sm:block"
                  />
                )}
                {canWrite && (
                  <select
                    className={`${selectClass} w-28 shrink-0`}
                    value={r.sport ?? 'padel'}
                    onChange={(e) => updateResource(r.id, { sport: e.target.value as Sport }).then(invalidate)}
                    title="Deporte"
                  >
                    {REAL_SPORTS.map((s) => (
                      <option key={s} value={s}>
                        {SPORT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex w-24 shrink-0 justify-center">
                  <Button
                    variant={r.active ? 'secondary' : 'outline'}
                    size="sm"
                    className="w-full"
                    onClick={() => toggleActive.mutate(r)}
                    disabled={toggleActive.isPending || !canToggle}
                    title="Inhabilitá la cancha si está en mantenimiento o fuera de uso"
                  >
                    {r.active ? 'Activo' : 'Inactivo'}
                  </Button>
                </div>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                    onClick={() => remove.mutate(r.id)}
                    disabled={remove.isPending}
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ) : (
              <ProfessionalRow
                key={r.id}
                r={r}
                canWrite={canWrite}
                canToggle={canToggle}
                onToggle={() => toggleActive.mutate(r)}
                onRemove={() => remove.mutate(r.id)}
                busy={toggleActive.isPending || remove.isPending}
                onSaved={invalidate}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/** Fila de un profesional (modo equipo): vista + edición inline (nombre, título, teléfono). */
function ProfessionalRow({
  r,
  canWrite,
  canToggle,
  onToggle,
  onRemove,
  busy,
  onSaved,
}: {
  r: Resource;
  canWrite: boolean;
  canToggle: boolean;
  onToggle: () => void;
  onRemove: () => void;
  busy: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.name);
  const [title, setTitle] = useState(r.title ?? '');
  const [phone, setPhone] = useState(r.phone ?? '');

  const save = useMutation({
    mutationFn: () =>
      updateResource(r.id, {
        name: name.trim(),
        title: title.trim(),
        phone: phone.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Actualizado');
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit() {
    setName(r.name);
    setTitle(r.title ?? '');
    setPhone(r.phone ?? '');
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
            <Label className="text-[10px] text-[var(--color-muted-foreground)]">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full sm:w-32" placeholder="Barbero" />
          </div>
          <div className="flex flex-1 flex-col gap-1 sm:flex-none">
            <Label className="text-[10px] text-[var(--color-muted-foreground)]">Teléfono</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full sm:w-36" placeholder="11 2345-6789" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 sm:flex-none" size="sm" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold">
        {r.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.name}</p>
        {(r.title || r.phone) && (
          <p className="truncate text-xs text-[var(--color-muted-foreground)]">
            {[r.title, r.phone].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {canWrite && (
        <Button variant="ghost" size="icon" className="shrink-0" onClick={startEdit} title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant={r.active ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggle}
        disabled={busy || !canToggle}
      >
        {r.active ? 'Activo' : 'Inactivo'}
      </Button>
      {canWrite && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
          onClick={onRemove}
          disabled={busy}
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
