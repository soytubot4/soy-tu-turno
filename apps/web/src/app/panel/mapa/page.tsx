'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, RotateCw, Save, Undo2, Trash2, Magnet } from 'lucide-react';
import { SPORTS, SPORT_LABELS, SPORT_ASPECT, type Sport } from '@soytuturno/shared';
import {
  listResources,
  createResource,
  deleteResource,
  saveCourtLayout,
  type Resource,
} from '@/features/equipo/api';
import { useMe } from '@/features/me/api';
import { CourtLines } from '@/components/court-lines';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Sistema de coordenadas virtual del canvas (el plano se dibuja a escala).
const VIEW_W = 1000;
const VIEW_H = 700;
const GRID = 25; // paso de la cuadrícula (unidades virtuales)

const selectClass =
  'h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm';

/** Colores por deporte para distinguir las canchas de un vistazo. */
const SPORT_COLOR: Record<Sport, string> = {
  padel: '#3b82f6',
  tenis: '#22c55e',
  futbol: '#16a34a',
  futsal: '#f59e0b',
  basquet: '#ef4444',
  otro: '#8b5cf6',
};

type Court = {
  id: string;
  name: string;
  sport: Sport;
  active: boolean;
  reference: boolean;
  color: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
};

/** Paleta para los espacios "Otra" (bar, entrada, vestuarios…). */
const OTRO_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#64748b'];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const courtColor = (c: Court) => c.color || SPORT_COLOR[c.sport] || SPORT_COLOR.otro;

/** Mapea un recurso (cancha) a su layout, con defaults si nunca se ubicó. */
function toCourt(r: Resource, i: number): Court {
  const sport = (r.sport ?? 'otro') as Sport;
  const aspect = SPORT_ASPECT[sport] ?? SPORT_ASPECT.otro;
  return {
    id: r.id,
    name: r.name,
    sport,
    active: r.active,
    reference: r.reference,
    color: r.color ?? null,
    x: r.mapX ?? 40 + (i % 6) * 40,
    y: r.mapY ?? 40 + Math.floor(i / 6) * 60,
    w: r.mapW ?? aspect.w,
    h: r.mapH ?? aspect.h,
    rot: r.mapRotation ?? 0,
  };
}

