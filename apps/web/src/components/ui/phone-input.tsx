'use client';

import { useState } from 'react';
import { Input } from './input';

/** Códigos de país frecuentes en la región (dial code sin el +). */
const COUNTRIES = [
  { code: 'AR', dial: '54', flag: '🇦🇷' },
  { code: 'PY', dial: '595', flag: '🇵🇾' },
  { code: 'UY', dial: '598', flag: '🇺🇾' },
  { code: 'CL', dial: '56', flag: '🇨🇱' },
  { code: 'BR', dial: '55', flag: '🇧🇷' },
  { code: 'BO', dial: '591', flag: '🇧🇴' },
  { code: 'PE', dial: '51', flag: '🇵🇪' },
  { code: 'MX', dial: '52', flag: '🇲🇽' },
  { code: 'ES', dial: '34', flag: '🇪🇸' },
  { code: 'US', dial: '1', flag: '🇺🇸' },
];

const selectCls =
  'h-9 shrink-0 rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]';

/**
 * Teléfono con selector de código de país. Emite el número completo (dial +
 * dígitos locales, sin +) por onChange, listo para WhatsApp. Maneja su propio
 * estado interno; el padre solo guarda el string resultante.
 */
export function PhoneInput({
  onChange,
  defaultDial = '54',
  placeholder = 'Número',
  disabled,
}: {
  onChange: (fullNumber: string) => void;
  defaultDial?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [dial, setDial] = useState(defaultDial);
  const [local, setLocal] = useState('');

  function emit(d: string, l: string) {
    const digits = l.replace(/\D/g, '').replace(/^0+/, ''); // sin 0 inicial ni símbolos
    onChange(digits ? `${d}${digits}` : '');
  }

  return (
    <div className="flex gap-2">
      <select
        aria-label="Código de país"
        className={selectCls}
        value={dial}
        disabled={disabled}
        onChange={(e) => {
          setDial(e.target.value);
          emit(e.target.value, local);
        }}
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.flag} +{c.dial}
          </option>
        ))}
      </select>
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={local}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setLocal(e.target.value);
          emit(dial, e.target.value);
        }}
        className="flex-1"
      />
    </div>
  );
}
