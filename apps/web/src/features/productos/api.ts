'use client';

import { apiFetch } from '@/lib/api';
import { currentTenantSlug } from '@/lib/current-tenant';
import type { CreateProductInput, UpdateProductInput } from '@soytuturno/shared';

const slug = () => currentTenantSlug();

export type Product = {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  active: boolean;
  imageUrl: string | null;
};

export const listProducts = () => apiFetch<Product[]>('/products', { tenantSlug: slug() });

/** Firma una subida de imagen al bucket tenant-assets. */
export const signUploadUrl = (ext: string) =>
  apiFetch<{ path: string; token: string; publicUrl: string }>('/products/upload-url', {
    method: 'POST',
    body: { ext },
    tenantSlug: slug(),
  });

export const createProduct = (input: CreateProductInput) =>
  apiFetch<{ id: string }>('/products', { method: 'POST', body: input, tenantSlug: slug() });

export const updateProduct = (id: string, input: UpdateProductInput) =>
  apiFetch<{ id: string }>(`/products/${id}`, { method: 'PATCH', body: input, tenantSlug: slug() });

export const deleteProduct = (id: string) =>
  apiFetch<{ id: string }>(`/products/${id}`, { method: 'DELETE', tenantSlug: slug() });
