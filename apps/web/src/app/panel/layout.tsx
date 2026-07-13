'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Scissors, Users, Clock, LogOut } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/panel', label: 'Agenda', icon: CalendarDays },
  { href: '/panel/servicios', label: 'Servicios', icon: Scissors },
  { href: '/panel/equipo', label: 'Equipo', icon: Users },
  { href: '/panel/horarios', label: 'Horarios', icon: Clock },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

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
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/panel' ? pathname === '/panel' : pathname.startsWith(href);
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
        <button
          onClick={logout}
          className="flex items-center gap-3 border-t border-[var(--color-border)] px-6 py-4 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-6 [scrollbar-gutter:stable] md:p-8">{children}</main>
    </div>
  );
}