export default function MapaPage() {
  const qc = useQueryClient();
  const { can, canchas } = useMe();
  const canWrite = can('resources:write');
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: listResources });

  const [courts, setCourts] = useState<Court[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [newName, setNewName] = useState('');
  const [newSport, setNewSport] = useState<Sport>('padel');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sincroniza con el server haciendo MERGE: conserva las canchas que ya estás
  // editando (posición sin guardar) y suma las nuevas / saca las borradas. Así
  // "Agregar cancha" aparece aunque tengas cambios sin guardar.
  useEffect(() => {
    if (!resources) return;
    setCourts((prev) => {
      const prevById = new Map(prev.map((c) => [c.id, c]));
      return resources.map((r, i) => prevById.get(r.id) ?? toCourt(r, i));
    });
  }, [resources]);

  const patch = (id: string, next: Partial<Court>) => {
    setCourts((cs) => cs.map((c) => (c.id === id ? { ...c, ...next } : c)));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveCourtLayout({
        courts: courts.map((c) => ({
          id: c.id,
          name: c.name.trim() || undefined,
          mapX: c.x,
          mapY: c.y,
          mapW: c.w,
          mapH: c.h,
          mapRotation: c.rot,
          color: c.sport === 'otro' ? c.color : null,
          reference: c.reference,
        })),
      }),
    onSuccess: () => {
      toast.success('Mapa guardado');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['resources'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCourt = useMutation({
    mutationFn: () =>
      createResource({ name: newName.trim() || `Cancha ${courts.length + 1}`, sport: newSport, active: true, sortOrder: 0 }),
    onSuccess: async () => {
      setNewName('');
      await qc.invalidateQueries({ queryKey: ['resources'] });
      toast.success('Cancha agregada al mapa');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCourt = useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['resources'] });
      toast.success('Cancha eliminada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Arrastrar (mover) ─────────────────────────────────────────
  function startDrag(e: React.PointerEvent, court: Court) {
    if (!canWrite) return;
    e.preventDefault();
    setSelected(court.id);
    const rect = containerRef.current!.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: court.x, y: court.y };
    const move = (ev: PointerEvent) => {
      const dxV = ((ev.clientX - startX) / rect.width) * VIEW_W;
      const dyV = ((ev.clientY - startY) / rect.height) * VIEW_H;
      let nx = orig.x + dxV;
      let ny = orig.y + dyV;
      if (snap) {
        // Ajuste a medio cuadro (más fino que el cuadro entero) para alinear mejor.
        const step = GRID / 2;
        nx = Math.round(nx / step) * step;
        ny = Math.round(ny / step) * step;
      }
      // El límite usa el recuadro YA ROTADO (si no, una cancha rotada 90° queda
      // trabada por su alto sin rotar y no se puede subir/mover del todo).
      const rad = (court.rot * Math.PI) / 180;
      const halfBW = Math.abs((court.w / 2) * Math.cos(rad)) + Math.abs((court.h / 2) * Math.sin(rad));
      const halfBH = Math.abs((court.w / 2) * Math.sin(rad)) + Math.abs((court.h / 2) * Math.cos(rad));
      const cx = clamp(nx + court.w / 2, Math.min(halfBW, VIEW_W / 2), Math.max(VIEW_W - halfBW, VIEW_W / 2));
      const cy = clamp(ny + court.h / 2, Math.min(halfBH, VIEW_H / 2), Math.max(VIEW_H - halfBH, VIEW_H / 2));
      patch(court.id, { x: cx - court.w / 2, y: cy - court.h / 2 });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── Rotar (manija arriba de la cancha) ────────────────────────
  function startRotate(e: React.PointerEvent, court: Court) {
    if (!canWrite) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(court.id);
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = rect.left + ((court.x + court.w / 2) / VIEW_W) * rect.width;
    const cy = rect.top + ((court.y + court.h / 2) / VIEW_H) * rect.height;
    const move = (ev: PointerEvent) => {
      let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      if (snap) deg = Math.round(deg / 15) * 15;
      patch(court.id, { rot: Math.round(deg) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const sel = useMemo(() => courts.find((c) => c.id === selected) ?? null, [courts, selected]);

  if (!canchas) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">El mapa está disponible solo para clubes.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mapa del predio</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Acomodá las canchas como están en tu club: arrastralas para moverlas y usá la manija para rotarlas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              variant="outline"
              onClick={() => {
                setCourts((resources ?? []).map(toCourt));
                setDirty(false);
              }}
              disabled={save.isPending}
            >
              <Undo2 className="h-4 w-4" /> Revertir
            </Button>
          )}
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending || !canWrite}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </div>
      </div>

      {/* Barra de herramientas */}
      {canWrite && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 py-4">
            <div className="flex flex-col gap-1.5">
              <Label>Nueva cancha</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={`Cancha ${courts.length + 1}`}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Deporte</Label>
              <select className={selectClass} value={newSport} onChange={(e) => setNewSport(e.target.value as Sport)}>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {SPORT_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" onClick={() => addCourt.mutate()} disabled={addCourt.isPending}>
              <Plus className="h-4 w-4" /> Agregar cancha
            </Button>
            <button
              type="button"
              onClick={() => setSnap((s) => !s)}
              className={`ml-auto flex items-center gap-1.5 rounded-[var(--radius)] border px-3 py-2 text-sm transition-colors ${
                snap
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]'
              }`}
              title="Ajustar a la cuadrícula"
            >
              <Magnet className="h-4 w-4" /> Cuadrícula
            </button>
          </CardContent>
        </Card>
      )}

      {/* Controles de la cancha seleccionada */}
      {sel && canWrite && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 py-3 text-sm">
            <Input value={sel.name} onChange={(e) => patch(sel.id, { name: e.target.value })} className="h-8 w-40" />
            <span className="text-[var(--color-muted-foreground)]">{SPORT_LABELS[sel.sport]}</span>
            {/* Se alquila (aparece en Canchas y se reserva) vs Referencia (solo se ve en el plano). */}
            <div className="flex items-center rounded-[var(--radius)] border border-[var(--color-border)] p-0.5">
              {[
                { ref: false, label: 'Se alquila' },
                { ref: true, label: 'Referencia' },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => patch(sel.id, { reference: opt.ref })}
                  className={`rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-xs font-medium transition-colors ${
                    sel.reference === opt.ref
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {sel.sport === 'otro' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--color-muted-foreground)]">Color</span>
                {OTRO_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => patch(sel.id, { color: col })}
                    className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: col,
                      borderColor: (sel.color || SPORT_COLOR.otro) === col ? 'var(--color-foreground)' : 'transparent',
                    }}
                    title="Color"
                  />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-muted-foreground)]">Rotación</span>
              <Button size="sm" variant="outline" onClick={() => patch(sel.id, { rot: sel.rot - 15 })}>
                −15°
              </Button>
              <span className="w-10 text-center tabular-nums">{((sel.rot % 360) + 360) % 360}°</span>
              <Button size="sm" variant="outline" onClick={() => patch(sel.id, { rot: sel.rot + 15 })}>
                +15°
              </Button>
            </div>
            {sel.sport === 'otro' ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-muted-foreground)]">Ancho</span>
                  <input
                    type="range"
                    min={40}
                    max={520}
                    step={5}
                    value={sel.w}
                    onChange={(e) => patch(sel.id, { w: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-muted-foreground)]">Alto</span>
                  <input
                    type="range"
                    min={40}
                    max={520}
                    step={5}
                    value={sel.h}
                    onChange={(e) => patch(sel.id, { h: Number(e.target.value) })}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-muted-foreground)]">Tamaño</span>
                <input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={sel.w / (SPORT_ASPECT[sel.sport]?.w ?? 140)}
                  onChange={(e) => {
                    const k = Number(e.target.value);
                    const base = SPORT_ASPECT[sel.sport] ?? SPORT_ASPECT.otro;
                    patch(sel.id, { w: Math.round(base.w * k), h: Math.round(base.h * k) });
                  }}
                />
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
              onClick={() => removeCourt.mutate(sel.id)}
              disabled={removeCourt.isPending}
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        onPointerDown={(e) => {
          if (e.target === containerRef.current) setSelected(null);
        }}
        className="relative w-full touch-none overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)] select-none"
        style={{
          aspectRatio: `${VIEW_W} / ${VIEW_H}`,
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--color-border) 60%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-border) 60%, transparent) 1px, transparent 1px)',
          backgroundSize: `${(GRID / VIEW_W) * 100}% ${(GRID / VIEW_H) * 100}%`,
        }}
      >
        {courts.map((c) => {
          const color = courtColor(c);
          const isSel = c.id === selected;
          return (
            <div
              key={c.id}
              onPointerDown={(e) => startDrag(e, c)}
              className="absolute cursor-move"
              style={{
                left: `${(c.x / VIEW_W) * 100}%`,
                top: `${(c.y / VIEW_H) * 100}%`,
                width: `${(c.w / VIEW_W) * 100}%`,
                height: `${(c.h / VIEW_H) * 100}%`,
                transform: `rotate(${c.rot}deg)`,
                opacity: c.reference || c.active ? 1 : 0.45,
              }}
            >
              {/* Cuerpo de la cancha */}
              <div
                className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[6px] border-2 text-center text-[11px] font-semibold text-white"
                style={{
                  borderColor: color,
                  background: `color-mix(in srgb, ${color} 30%, transparent)`,
                  boxShadow: isSel ? `0 0 0 2px var(--color-background), 0 0 0 4px ${color}` : 'none',
                }}
              >
                <CourtLines sport={c.sport} />
                <span
                  className="pointer-events-none relative z-10 max-w-[6rem] rounded px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight"
                  style={{
                    transform: `rotate(${-c.rot}deg)`,
                    background: 'color-mix(in srgb, var(--color-card) 88%, transparent)',
                    color: 'var(--color-foreground)',
                  }}
                >
                  {c.name}
                  {c.sport !== 'otro' && (
                    <span className="block text-[9px] font-normal opacity-70">{SPORT_LABELS[c.sport]}</span>
                  )}
                </span>
              </div>

              {/* Manija de rotación (solo la seleccionada) */}
              {isSel && canWrite && (
                <div
                  onPointerDown={(e) => startRotate(e, c)}
                  className="absolute left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-[var(--color-background)]"
                  style={{ top: -30, borderColor: color }}
                  title="Rotar"
                >
                  <RotateCw className="h-3.5 w-3.5" style={{ color }} />
                </div>
              )}
            </div>
          );
        })}

        {courts.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            Agregá tu primera cancha con el botón de arriba.
          </div>
        )}
      </div>
    </div>
  );
}
