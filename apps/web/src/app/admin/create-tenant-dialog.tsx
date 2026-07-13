'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createAdminTenant } from '@/features/admin/api';
import { tenantAdminUrl } from '@/lib/tenant';
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

/** Convierte un nombre en un slug válido (minúsculas, guiones). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function CreateTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');

  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setSlugTouched(false);
      setOwnerEmail('');
      setOwnerName('');
      setTimezone('America/Argentina/Buenos_Aires');
    }
  }, [open]);

  // El slug se autogenera del nombre hasta que el usuario lo edita a mano.
  const finalSlug = slugTouched ? slug : slugify(name);

  const create = useMutation({
    mutationFn: () =>
      createAdminTenant({
        name: name.trim(),
        slug: finalSlug,
        ownerEmail: ownerEmail.trim(),
        ownerName: ownerName.trim() || undefined,
        timezone: timezone.trim() || undefined,
        redirectTo: tenantAdminUrl(finalSlug, '/set-password'),
      }),
    onSuccess: (r) => {
      if (r.ownerCreated) {
        toast.success(`Comercio creado. Se invitó a ${ownerEmail.trim()} por email.`);
      } else if (!r.supabaseEnabled) {
        toast.success('Comercio creado (invitación deshabilitada en este entorno).');
      } else {
        toast.warning('Comercio creado, pero falló la invitación al dueño. Reintentá invitarlo.');
      }
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    name.trim().length >= 1 &&
    finalSlug.length >= 2 &&
    /\S+@\S+\.\S+/.test(ownerEmail.trim()) &&
    !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo comercio</DialogTitle>
          <DialogDescription>
            Se crea el comercio con el turnero activo y se invita al dueño por email para que
            active su cuenta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>Nombre del comercio</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Peluquería Willy" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Dirección (subdominio)</Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={finalSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="willy"
                className="max-w-[10rem]"
              />
              <span className="text-sm text-[var(--color-muted-foreground)]">.soytuturno.com</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Email del dueño</Label>
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="dueno@mail.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nombre del dueño (opcional)</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Guillermo" />
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
          <Button onClick={() => create.mutate()} disabled={!canSubmit}>
            {create.isPending ? 'Creando…' : 'Crear comercio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
