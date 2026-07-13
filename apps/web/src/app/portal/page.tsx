'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarCheck, Clock, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import {
  getPortalInfo,
  getPortalAvailability,
  bookPortal,
  type PortalInfo,
} from '@/features/portal/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function fmtLongDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

type Service = PortalInfo['services'][number];

export default function PortalPage() {
  const { data: info, isLoading, isError } = useQuery({ queryKey: ['portal', 'info'], queryFn: getPortalInfo });

  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState(todayYmd());
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [slot, setSlot] = useState<{ startAt: string; resourceId: string } | null>(null);
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState<{ startAt: string } | null>(null);

  useEffect(() => setSlot(null), [service, date]);

  const { data: slots, isFetching: loadingSlots } = useQuery({
    queryKey: ['portal', 'availability', service?.id, date],
    queryFn: () => getPortalAvailability(service!.id, date),
    enabled: !!service,
  });

  // Un botón por horario (si hay varios profesionales a la misma hora, tomamos el primero).
  const uniqueSlots = useMemo(() => {
    const seen = new Set<string>();
    const out: { startAt: string; resourceId: string }[] = [];
    for (const s of slots ?? []) {
      if (seen.has(s.startAt)) continue;
      seen.add(s.startAt);
      out.push({ startAt: s.startAt, resourceId: s.resourceId });
    }
    return out;
  }, [slots]);

  const book = useMutation({
    mutationFn: () =>
      bookPortal({
        serviceId: service!.id,
        resourceId: slot!.resourceId,
        startAt: slot!.startAt,
        date,
        firstName: firstName.trim(),
        phone: phone.trim(),
      }),
    onSuccess: (r) => setDone({ startAt: r.startAt }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Centered><p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p></Centered>;
  }
  if (isError || !info?.tenant) {
    return (
      <Centered>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No encontramos este comercio.
        </p>
      </Centered>
    );
  }

  if (done) {
    return (
      <Shell name={info.tenant.name}>
        <div className="flex flex-col items-center gap-3 rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-[var(--color-success)]" />
          <h2 className="text-xl font-semibold">¡Turno reservado!</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {service?.name} · {fmtLongDate(date)} a las {fmtTime(done.startAt)}.
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)]">Te esperamos 🙌</p>
          <Button
            variant="outline"
            onClick={() => {
              setDone(null);
              setService(null);
              setSlot(null);
              setFirstName('');
              setPhone('');
            }}
          >
            Reservar otro turno
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell name={info.tenant.name}>
      {/* 1. Servicio */}
      <Section step={1} title="Elegí el servicio">
        <div className="grid gap-2">
          {info.services.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Todavía no hay servicios disponibles.
            </p>
          )}
          {info.services.map((s) => (
            <button
              key={s.id}
              onClick={() => setService(s)}
              className={`flex items-center justify-between rounded-[var(--radius)] border p-3 text-left transition-colors ${
                service?.id === s.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <Clock className="h-3 w-3" /> {s.durationMin} min
                  {s.price != null && <span>· ${Number(s.price).toLocaleString('es-AR')}</span>}
                </p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* 2. Día + horario */}
      {service && (
        <Section step={2} title="Elegí día y horario">
          <div className="mb-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDate(shiftYmd(date, -1))}
              disabled={date === todayYmd()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => dateInputRef.current?.showPicker?.()}
                className="w-full rounded-[var(--radius)] py-1.5 text-center text-sm font-medium capitalize hover:bg-[var(--color-accent)]"
                title="Elegí una fecha"
              >
                {fmtLongDate(date)}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                min={todayYmd()}
                max={shiftYmd(todayYmd(), 30)}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                aria-hidden
                tabIndex={-1}
                className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 opacity-0"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => setDate(shiftYmd(date, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {loadingSlots ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Buscando horarios…</p>
          ) : uniqueSlots.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No hay horarios libres ese día. Probá otra fecha.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {uniqueSlots.map((s) => (
                <Button
                  key={s.startAt}
                  variant={slot?.startAt === s.startAt ? 'default' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => setSlot(s)}
                >
                  {fmtTime(s.startAt)}
                </Button>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 3. Datos + confirmar */}
      {service && slot && (
        <Section step={3} title="Tus datos">
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label>Nombre</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Teléfono (WhatsApp)</Label>
              <PhoneInput onChange={setPhone} placeholder="341 1234567" />
            </div>
          </div>
          <Button
            className="mt-4 w-full"
            onClick={() => book.mutate()}
            disabled={book.isPending || !firstName.trim() || phone.trim().length < 5}
          >
            <CalendarCheck className="h-4 w-4" />
            {book.isPending ? 'Reservando…' : `Reservar ${fmtTime(slot.startAt)}`}
          </Button>
        </Section>
      )}
    </Shell>
  );
}

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md space-y-5 p-5">
      <header className="pt-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Reservá tu turno online</p>
      </header>
      {children}
      <footer className="pb-6 pt-2 text-center text-xs text-[var(--color-muted-foreground)]">
        con <span className="font-semibold">soytuturno</span>
      </footer>
    </main>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs text-[var(--color-primary-foreground)]">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center p-8">{children}</main>;
}
