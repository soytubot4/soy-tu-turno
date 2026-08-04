'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarCheck, Clock, ChevronLeft, ChevronRight, CheckCircle2, Lightbulb, MapPin, Plus, Users, X } from 'lucide-react';
import {
  SPORT_LABELS,
  PRICE_UNIT_LABELS,
  playerPrice,
  isWeekendDate,
  usesLight,
  type Sport,
} from '@soytuturno/shared';
import {
  getPortalInfo,
  getPortalAvailability,
  bookPortal,
  reviewPortal,
  type PortalInfo,
  type Rating,
} from '@/features/portal/api';
import { CourtMap } from '@/components/court-map';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Stars, StarInput } from '@/components/ui/stars';

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
  const [court, setCourt] = useState<string | null>(null); // cancha elegida (modo club)
  const [staff, setStaff] = useState<string | null>(null); // profesional elegido (null = cualquiera)
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [players, setPlayers] = useState<
    { firstName: string; lastName: string; categoryId: string | null }[]
  >([
    { firstName: '', lastName: '', categoryId: null },
    { firstName: '', lastName: '', categoryId: null },
  ]);
  const [done, setDone] = useState<{ startAt: string; resourceId: string; resourceName: string } | null>(null);

  const canchas = !!info?.canchas;
  const askPlayers = !!info?.askPlayers;
  // El servicio puede pedir los datos de las personas con una cantidad fija
  // (ej: singles = 2, dobles = 4). Si no, cae al modo del comercio (mínimo 2).
  const serviceAskPeople = !!service?.askPeople;
  const showPlayers = serviceAskPeople || askPlayers;
  const requiredPlayers = serviceAskPeople ? (service?.peopleCount ?? 2) : 2;
  const fixedPlayers = serviceAskPeople && service?.peopleCount != null;
  const categories = info?.playerCategories ?? [];
  const isWeekend = !!info?.weekendPricing && isWeekendDate(date);
  const hasPricing = categories.some((c) => c.price != null || c.priceWeekend != null);
  const validPlayers = players.filter((p) => p.firstName.trim()).length;
  const setPlayer = (i: number, patch: Partial<(typeof players)[number]>) =>
    setPlayers((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  // Total de los jugadores con nombre cargado.
  const playersTotal = players
    .filter((p) => p.firstName.trim())
    .reduce((sum, p) => sum + (playerPrice(p.categoryId, categories, isWeekend) ?? 0), 0);

  // Productos elegidos (cantidad por producto) + su total.
  const [productQty, setProductQty] = useState<Record<string, number>>({});
  const products = info?.products ?? [];
  const setQty = (id: string, q: number) => setProductQty((m) => ({ ...m, [id]: Math.max(0, q) }));
  const productsTotal = products.reduce(
    (s, p) => s + (p.price ?? 0) * (productQty[p.variantId] ?? 0),
    0,
  );
  // Base = jugadores con precio configurado; si no hay, el precio del servicio/cancha.
  // (Mismo criterio que el backend al reservar.) Después se suman los productos.
  const hasPlayerPrice = players.some(
    (p) => p.firstName.trim() && playerPrice(p.categoryId, categories, isWeekend) != null,
  );
  const servicePrice = service?.price != null ? Number(service.price) : 0;
  const baseTotal = hasPlayerPrice ? playersTotal : servicePrice;
  // Recargo por luz: se cobra si cualquier parte del turno cae después de la hora
  // configurada. Mismo criterio que aplica el backend al confirmar la reserva.
  const lightCfg = info?.light ?? null;
  const lightFee =
    lightCfg && slot && service && usesLight(fmtTime(slot.startAt), service.durationMin, lightCfg.from)
      ? lightCfg.price
      : 0;
  const grandTotal = baseTotal + productsTotal + lightFee;

  // Recursos que se pueden reservar (las referencias del mapa —bar, entrada— no)
  // Y que ofrecen el servicio elegido: si el servicio tiene profesionales
  // asignados solo van esos, si no tiene lo hacen todos. Mismo criterio que usa
  // el backend para calcular los horarios.
  const bookableResources = (info?.resources ?? []).filter(
    (r) => !r.reference && (!service?.resourceIds.length || service.resourceIds.includes(r.id)),
  );
  // El paso del profesional se muestra aunque haya uno solo: aunque no haya nada
  // que elegir, el cliente tiene que saber quién lo va a atender.
  const pickStaff = !canchas && bookableResources.length > 0;
  const onlyStaff = bookableResources.length === 1;
  const stepDate = canchas || pickStaff ? 3 : 2;

  useEffect(() => setSlot(null), [service, date, court, staff]);
  // Si cambia el servicio, el profesional elegido puede no ofrecerlo: volvemos a "cualquiera".
  useEffect(() => setStaff(null), [service]);

  // Si el servicio pide una cantidad fija, dejamos exactamente esa cantidad de filas.
  useEffect(() => {
    if (!fixedPlayers) return;
    setPlayers((ps) => {
      if (ps.length === requiredPlayers) return ps;
      const next = ps.slice(0, requiredPlayers);
      while (next.length < requiredPlayers) {
        next.push({ firstName: '', lastName: '', categoryId: null });
      }
      return next;
    });
  }, [fixedPlayers, requiredPlayers]);

  const { data: slots, isFetching: loadingSlots } = useQuery({
    queryKey: ['portal', 'availability', service?.id, date, staff],
    // El backend filtra por profesional (y valida que ofrezca el servicio).
    queryFn: () => getPortalAvailability(service!.id, date, staff ?? undefined),
    enabled: !!service,
  });

  // Horarios a mostrar. En modo club, si eligió una cancha filtramos por esa;
  // si no, un botón por horario (tomando la primera cancha libre a esa hora).
  const uniqueSlots = useMemo(() => {
    const seen = new Set<string>();
    const out: { startAt: string; resourceId: string }[] = [];
    for (const s of slots ?? []) {
      if (canchas && court && s.resourceId !== court) continue;
      if (seen.has(s.startAt)) continue;
      seen.add(s.startAt);
      out.push({ startAt: s.startAt, resourceId: s.resourceId });
    }
    return out;
  }, [slots, canchas, court]);

  const book = useMutation({
    mutationFn: () =>
      bookPortal({
        serviceId: service!.id,
        resourceId: slot!.resourceId,
        startAt: slot!.startAt,
        date,
        firstName: firstName.trim(),
        phone: phone.trim(),
        players: showPlayers
          ? players
              .filter((p) => p.firstName.trim())
              .map((p) => ({
                firstName: p.firstName.trim(),
                lastName: p.lastName.trim(),
                categoryId: p.categoryId,
              }))
          : undefined,
        products: Object.entries(productQty)
          .filter(([, q]) => q > 0)
          .map(([variantId, qty]) => ({ variantId, qty })),
      }),
    onSuccess: (r) => {
      const prof = (info?.resources ?? []).find((x) => x.id === slot!.resourceId);
      setDone({ startAt: r.startAt, resourceId: slot!.resourceId, resourceName: prof?.name ?? '' });
    },
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
      <Shell
      name={info.tenant.name}
      rating={info.rating}
      address={info.tenant.address}
      mapsUrl={info.mapsUrl}
      mapsEmbedUrl={info.mapsEmbedUrl}
    >
        <div className="flex flex-col items-center gap-3 rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-[var(--color-success)]" />
          <h2 className="text-xl font-semibold">¡Turno reservado!</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {service?.name} · {fmtLongDate(date)} a las {fmtTime(done.startAt)}.
          </p>
          {done.resourceName &&
            (canchas ? (
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <MapPin className="h-4 w-4 text-[var(--color-primary)]" /> {done.resourceName}
              </p>
            ) : (
              // Aunque haya elegido "cualquiera", le decimos con quién le tocó.
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-4 w-4 text-[var(--color-primary)]" /> Con {done.resourceName}
              </p>
            ))}
          <p className="text-sm text-[var(--color-muted-foreground)]">Te esperamos 🙌</p>
        </div>

        {canchas && (
          <div>
            <p className="mb-2 text-sm font-medium">Ubicación de tu cancha</p>
            <CourtMap courts={info.resources} selectedId={done.resourceId} />
          </div>
        )}

        <ReviewForm
          resourceId={done.resourceId}
          resourceName={done.resourceName}
          phone={phone}
          authorName={firstName}
        />

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setDone(null);
            setService(null);
            setSlot(null);
            setStaff(null);
            setFirstName('');
            setPhone('');
            setPlayers([
              { firstName: '', lastName: '', categoryId: null },
              { firstName: '', lastName: '', categoryId: null },
            ]);
            setProductQty({});
          }}
        >
          Reservar otro turno
        </Button>
      </Shell>
    );
  }

  return (
    <Shell
      name={info.tenant.name}
      rating={info.rating}
      address={info.tenant.address}
      mapsUrl={info.mapsUrl}
      mapsEmbedUrl={info.mapsEmbedUrl}
    >
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
                  {s.price != null && (
                    <span>
                      · ${Number(s.price).toLocaleString('es-AR')}
                      {s.priceUnit && ` ${PRICE_UNIT_LABELS[s.priceUnit]}`}
                    </span>
                  )}
                </p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* Mapa de canchas (modo club): elegí tu cancha o mirá dónde queda */}
      {service && canchas && (
        <Section step={2} title="Elegí tu cancha">
          <CourtMap courts={info.resources} selectedId={court} onSelect={(id) => setCourt(id === court ? null : id)} />
          {court ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 text-[var(--color-primary)]" />
              {(() => {
                const c = info.resources.find((r) => r.id === court);
                if (!c) return null;
                return (
                  <span>
                    <span className="font-medium">{c.name}</span>
                    {c.sport && <span className="text-[var(--color-muted-foreground)]"> · {SPORT_LABELS[c.sport]}</span>}
                    {c.surface && <span className="text-[var(--color-muted-foreground)]"> · {c.surface}</span>}
                  </span>
                );
              })()}
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              Tocá una cancha para ver solo sus horarios, o elegí el horario directo abajo.
            </p>
          )}
        </Section>
      )}

      {/* Profesional (modo turnos): elegir con quién, o dejar que sea cualquiera. */}
      {service && pickStaff && (
        <Section step={2} title={onlyStaff ? 'Te atiende' : 'Elegí el profesional'}>
          <div className="grid gap-2">
            {/* Con un solo profesional no hay nada que elegir: se muestra y listo. */}
            {!onlyStaff && (
              <button
                onClick={() => setStaff(null)}
                className={`flex items-center gap-3 rounded-[var(--radius)] border p-3 text-left transition-colors ${
                  staff === null
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)]/50">
                  <Users className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Cualquiera</span>
                  <span className="block text-xs text-[var(--color-muted-foreground)]">
                    El primero que esté libre en el horario que elijas
                  </span>
                </span>
              </button>
            )}
            {bookableResources.map((r) => (
              <button
                key={r.id}
                disabled={onlyStaff}
                onClick={() => setStaff(r.id === staff ? null : r.id)}
                className={`flex items-center gap-3 rounded-[var(--radius)] border p-3 text-left transition-colors ${
                  staff === r.id || onlyStaff
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]'
                }`}
              >
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-sm font-medium text-[var(--color-primary)]">
                    {r.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  {r.title && (
                    <span className="block truncate text-xs text-[var(--color-muted-foreground)]">
                      {r.title}
                    </span>
                  )}
                </span>
                {r.rating.count > 0 && (
                  <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                    ★ {r.rating.avg?.toFixed(1)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* 2/3. Día + horario */}
      {service && (
        <Section step={stepDate} title="Elegí día y horario">
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

      {/* 3/4. Datos + confirmar */}
      {service && slot && (
        <Section step={stepDate + 1} title="Tus datos">
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

          {showPlayers && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Jugadores</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {fixedPlayers
                  ? `Este turno es para ${requiredPlayers} personas: cargá el nombre de cada una.`
                  : 'Cargá el nombre de cada jugador (mínimo 2) y elegí la categoría de cada uno.'}
              </p>
              {players.map((p, i) => (
                <div key={i} className="space-y-2 rounded-[var(--radius)] border border-[var(--color-border)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-xs text-[var(--color-muted-foreground)]">{i + 1}.</span>
                    <Input
                      value={p.firstName}
                      onChange={(e) => setPlayer(i, { firstName: e.target.value })}
                      placeholder="Nombre"
                      className="flex-1"
                    />
                    {!fixedPlayers && players.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPlayers((ps) => ps.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                        title="Quitar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* Apellido + categoría son del modo club; si el servicio solo pide
                      las personas, alcanza con el nombre. */}
                  {askPlayers && (
                  <Input
                    value={p.lastName}
                    onChange={(e) => setPlayer(i, { lastName: e.target.value })}
                    placeholder="Apellido"
                    className="ml-6 w-[calc(100%-1.5rem)]"
                  />
                  )}
                  {askPlayers && categories.length > 0 && (
                  <div className="ml-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <select
                      className="h-9 flex-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
                      value={p.categoryId ?? ''}
                      onChange={(e) => setPlayer(i, { categoryId: e.target.value || null })}
                    >
                      <option value="">¿Qué es?</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {hasPricing && p.firstName.trim() && (
                      <span className="text-sm font-medium">
                        {(() => {
                          const pr = playerPrice(p.categoryId, categories, isWeekend);
                          return pr != null ? `$${pr.toLocaleString('es-AR')}` : '—';
                        })()}
                      </span>
                    )}
                  </div>
                  )}
                </div>
              ))}
              {!fixedPlayers && players.length < 12 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setPlayers((ps) => [...ps, { firstName: '', lastName: '', categoryId: null }])}
                >
                  <Plus className="h-4 w-4" /> Agregar jugador
                </Button>
              )}
            </div>
          )}

          {products.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Productos (opcional)</p>
              {products.map((p) => {
                const q = productQty[p.variantId] ?? 0;
                const soldOut = p.available <= 0;
                const atMax = q >= p.available;
                return (
                  <div
                    key={p.variantId}
                    className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--color-border)] p-2.5"
                  >
                    {p.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-[var(--radius)] object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {p.price != null && <span>${p.price.toLocaleString('es-AR')}</span>}
                        {soldOut ? (
                          <span className="text-[var(--color-destructive)]"> · sin stock</span>
                        ) : (
                          <span> · {p.available} disp.</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={q <= 0}
                        onClick={() => setQty(p.variantId, q - 1)}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">{q}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={soldOut || atMax}
                        onClick={() => setQty(p.variantId, q + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {lightFee > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                <Lightbulb className="h-3.5 w-3.5" /> Luz (después de las {lightCfg?.from})
              </span>
              <span className="font-medium">${lightFee.toLocaleString('es-AR')}</span>
            </div>
          )}

          {grandTotal > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-base font-semibold">
              <span>Total a pagar</span>
              <span>${grandTotal.toLocaleString('es-AR')}</span>
            </div>
          )}

          <Button
            className="mt-4 w-full"
            onClick={() => book.mutate()}
            disabled={
              book.isPending ||
              !firstName.trim() ||
              phone.trim().length < 5 ||
              (showPlayers && validPlayers < requiredPlayers)
            }
          >
            <CalendarCheck className="h-4 w-4" />
            {book.isPending ? 'Reservando…' : `Reservar ${fmtTime(slot.startAt)}`}
          </Button>
        </Section>
      )}
    </Shell>
  );
}

function Shell({
  name,
  rating,
  address,
  mapsUrl,
  mapsEmbedUrl,
  children,
}: {
  name: string;
  rating?: Rating;
  address?: string | null;
  mapsUrl?: string | null;
  mapsEmbedUrl?: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md space-y-5 p-5">
      <header className="flex flex-col items-center gap-1.5 pt-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        {rating && <Stars value={rating.avg} count={rating.count || undefined} />}
        <p className="text-sm text-[var(--color-muted-foreground)]">Reservá tu turno online</p>
      </header>
      {children}
      {mapsEmbedUrl && <LocationBlock address={address} mapsUrl={mapsUrl} embed={mapsEmbedUrl} />}
      <footer className="pb-6 pt-2 text-center text-xs text-[var(--color-muted-foreground)]">
        con <span className="font-semibold">soytuturno</span>
      </footer>
    </main>
  );
}

/** Dónde queda el local: mapa embebido + botón para abrirlo en Google Maps. */
function LocationBlock({
  address,
  mapsUrl,
  embed,
}: {
  address?: string | null;
  mapsUrl?: string | null;
  embed: string;
}) {
  return (
    <section className="overflow-hidden rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Dónde estamos</p>
          {address && (
            <p className="truncate text-xs text-[var(--color-muted-foreground)]">{address}</p>
          )}
        </div>
        <a
          href={mapsUrl || embed}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-accent)]"
        >
          <MapPin className="h-3.5 w-3.5 text-[var(--color-primary)]" /> Cómo llegar
        </a>
      </div>
      <iframe
        src={embed}
        title="Ubicación"
        className="h-52 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </section>
  );
}

/** Reseña tras reservar: puntúa el negocio y (opcional) al profesional. */
function ReviewForm({
  resourceId,
  resourceName,
  phone,
  authorName,
}: {
  resourceId: string;
  resourceName: string;
  phone: string;
  authorName: string;
}) {
  const [businessStars, setBusinessStars] = useState(0);
  const [profStars, setProfStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      await reviewPortal({
        rating: businessStars,
        comment: comment.trim() || undefined,
        authorName: authorName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      if (profStars > 0) {
        await reviewPortal({
          rating: profStars,
          resourceId,
          authorName: authorName.trim() || undefined,
          phone: phone.trim() || undefined,
        });
      }
    },
    onSuccess: () => setSent(true),
    onError: (e: Error) => toast.error(e.message),
  });

  if (sent) {
    return (
      <div className="rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-center text-sm text-[var(--color-muted-foreground)]">
        ¡Gracias por tu reseña! 💛
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <p className="text-sm font-semibold">¿Cómo fue tu experiencia?</p>

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-[var(--color-muted-foreground)]">El local</span>
        <StarInput value={businessStars} onChange={setBusinessStars} />
      </div>

      {resourceName && (
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-xs text-[var(--color-muted-foreground)]">{resourceName}</span>
          <StarInput value={profStars} onChange={setProfStars} />
        </div>
      )}

      <Input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Dejá un comentario (opcional)"
      />

      <Button
        className="w-full"
        onClick={() => send.mutate()}
        disabled={businessStars === 0 || send.isPending}
      >
        {send.isPending ? 'Enviando…' : 'Enviar reseña'}
      </Button>
    </div>
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
