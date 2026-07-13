'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, Store, Plus } from 'lucide-react';
import { listAdminTenants, updateTenantTurno, type AdminTenant } from '@/features/admin/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreateTenantDialog } from './create-tenant-dialog';

const DEFAULT_TZ = 'America/Asuncion';

export default function AdminPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: tenants, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: listAdminTenants,
    retry: false,
  });

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            soy<span className="text-[var(--color-primary)]">tuturno</span> · superadmin
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Activá el turnero por comercio y configurá su zona horaria.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo comercio
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </div>

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : isError ? (
        <p className="rounded-[var(--radius)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 p-4 text-sm text-[var(--color-destructive)]">
          {(error as Error)?.message ?? 'No tenés acceso al panel superadmin.'}
        </p>
      ) : (tenants ?? []).length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No hay comercios cargados.</p>
      ) : (
        <ul className="space-y-3">
          {tenants!.map((t) => (
            <TenantRow key={t.id} tenant={t} />
          ))}
        </ul>
      )}
    </main>
  );
}

function TenantRow({ tenant }: { tenant: AdminTenant }) {
  const qc = useQueryClient();
  const initialTz =
    typeof tenant.turnoConfig?.timezone === 'string' ? tenant.turnoConfig.timezone : DEFAULT_TZ;
  const [timezone, setTimezone] = useState(initialTz);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });

  const toggle = useMutation({
    mutationFn: () => updateTenantTurno(tenant.id, { enabled: !tenant.turnoEnabled }),
    onSuccess: (r) => {
      toast.success(r.turnoEnabled ? 'Turnero activado' : 'Turnero desactivado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTz = useMutation({
    mutationFn: () => updateTenantTurno(tenant.id, { enabled: tenant.turnoEnabled, timezone: timezone.trim() }),
    onSuccess: () => {
      toast.success('Zona horaria guardada');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="rounded-[calc(var(--radius)+0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)]">
          <Store className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{tenant.name}</p>
          <p className="truncate text-xs text-[var(--color-muted-foreground)]">
            {tenant.slug}.soytuturno.com
          </p>
        </div>
        <Button
          variant={tenant.turnoEnabled ? 'secondary' : 'default'}
          size="sm"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
        >
          {tenant.turnoEnabled ? 'Turnero activo' : 'Activar turnero'}
        </Button>
      </div>

      {tenant.turnoEnabled && (
        <div className="mt-3 flex items-end gap-2 border-t border-[var(--color-border)] pt-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Zona horaria (IANA)</Label>
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-56"
              placeholder="America/Asuncion"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveTz.mutate()}
            disabled={saveTz.isPending || timezone.trim() === initialTz}
          >
            Guardar
          </Button>
        </div>
      )}
    </li>
  );
}
