'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Clock, X } from 'lucide-react';
import { DAY_LABELS, type InstructorSlotInput } from '@soytuturno/shared';
import {
  listInstructors,
  createInstructor,
  updateInstructor,
  deleteInstructor,
  addInstructorSlot,
  updateInstructorSlot,
  deleteInstructorSlot,
  type Instructor,
} from '@/features/profesores/api';
import { listResources } from '@/features/equipo/api';
import { useMe } from '@/features/me/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const selectClass =
  'h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm';

// Lunes primero, como se lee un horario.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const dayShort = (d: number) => DAY_LABELS[d]?.slice(0, 3) ?? '';

export default function ProfesoresPage() {
  const qc = useQueryClient();
  const { can } = useMe();
  const canWrite = can('resources:write');
  const { data: profes, isLoading } = useQuery({ queryKey: ['instructors'], queryFn: listInstructors });
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources });
  const canchas = (resources ?? []).filter((r) => r.active && !r.reference);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['instructors'] });
    // Los horarios ofrecidos cambian: la clase ocupa la cancha.
    qc.invalidateQueries({ queryKey: ['availability'] });
  };

  const create = useMutation({
    mutationFn: () =>
      createInstructor({ name: name.trim(), phone: phone.trim() || null, active: true, sortOrder: 0 }),
    onSuccess: () => {
      toast.success('Profesor agregado');
      setName('');
      setPhone('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = profes ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Profesores</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Quién da clases y en qué horarios. Mientras dura la clase, esa cancha no se ofrece para
          reservar.
        </p>
      </div>

      {canWrite && (
        <Card>
          <CardContent className="pt-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label>Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Martín Gómez" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Teléfono (opcional)</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full sm:w-40"
                  placeholder="341 234-5678"
                />
              </div>
              <Button
                className="w-full sm:w-auto"
                onClick={() => create.mutate()}
                disabled={create.isPending || !name.trim()}
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
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Todavía no cargaste profesores.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <InstructorCard
              key={p.id}
              instructor={p}
              canchas={canchas}
              canWrite={canWrite}
              onChanged={invalidate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Un profesor con sus clases. */
function InstructorCard({
  instructor: p,
  canchas,
  canWrite,
  onChanged,
}: {
  instructor: Instructor;
  canchas: { id: string; name: string }[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [phone, setPhone] = useState(p.phone ?? '');
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const save = useMutation({
    mutationFn: () => updateInstructor(p.id, { name: name.trim(), phone: phone.trim() || null }),
    onSuccess: () => {
      toast.success('Actualizado');
      setEditing(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteInstructor(p.id),
    onSuccess: () => {
      toast.success('Profesor eliminado');
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSlot = useMutation({
    mutationFn: (slotId: string) => deleteInstructorSlot(slotId),
    onSuccess: () => {
      toast.success('Horario eliminado');
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canchaName = (id: string | null) =>
    id ? (canchas.find((c) => c.id === id)?.name ?? 'cancha eliminada') : 'todas las canchas';

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        {/* Cabecera: datos del profe */}
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <Label className="text-[10px] text-[var(--color-muted-foreground)]">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-[var(--color-muted-foreground)]">Teléfono</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-40" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold">
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                {p.phone || 'sin teléfono'} · {p.slots.length}{' '}
                {p.slots.length === 1 ? 'clase' : 'clases'} por semana
              </p>
            </div>
            {canWrite && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setName(p.name);
                    setPhone(p.phone ?? '');
                    setEditing(true);
                  }}
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  onClick={() => setConfirmDel(true)}
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}

        {confirmDel && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
            <p className="text-sm">
              ¿Eliminar a {p.name}? Sus {p.slots.length} clases dejan de ocupar la cancha.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive)]/90"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                Eliminar
              </Button>
            </div>
          </div>
        )}

        {/* Clases */}
        <div className="space-y-1.5 border-t border-[var(--color-border)] pt-3">
          {p.slots.length === 0 && !adding && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Sin clases cargadas: no ocupa ninguna cancha.
            </p>
          )}
          {[...p.slots]
            .sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek))
            .map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                <span className="w-10 shrink-0 font-medium">{dayShort(s.dayOfWeek)}</span>
                <span className="shrink-0 tabular-nums">
                  {s.startTime}–{s.endTime}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--color-muted-foreground)]">
                  {canchaName(s.resourceId)}
                  {s.label && ` · ${s.label}`}
                  {(s.startsOn || s.endsOn) && (
                    <span className="text-xs">
                      {' '}
                      ({s.startsOn ?? '…'} a {s.endsOn ?? '…'})
                    </span>
                  )}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => removeSlot.mutate(s.id)}
                    className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                    title="Quitar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

          {adding ? (
            <SlotForm
              canchas={canchas}
              onCancel={() => setAdding(false)}
              onSaved={() => {
                setAdding(false);
                onChanged();
              }}
              instructorId={p.id}
            />
          ) : (
            canWrite && (
              <Button variant="outline" size="sm" className="mt-1" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Agregar clase
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Alta de una clase semanal. */
function SlotForm({
  instructorId,
  canchas,
  onCancel,
  onSaved,
}: {
  instructorId: string;
  canchas: { id: string; name: string }[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<InstructorSlotInput>({
    resourceId: canchas[0]?.id ?? null,
    dayOfWeek: 1,
    startTime: '18:00',
    endTime: '20:00',
    label: '',
    startsOn: null,
    endsOn: null,
    active: true,
  });
  const [conFechas, setConFechas] = useState(false);
  const set = (patch: Partial<InstructorSlotInput>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      addInstructorSlot(instructorId, {
        ...form,
        startsOn: conFechas ? form.startsOn : null,
        endsOn: conFechas ? form.endsOn : null,
      }),
    onSuccess: () => {
      toast.success('Clase agregada');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Día</Label>
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
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Desde</Label>
          <Input
            type="time"
            value={form.startTime}
            onChange={(e) => set({ startTime: e.target.value })}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Hasta</Label>
          <Input
            type="time"
            value={form.endTime}
            onChange={(e) => set({ endTime: e.target.value })}
            className="w-28"
          />
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Cancha</Label>
          <select
            className={selectClass}
            value={form.resourceId ?? ''}
            onChange={(e) => set({ resourceId: e.target.value || null })}
          >
            <option value="">Todas</option>
            {canchas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Nombre (opcional)</Label>
          <Input
            value={form.label ?? ''}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="Escuelita, Clase adultos…"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={conFechas}
          onChange={(e) => setConFechas(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
        Solo entre dos fechas (ciclo de clases)
      </label>

      {conFechas && (
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-[var(--color-muted-foreground)]">Desde</Label>
            <Input
              type="date"
              value={form.startsOn ?? ''}
              onChange={(e) => set({ startsOn: e.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-[var(--color-muted-foreground)]">Hasta</Label>
            <Input
              type="date"
              value={form.endsOn ?? ''}
              onChange={(e) => set({ endsOn: e.target.value || null })}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar clase'}
        </Button>
      </div>
    </div>
  );
}
