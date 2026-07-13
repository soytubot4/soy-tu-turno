'use client';

import { apiFetch } from '@/lib/api';

export type Business = {
  slug: string;
  name: string;
  businessType: string;
  logoUrl: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number;
};

export const listBusinesses = (q?: string) =>
  apiFetch<Business[]>(`/public/businesses${q ? `?q=${encodeURIComponent(q)}` : ''}`);
