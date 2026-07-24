'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Package } from 'lucide-react';
import { listProducts, createProduct, updateProduct, deleteProduct, type Product } from '@/features/productos/api';
import { useMe } from '@/features/me/api';
import { ProductImageUpload } from '@/components/product-image-upload';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceField } from '@/components/ui/price-input';
import { Label } from '@/components/ui/label';

export default function ProductosPage() {
  const qc = useQueryClient();
  const { can, canchas } = useMe();
  const canWrite = can('services:write');
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: listProducts });

  // Ejemplo según el rubro (club vs. peluquería/barbería/otro).
  const example = canchas ? 'Pelotas de tenis' : 'Cera para peinar';

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });

  const create = useMutation({
    mutationFn: () =>
      createProduct({
        name: name.trim(),
        price: price.trim() ? Number(price) : null,
        stock: stock.trim() ? Number(stock) : undefined,
        active: true,
        imageUrl,
      }),
    onSuccess: () => {
      toast.success('Producto creado');
      setName('');
      setPrice('');
      setStock('');
      setImageUrl(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: (p: Product) => updateProduct(p.id, { active: !p.active }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      toast.success('Producto eliminado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = products ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Productos</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Lo que ofrecés para reservar junto con el turno (ej: {canchas ? 'pelotas, cubregrips' : 'cera, gel, shampoo'}).
          Al reservar se le separa del stock al cliente.
        </p>
      </div>

      {canWrite && (
        <Card>
          <CardContent className="pt-5">
            <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label>Foto</Label>
                <ProductImageUpload value={imageUrl} onChange={setImageUrl} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={example} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Precio (opcional)</Label>
                <PriceField value={price} onChange={setPrice} className="w-32" placeholder="—" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Stock</Label>
                <Input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-28"
                  placeholder="0"
                  min={0}
                />
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Todavía no cargaste productos.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
          {list.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              canWrite={canWrite}
              onToggle={() => toggleActive.mutate(p)}
              onRemove={() => remove.mutate(p.id)}
              toggling={toggleActive.isPending}
              removing={remove.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductRow({
  product,
  canWrite,
  onToggle,
  onRemove,
  toggling,
  removing,
}: {
  product: Product;
  canWrite: boolean;
  onToggle: () => void;
  onRemove: () => void;
  toggling: boolean;
  removing: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(product.price != null ? String(product.price) : '');
  const [stock, setStock] = useState(String(product.stock));
  const [imageUrl, setImageUrl] = useState<string | null>(product.imageUrl);

  const save = useMutation({
    mutationFn: () =>
      updateProduct(product.id, {
        name: name.trim(),
        price: price.trim() ? Number(price) : null,
        stock: stock.trim() ? Number(stock) : 0,
        imageUrl,
      }),
    onSuccess: () => {
      toast.success('Producto actualizado');
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit() {
    setName(product.name);
    setPrice(product.price != null ? String(product.price) : '');
    setStock(String(product.stock));
    setImageUrl(product.imageUrl);
    setEditing(true);
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-end gap-2 p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Foto</Label>
          <ProductImageUpload value={imageUrl} onChange={setImageUrl} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Precio</Label>
          <PriceField value={price} onChange={setPrice} className="w-28" placeholder="—" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-[var(--color-muted-foreground)]">Stock</Label>
          <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-24" min={0} />
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
          Cancelar
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 p-3">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-[var(--radius)] object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
          <Package className="h-4 w-4 text-[var(--color-muted-foreground)]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="truncate text-xs text-[var(--color-muted-foreground)]">
          {product.price != null && <span>${product.price.toLocaleString('es-AR')} · </span>}
          {product.stock} en stock
        </p>
      </div>
      {canWrite && (
        <Button variant="ghost" size="icon" onClick={startEdit} title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant={product.active ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggle}
        disabled={toggling || !canWrite}
      >
        {product.active ? 'Activo' : 'Inactivo'}
      </Button>
      {canWrite && (
        <Button
          variant="ghost"
          size="icon"
          className="text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
          onClick={onRemove}
          disabled={removing}
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
