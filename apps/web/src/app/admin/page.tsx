'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, Store, Plus, Pencil, Trash2, Globe } from 'lucide-react';
import {
  listAdminTenants,
  updateTenantTurno,
  deleteAdminTenant,
  reprovisionDomains,
  type AdminTenant,
} from '@/features/admin/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CreateTenantDialog } from './create-tenant-dialog';
import { EditTenantDialog } from './edit-tenant-dialog';

const OTHER_LABELS: Record<string, string> = {
  soytucanje: 'canje',
  soytuadmin: 'admin',
};

export default function AdminPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminTenant | null>(null);
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
            soy<span className="text-[var(--color-primary)]">tuturno</span>
            <span className="mx-2 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
            superadmin
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
            <TenantRow key={t.id} tenant={t} onEdit={() => setEditing(t)} />
          ))}
        </ul>
      )}

      <EditTenantDialog
        tenant={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </main>
  );
}

function TenantRow({ tenant, onEdit }: { tenant: AdminTenant; onEdit: () => void }) {
  const qc = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });

  const toggle = useMutation({
    mutationFn: () => updateTenantTurno(tenant.id, { enabled: !tenant.turnoEnabled }),
    onSuccess: (r) => {
      toast.success(r.turnoEnabled ? 'Turnero activado' : 'Turnero desactivado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Rehace los subdominios en DigitalOcean. Se usa cuando el comercio existía
  // antes de que estuviera configurado el provisioning, o si algo quedó a medias.
  const reprovision = useMutation({
    mutationFn: () => reprovisionDomains(tenant.id),
    onSuccess: (r) => {
      if (r.errors?.length) toast.error(`Con errores: ${r.errors.join(' · ')}`);
      else toast.success('Dominios rehechos. El certificado puede tardar unos minutos.');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteAdminTenant(tenant.id),
    onSuccess: () => {
      toast.success('Comercio eliminado');
      setConfirmingDelete(false);
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
          {tenant.otherProducts.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {tenant.otherProducts.map((p) => (
                <span
                  key={p}
                  className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]"
                >
                  {OTHER_LABELS[p] ?? p}
                </span>
              ))}
            </p>
          )}
        </div>

        <Button
          variant={tenant.turnoEnabled ? 'secondary' : 'default'}
          size="sm"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
        >
          {tenant.turnoEnabled ? 'Turnero activo' : 'Activar turnero'}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          title="Rehacer los subdominios en DigitalOcean"
          onClick={() => reprovision.mutate()}
          disabled={reprovision.isPending}
        >
          <Globe className={`h-4 w-4 ${reprovision.isPending ? 'animate-pulse' : ''}`} />
        </Button>

        <Button variant="ghost" size="icon" title="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          title={
            tenant.deletable
              ? 'Eliminar comercio'
              : `También usa ${tenant.otherProducts.join(', ')} — desactivá el turnero en vez de borrar`
          }
          onClick={() => setConfirmingDelete(true)}
          disabled={!tenant.deletable || remove.isPending}
          className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 disabled:text-[var(--color-muted-foreground)]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {confirmingDelete && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
          <span className="text-sm text-[var(--color-foreground)]">
            ¿Eliminar <span className="font-medium">{tenant.name}</span> y todos sus turnos? No se
            puede deshacer.
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
