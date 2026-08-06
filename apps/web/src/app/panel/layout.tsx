'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  CalendarDays,
  Scissors,
  Users,
  Settings,
  LogOut,
  ShieldCheck,
  Map,
  Package,
  GraduationCap,
  Menu,
  X,
} from 'lucide-react';
import type { TurnoCapability } from '@soytuturno/shared';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useMe } from '@/features/me/api';
import { cn } from '@/lib/utils';

// Paths LIMPIOS (los que ve el navegador). El middleware reescribe a /panel/*
// internamente, así que usePathname() devuelve estos, no el /panel interno.
const NAV: {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  exact?: boolean;
  capability?: TurnoCapability;
  /** Etiqueta alternativa cuando el comercio está en modo canchas (club). */
  canchasLabel?: string;
  /** Solo visible en modo canchas (club deportivo). */
  canchasOnly?: boolean;
  /** Solo visible si el comercio tiene productos habilitados. */
  productsOnly?: boolean;
}[] = [
  { href: '/', label: 'Agenda', icon: CalendarDays, exact: true },
  { href: '/servicios', label: 'Servicios', icon: Scissors },
  { href: '/productos', label: 'Productos', icon: Package, productsOnly: true, capability: 'services:write' },
  { href: '/equipo', label: 'Equipo', icon: Users, canchasLabel: 'Canchas' },
  { href: '/mapa', label: 'Mapa', icon: Map, canchasOnly: true, capability: 'resources:write' },
  { href: '/profesores', label: 'Profesores', icon: GraduationCap, canchasOnly: true, capability: 'resources:write' },
  { href: '/horarios', label: 'Configuración', icon: Settings },
  { href: '/usuarios', label: 'Usuarios', icon: ShieldCheck, capability: 'team:manage' },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, can, canchas, products } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);

  // Cerrar el menú al navegar (mobile).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const items = NAV.filter(
    (item) =>
      (!item.capability || can(item.capability)) &&
      (!item.canchasOnly || canchas) &&
      (!item.productsOnly || products),
  );

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Fondo oscuro detrás del drawer (solo mobile) */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}

      {/* Sidebar: drawer deslizable en mobile, fija en desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)] transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-start justify-between p-5">
          <div className="min-w-0">
            <div className="text-lg font-bold tracking-tight">
              soy<span className="text-[var(--color-primary)]">tuturno</span>
            </div>
            {me?.tenantName && (
              <div className="mt-0.5 truncate text-sm font-medium text-[var(--color-muted-foreground)]">
                {me.tenantName}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
            className="-mr-1 shrink-0 rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map(({ href, label, icon: Icon, exact, canchasLabel }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            const shownLabel = canchas && canchasLabel ? canchasLabel : label;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
                )}
              >
                <Icon className="h-4 w-4" />
                {shownLabel}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--color-border)]">
          {me && (
            <p className="px-6 pt-3 text-xs text-[var(--color-muted-foreground)]">
              Ingresaste como <span className="font-medium text-[var(--color-foreground)]">{me.roleLabel}</span>
            </p>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 px-6 py-4 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Columna principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar mobile con hamburguesa */}
        <header className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-card)] p-3 md:hidden">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMenuOpen(true)}
            className="rounded-md p-1.5 text-[var(--color-foreground)] hover:bg-[var(--color-accent)]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-base font-bold tracking-tight">
            soy<span className="text-[var(--color-primary)]">tuturno</span>
          </span>
          {me?.tenantName && (
            <span className="truncate text-sm text-[var(--color-muted-foreground)]">· {me.tenantName}</span>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable] md:p-8">{children}</main>
      </div>
    </div>
  );
}
