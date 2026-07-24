'use client';

import { SPORT_LABELS, type Sport } from '@soytuturno/shared';
import { CourtLines } from '@/components/court-lines';

// Paso de la cuadrícula (mismas unidades virtuales que el editor del admin).
const GRID = 25;

const SPORT_COLOR: Record<Sport, string> = {
  padel: '#3b82f6',
  tenis: '#22c55e',
  futbol: '#16a34a',
  futsal: '#f59e0b',
  basquet: '#ef4444',
  otro: '#8b5cf6',
};

export type CourtMapItem = {
  id: string;
  name: string;
  sport: Sport | null;
  color: string | null;
  reference: boolean;
  mapX: number | null;
  mapY: number | null;
  mapW: number | null;
  mapH: number | null;
  mapRotation: number | null;
};

/** Mapa del predio en modo lectura, con la cancha elegida resaltada. */
export function CourtMap({
  courts,
  selectedId,
  onSelect,
}: {
  courts: CourtMapItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const placed = courts.filter((c) => c.mapX != null && c.mapY != null && c.mapW != null && c.mapH != null);
  if (placed.length === 0) return null;

  // Recuadro que encierra a todas las canchas (considerando la rotación), con un
  // margen. Así el mapa se ajusta y centra a las canchas, sin espacio en blanco.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of placed) {
    const cx = c.mapX! + c.mapW! / 2;
    const cy = c.mapY! + c.mapH! / 2;
    const rad = ((c.mapRotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = c.mapW! / 2;
    const hh = c.mapH! / 2;
    const corners: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    for (const [dx, dy] of corners) {
      const px = cx + dx * cos - dy * sin;
      const py = cy + dx * sin + dy * cos;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08 || 20;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const bw = maxX - minX;
  const bh = maxY - minY;

  return (
    <div
      className="relative w-full overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-card)]"
      style={{
        aspectRatio: `${bw} / ${bh}`,
        backgroundImage:
          'linear-gradient(to right, color-mix(in srgb, var(--color-border) 50%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-border) 50%, transparent) 1px, transparent 1px)',
        backgroundSize: `${(GRID / bw) * 100}% ${(GRID / bh) * 100}%`,
      }}
    >
      {placed.map((c) => {
        const isOtro = (c.sport ?? 'otro') === 'otro';
        const color = c.color || SPORT_COLOR[(c.sport ?? 'otro') as Sport] || SPORT_COLOR.otro;
        const isSel = selectedId === c.id;
        // Las referencias (bar, entrada, cancha que no se alquila) se ven pero no se reservan.
        const clickable = !!onSelect && !c.reference;
        return (
          <button
            key={c.id}
            type="button"
            onClick={clickable ? () => onSelect!(c.id) : undefined}
            className={`absolute ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            style={{
              left: `${((c.mapX! - minX) / bw) * 100}%`,
              top: `${((c.mapY! - minY) / bh) * 100}%`,
              width: `${(c.mapW! / bw) * 100}%`,
              height: `${(c.mapH! / bh) * 100}%`,
              transform: `rotate(${c.mapRotation ?? 0}deg)`,
            }}
          >
            <div
              className="relative h-full w-full overflow-hidden rounded-[6px] border-2 transition-all"
              style={{
                borderColor: color,
                background: isSel
                  ? `color-mix(in srgb, ${color} 55%, transparent)`
                  : `color-mix(in srgb, ${color} 18%, transparent)`,
                boxShadow: isSel ? `0 0 0 2px var(--color-background), 0 0 0 4px ${color}` : 'none',
              }}
            >
              {!isOtro && <CourtLines sport={c.sport} />}
            </div>
            {/* Etiqueta: chip horizontal (contra-rota para quedar siempre derecha) y
                legible; no se corta (nombres largos en 2 líneas). */}
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-[6rem] rounded px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight"
              style={{
                transform: `translate(-50%, -50%) rotate(${-(c.mapRotation ?? 0)}deg)`,
                background: 'color-mix(in srgb, var(--color-card) 88%, transparent)',
                color: 'var(--color-foreground)',
              }}
            >
              {c.name}
              {!isOtro && c.sport && (
                <span className="block text-[9px] font-normal opacity-70">{SPORT_LABELS[c.sport]}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
