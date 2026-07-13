'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Store, ArrowRight } from 'lucide-react';
import { listBusinesses, type Business } from '@/features/landing/api';
import { portalUrl } from '@/lib/tenant';
import { Input } from '@/components/ui/input';
import { Stars } from '@/components/ui/stars';

/** Landing / marketplace (apex: soytuturno.com). Lista los negocios con turnero activo. */
export default function LandingPage() {
  const [q, setQ] = useState('');
  const { data: businesses, isLoading } = useQuery({
    queryKey: ['businesses', q],
    queryFn: () => listBusinesses(q || undefined),
  });

  const list = businesses ?? [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-10">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
          soy<span className="text-[var(--color-primary)]">tuturno</span>
        </h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Reservá turno online en los mejores lugares de tu ciudad.
        </p>
      </header>

      <div className="relative mx-auto mt-8 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar peluquería, barbería, consultorio…"
          className="h-11 pl-9"
        />
      </div>

      <section className="mt-8">
        {isLoading ? (
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">
            {q ? 'No encontramos negocios con ese nombre.' : 'Todavía no hay negocios disponibles.'}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((b) => (
              <BusinessCard key={b.slug} business={b} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-12 pb-6 text-center text-xs text-[var(--color-muted-foreground)]">
        ¿Tenés un comercio?{' '}
        <span className="font-medium text-[var(--color-foreground)]">soytuturno</span> te arma tu
        agenda online.
      </footer>
    </main>
  );
}

function BusinessCard({ business }: { business: Business }) {
  return (
    <a
      href={portalUrl(business.slug)}
      className="group flex flex-col gap-3 rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors hover:border-[var(--color-foreground)]/20"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent)]">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoUrl} alt={business.name} className="h-full w-full object-cover" />
          ) : (
            <Store className="h-5 w-5 text-[var(--color-muted-foreground)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{business.name}</p>
          <Stars value={business.rating} count={business.reviewCount || undefined} />
        </div>
      </div>

      {business.address && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{business.address}</span>
        </p>
      )}

      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)]">
        Reservar turno
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
