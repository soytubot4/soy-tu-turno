'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

/**
 * Input de precio/monto con formato argentino en vivo: separa los miles con
 * puntos y usa la coma para los decimales (ej: 1.234,56) mientras se tipea.
 * Guarda un `number`; recibe `value` numérico y avisa por `onValueChange`.
 */
export type PriceInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: number | null | undefined;
  onValueChange: (value: number | undefined) => void;
  /** Cantidad máxima de decimales (default 2). 0 = solo enteros. */
  decimals?: number;
};

export type PriceFieldProps = Omit<PriceInputProps, 'value' | 'onValueChange'> & {
  /** Valor como string (ej: "1234.5" o ""), igual que un input controlado clásico. */
  value: string;
  /** Avisa el nuevo valor como string canónico ("1234.5" o ""). */
  onChange: (value: string) => void;
};

/** Parsea lo que tipeó el usuario → { display formateado, value numérico }. */
function parseInput(input: string, decimals: number): { display: string; value: number | undefined } {
  let s = input.replace(/[^\d,]/g, '');
  const firstComma = s.indexOf(',');
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
  }
  if (decimals === 0) s = s.replace(/,/g, '');
  if (s === '') return { display: '', value: undefined };

  const commaIdx = s.indexOf(',');
  const hasComma = commaIdx !== -1;
  let intPart = hasComma ? s.slice(0, commaIdx) : s;
  const decPart = hasComma ? s.slice(commaIdx + 1, commaIdx + 1 + decimals) : '';

  intPart = intPart.replace(/^0+(?=\d)/, '');
  const intNum = intPart === '' ? 0 : Number(intPart);
  const intFormatted = intNum.toLocaleString('es-AR');

  let display = intPart === '' && hasComma ? '0' : intFormatted;
  if (hasComma) display = `${display},${decPart}`;

  const numStr = (intPart === '' ? '0' : intPart) + (decPart ? `.${decPart}` : '');
  return { display, value: Number(numStr) };
}

/** Formatea un number a texto es-AR (para mostrar el valor inicial / externo). */
function formatNumber(n: number | null | undefined, decimals: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export const PriceInput = React.forwardRef<HTMLInputElement, PriceInputProps>(
  ({ value, onValueChange, decimals = 2, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => formatNumber(value, decimals));

    // Re-sincroniza cuando el value cambia desde afuera (reset / carga) y no
    // coincide con lo que se está mostrando.
    React.useEffect(() => {
      const shown = parseInput(display, decimals).value;
      const ext = value ?? undefined;
      if (ext !== (shown ?? undefined)) setDisplay(formatNumber(value, decimals));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, decimals]);

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode={decimals === 0 ? 'numeric' : 'decimal'}
        value={display}
        onChange={(e) => {
          const parsed = parseInput(e.target.value, decimals);
          setDisplay(parsed.display);
          onValueChange(parsed.value);
        }}
      />
    );
  },
);
PriceInput.displayName = 'PriceInput';

/**
 * Igual que PriceInput pero con API de string (value/onChange), para reemplazar
 * como drop-in los `<Input type="number" value={x} onChange={e => set(...e.target.value)} />`.
 */
export const PriceField = React.forwardRef<HTMLInputElement, PriceFieldProps>(
  ({ value, onChange, ...props }, ref) => (
    <PriceInput
      {...props}
      ref={ref}
      value={value === '' || value == null ? undefined : Number(value)}
      onValueChange={(v) => onChange(v === undefined ? '' : String(v))}
    />
  ),
);
PriceField.displayName = 'PriceField';
