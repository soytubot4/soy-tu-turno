'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Trash2, ShieldCheck } from 'lucide-react';
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from '@soytuturno/shared';
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  type Member,
} from '@/features/usuarios/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import { tenantAdminUrl } from '@/lib/tenant';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const selectCls =
  'flex h-9 w-full rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)] disabled:opacity-50';

export default function UsuariosPage() {
  const qc = useQueryClient();
  const { data: members, isLoading } = useQuery({ queryKey: ['team', 'members'], queryFn: listMembers });

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>('CASHIER');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['team', 'members'] });

  const invite = useMutation({
    mutationFn: () => {
      const slug = currentTenantSlug();
      return inviteMember({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        role: role as 'MANAGER' | 'CASHIER' | 'VIEWER',
        redirectTo: slug ? tenantAdminUrl(slug, '/set-password') : undefined,
      });
    },
    onSuccess: (m) => {
      toast.success(`Invitación enviada a ${m.email}`);
      setEmail('');
      setFullName('');
      setRole('CASHIER');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: string }) =>
      updateMemberRole(v.id, { role: v.role as 'MANAGER' | 'CASHIER' | 'VIEWER' }),
    onSuccess: () => {
      toast.success('Rol actualizado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeMember(id),
    onSuccess: (r) => {
      toast.success('Usuario eliminado');
      void r;
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = members ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Usuarios y permisos</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Quién puede entrar al panel y qué puede hacer. Cada rol tiene sus permisos.
        </p>
      </div>

      {/* Invitar */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4" /> Invitar usuario
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="persona@mail.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nombre (opcional)</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Pérez" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Rol</Label>
              <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full sm:w-auto"
                onClick={() => invite.mutate()}
                disabled={invite.isPending || !email.trim()}
              >
                {invite.isPending ? 'Invitando…' : 'Invitar'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {ROLE_DESCRIPTIONS[role]}
          </p>
        </CardContent>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no hay usuarios.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
          {list.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              onChangeRole={(r) => changeRole.mutate({ id: m.id, role: r })}
              onRemove={() => remove.mutate(m.id)}
              busy={changeRole.isPending || remove.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({
  member,
  onChangeRole,
  onRemove,
  busy,
}: {
  member: Member;
  onChangeRole: (role: string) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const isOwner = member.role === 'OWNER';
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)]">
        <ShieldCheck className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.fullName || member.email}</p>
        {member.fullName && (
          <p className="truncate text-xs text-[var(--color-muted-foreground)]">{member.email}</p>
        )}
      </div>

      {isOwner ? (
        <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-1 text-xs font-medium">
          Dueño
        </span>
      ) : (
        <select
          className={`${selectCls} w-40 shrink-0`}
          value={member.role}
          onChange={(e) => onChangeRole(e.target.value)}
          disabled={busy}
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      )}

      {!isOwner && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
          onClick={onRemove}
          disabled={busy}
          title="Quitar usuario"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
