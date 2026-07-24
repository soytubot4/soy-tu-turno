'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type {
  InviteMemberInput,
  TurnoCapability,
  UpdateMemberRoleInput,
  UpdateRolesConfigInput,
} from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Member = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  active: boolean;
};

export type RoleConfig = {
  role: 'MANAGER' | 'CASHIER' | 'VIEWER';
  label: string;
  capabilities: TurnoCapability[];
};

export type RolesConfig = {
  canchas: boolean;
  roles: RoleConfig[];
};

export const listMembers = () => apiFetch<Member[]>('/team/members', { tenantSlug: slug() });

export const inviteMember = (input: InviteMemberInput) =>
  apiFetch<Member>('/team/invite', { method: 'POST', body: input, tenantSlug: slug() });

export const updateMemberRole = (id: string, input: UpdateMemberRoleInput) =>
  apiFetch<Member>(`/team/members/${id}/role`, { method: 'PATCH', body: input, tenantSlug: slug() });

export const removeMember = (id: string) =>
  apiFetch<{ id: string }>(`/team/members/${id}`, { method: 'DELETE', tenantSlug: slug() });

export const getRolesConfig = () => apiFetch<RolesConfig>('/team/roles', { tenantSlug: slug() });

export const saveRolesConfig = (input: UpdateRolesConfigInput) =>
  apiFetch<RolesConfig>('/team/roles', { method: 'PUT', body: input, tenantSlug: slug() });
