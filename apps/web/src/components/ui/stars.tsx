import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Muestra 1–5 estrellas + el promedio y (opcional) la cantidad de reseñas. */
export function Stars({
  value,
  count,
  size = 'sm',
  className,
}: {
  value: number | null;
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const rounded = value ? Math.round(value) : 0;
  const star = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(star, i < rounded ? 'fill-amber-400 text-amber-400' : 'text-[var(--color-border)]')}
          />
        ))}
      </span>
      {value != null ? (
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {value.toFixed(1)}
          {count != null ? ` · ${count}` : ''}
        </span>
      ) : (
        <span className="text-xs text-[var(--color-muted-foreground)]">Sin reseñas</span>
      )}
    </span>
  );
}
