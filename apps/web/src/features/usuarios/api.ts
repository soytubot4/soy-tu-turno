'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { InviteMemberInput, UpdateMemberRoleInput } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Member = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  active: boolean;
};

export const listMembers = () => apiFetch<Member[]>('/team/members', { tenantSlug: slug() });

export const inviteMember = (input: InviteMemberInput) =>
  apiFetch<Member>('/team/invite', { method: 'POST', body: input, tenantSlug: slug() });

export const updateMemberRole = (id: string, input: UpdateMemberRoleInput) =>
  apiFetch<Member>(`/team/members/${id}/role`, { method: 'PATCH', body: input, tenantSlug: slug() });

export const removeMember = (id: string) =>
  apiFetch<{ id: string }>(`/team/members/${id}`, { method: 'DELETE', tenantSlug: slug() });
