'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateAdminTenant, updateTenantTurno, type AdminTenant } from '@/features/admin/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function EditTenantDialog({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: AdminTenant | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [canchas, setCanchas] = useState(false);

  // Al abrir con un tenant, precargar sus valores actuales.
  useEffect(() => {
    if (open && tenant) {
      setName(tenant.name);
      setSlug(tenant.slug);
      setPhone(tenant.phone ?? '');
      setOwnerName(tenant.ownerName ?? '');
      const tz =
        typeof tenant.turnoConfig?.timezone === 'string' ? tenant.turnoConfig.timezone : DEFAULT_TZ;
      setTimezone(tz);
      setCanchas(tenant.turnoConfig?.canchas === true);
    }
  }, [open, tenant]);

  const initialTz =
    typeof tenant?.turnoConfig?.timezone === 'string' ? tenant.turnoConfig.timezone : DEFAULT_TZ;
  const initialCanchas = tenant?.turnoConfig?.canchas === true;

  const dirty =
    !!tenant &&
    (name.trim() !== tenant.name ||
      slug !== tenant.slug ||
      phone.trim() !== (tenant.phone ?? '') ||
      ownerName.trim() !== (tenant.ownerName ?? '') ||
      timezone.trim() !== initialTz ||
      canchas !== initialCanchas);

  const save = useMutation({
    mutationFn: async () => {
      await updateAdminTenant(tenant!.id, {
        name: name.trim(),
        slug,
        phone: phone.trim() || null,
        ownerName: ownerName.trim() || null,
        timezone: timezone.trim() || undefined,
      });
      if (canchas !== initialCanchas) {
        await updateTenantTurno(tenant!.id, { enabled: tenant!.turnoEnabled, canchas });
      }
    },
    onSuccess: () => {
      toast.success('Comercio actualizado');
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = dirty && name.trim().length >= 1 && slug.length >= 2 && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar comercio</DialogTitle>
          <DialogDescription>
            Ojo: el subdominio es la identidad del comercio en todo el ecosistema. Cambialo solo si
            sabés lo que hacés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>Nombre del comercio</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Dirección (subdominio)</Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                className="max-w-[10rem]"
              />
              <span className="text-sm text-[var(--color-muted-foreground)]">.soytuturno.com</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Dueño</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="—" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Zona horaria (IANA)</Label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border border-[var(--color-border)] p-3">
            <input
              type="checkbox"
              checked={canchas}
              onChange={(e) => setCanchas(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm">
              <span className="font-medium">Club deportivo (canchas)</span>
              <span className="block text-xs text-[var(--color-muted-foreground)]">
                Habilita las canchas (pádel, tenis, fútbol…) con deporte, superficie y el mapa del predio.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSubmit}>
            {save.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
