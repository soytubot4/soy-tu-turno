'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Scissors, Users, Clock, LogOut, ShieldCheck } from 'lucide-react';
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
}[] = [
  { href: '/', label: 'Agenda', icon: CalendarDays, exact: true },
  { href: '/servicios', label: 'Servicios', icon: Scissors },
  { href: '/equipo', label: 'Equipo', icon: Users },
  { href: '/horarios', label: 'Horarios', icon: Clock },
  { href: '/usuarios', label: 'Usuarios', icon: ShieldCheck, capability: 'team:manage' },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, can } = useMe();
  const items = NAV.filter((item) => !item.capability || can(item.capability));

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="p-5 text-lg font-bold tracking-tight">
          soy<span className="text-[var(--color-primary)]">tuturno</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
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
      <main className="flex-1 overflow-y-auto p-6 [scrollbar-gutter:stable] md:p-8">{children}</main>
    </div>
  );
}
