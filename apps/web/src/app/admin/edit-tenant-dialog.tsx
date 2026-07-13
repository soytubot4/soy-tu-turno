'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateAdminTenant, type AdminTenant } from '@/features/admin/api';
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
    }
  }, [open, tenant]);

  const initialTz =
    typeof tenant?.turnoConfig?.timezone === 'string' ? tenant.turnoConfig.timezone : DEFAULT_TZ;

  const dirty =
    !!tenant &&
    (name.trim() !== tenant.name ||
      slug !== tenant.slug ||
      phone.trim() !== (tenant.phone ?? '') ||
      ownerName.trim() !== (tenant.ownerName ?? '') ||
      timezone.trim() !== initialTz);

  const save = useMutation({
    mutationFn: () =>
      updateAdminTenant(tenant!.id, {
        name: name.trim(),
        slug,
        phone: phone.trim() || null,
        ownerName: ownerName.trim() || null,
        timezone: timezone.trim() || undefined,
      }),
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
