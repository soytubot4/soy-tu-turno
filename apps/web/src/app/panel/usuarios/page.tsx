'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Trash2, ShieldCheck, Save, Undo2, KeyRound } from 'lucide-react';
import {
  ASSIGNABLE_ROLES,
  CAPABILITY_META,
  type TurnoCapability,
  type UpdateRolesConfigInput,
} from '@soytuturno/shared';
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  getRolesConfig,
  saveRolesConfig,
  type Member,
  type RolesConfig,
} from '@/features/usuarios/api';
import { useMe } from '@/features/me/api';
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
  const { me, can } = useMe();
  const canManage = can('team:manage');
  const roleLabels = me?.roleLabels ?? {};
  const labelOf = (r: string) => roleLabels[r] ?? r;

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
    onSuccess: () => {
      toast.success('Usuario eliminado');
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
          Quién puede entrar al panel y qué puede hacer. Cada rol tiene su nombre y sus permisos.
        </p>
      </div>

      {/* Invitar */}
      {canManage && (
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
                      {labelOf(r)}
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
          </CardContent>
        </Card>
      )}

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
              labelOf={labelOf}
              canManage={canManage}
              onChangeRole={(r) => changeRole.mutate({ id: m.id, role: r })}
              onRemove={() => remove.mutate(m.id)}
              busy={changeRole.isPending || remove.isPending}
            />
          ))}
        </ul>
      )}

      {/* Roles y permisos */}
      {canManage && <RolesPermissionsCard />}
    </div>
  );
}

function MemberRow({
  member,
  labelOf,
  canManage,
  onChangeRole,
  onRemove,
  busy,
}: {
  member: Member;
  labelOf: (r: string) => string;
  canManage: boolean;
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

      {isOwner || !canManage ? (
        <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-1 text-xs font-medium">
          {labelOf(member.role)}
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
              {labelOf(r)}
            </option>
          ))}
        </select>
      )}

      {!isOwner && canManage && (
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

// ── Roles y permisos: renombrar cada rol + tildar qué puede hacer ──────────────
type Draft = Record<string, { label: string; caps: Set<TurnoCapability> }>;

function toDraft(cfg: RolesConfig): Draft {
  const d: Draft = {};
  for (const r of cfg.roles) d[r.role] = { label: r.label, caps: new Set(r.capabilities) };
  return d;
}

function draftsEqual(a: Draft, b: Draft): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (!av || !bv) return false;
    if (av.label.trim() !== bv.label.trim()) return false;
    if (av.caps.size !== bv.caps.size) return false;
    for (const c of av.caps) if (!bv.caps.has(c)) return false;
  }
  return true;
}

function RolesPermissionsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['team', 'roles'], queryFn: getRolesConfig });

  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useMemo(() => (data ? toDraft(data) : null), [data]);

  // Sincroniza el borrador cuando llega/cambia la config del server.
  useEffect(() => {
    if (data) setDraft(toDraft(data));
  }, [data]);

  const dirty = !!draft && !!initial && !draftsEqual(draft, initial);

  const save = useMutation({
    mutationFn: () => {
      const labels: Record<string, string> = {};
      const permissions: Record<string, TurnoCapability[]> = {};
      for (const [role, v] of Object.entries(draft ?? {})) {
        labels[role] = v.label.trim();
        permissions[role] = [...v.caps];
      }
      return saveRolesConfig({ labels, permissions } as UpdateRolesConfigInput);
    },
    onSuccess: (cfg) => {
      toast.success('Roles actualizados');
      qc.setQueryData(['team', 'roles'], cfg);
      // Refresca nombres de rol en toda la UI (dropdowns, badges) + permisos del propio user.
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLabel = (role: string, label: string) =>
    setDraft((d) => {
      const cur = d?.[role];
      if (!d || !cur) return d;
      return { ...d, [role]: { ...cur, label } };
    });

  const toggleCap = (role: string, cap: TurnoCapability) =>
    setDraft((d) => {
      const cur = d?.[role];
      if (!d || !cur) return d;
      const caps = new Set(cur.caps);
      if (caps.has(cap)) caps.delete(cap);
      else caps.add(cap);
      return { ...d, [role]: { ...cur, caps } };
    });

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4" /> Roles y permisos
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Poné el nombre que quieras a cada rol (ej: Coordinador, Profesor) y tildá qué puede hacer.
              El Dueño siempre puede todo.
            </p>
          </div>
          {dirty && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => initial && setDraft(structuredCloneDraft(initial))}
                disabled={save.isPending}
              >
                <Undo2 className="h-4 w-4" /> Revertir
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4" /> {save.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          )}
        </div>

        {isLoading || !draft ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
        ) : (
          <div className="space-y-3">
            {ASSIGNABLE_ROLES.map((r) => {
              const row = draft[r];
              if (!row) return null;
              return (
                <div
                  key={r}
                  className="rounded-[var(--radius)] border border-[var(--color-border)] p-3"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Input
                      value={row.label}
                      onChange={(e) => setLabel(r, e.target.value)}
                      className="h-9 w-48 font-medium"
                      placeholder="Nombre del rol"
                      maxLength={40}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CAPABILITY_META.map((c) => {
                      const on = row.caps.has(c.key);
                      return (
                        <label
                          key={c.key}
                          className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius)] border p-2 text-sm transition-colors ${
                            on
                              ? 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]'
                              : 'border-[var(--color-border)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleCap(r, c.key)}
                            className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium leading-tight">{c.label}</span>
                            <span className="block text-xs text-[var(--color-muted-foreground)]">{c.desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Copia profunda del borrador (para "Revertir" sin compartir el Set). */
function structuredCloneDraft(d: Draft): Draft {
  const out: Draft = {};
  for (const [k, v] of Object.entries(d)) out[k] = { label: v.label, caps: new Set(v.caps) };
  return out;
}
