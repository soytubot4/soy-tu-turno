import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateProductInput, UpdateProductInput, BookProductInput } from '@soytuturno/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { requireTenantContext } from '@/prisma/tenant-context';
import { assertCan } from '@/auth/capabilities';

type Tx = Parameters<Parameters<PrismaService['tenantSafe']>[0]>[0];

// Productos comparten el permiso de "servicios" (ambos son la oferta del comercio).
const assertCanWrite = () => assertCan('services:write');

/** Producto para el panel (product-level: 1 producto = 1 variante). */
export type PanelProduct = { id: string; name: string; price: number | null; stock: number; active: boolean; imageUrl: string | null };
/** Producto ofrecible en el portal (una variante). */
export type ProductOffering = { variantId: string; name: string; price: number | null; available: number; imageUrl: string | null };
/** Línea reservada, guardada en el turno. */
export type ReservedProduct = { variantId: string; warehouseId: string; name: string; qty: number; price: number | null };

const nameOf = (product: string, variant: string | null) => (variant ? `${product} — ${variant}` : product);

/**
 * Productos de soytuturno = se REUTILIZAN las tablas de soytuadmin (misma DB):
 * products + product_variants + stock_levels + price_list_items. Cada producto se
 * crea con 1 variante, stock en el depósito default y precio en la lista default
 * (auto-crea "Principal" y "Lista General" si el tenant no las tiene). Así, si el
 * comercio después paga soytuadmin, sus productos ya están cargados.
 *
 * Nota: la conexión es por el pooler (pgbouncer), así que los params uuid se
 * castean explícitamente con ::uuid (si no, Postgres tira "uuid = text").
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Depósito + lista de precios default del tenant (los crea si no existen). */
  private async ensureDefaults(tx: Tx, tenantId: string): Promise<{ warehouseId: string; priceListId: string }> {
    let wh = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM warehouses WHERE tenant_id = $1::uuid AND is_default = true LIMIT 1`,
      tenantId,
    );
    if (!wh.length) {
      wh = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO warehouses (tenant_id, name, code, is_default) VALUES ($1::uuid, 'Principal', 'PRAL', true) RETURNING id`,
        tenantId,
      );
    }
    let pl = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM price_lists WHERE tenant_id = $1::uuid AND is_default = true LIMIT 1`,
      tenantId,
    );
    if (!pl.length) {
      pl = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO price_lists (tenant_id, name, is_default) VALUES ($1::uuid, 'Lista General', true) RETURNING id`,
        tenantId,
      );
    }
    return { warehouseId: wh[0]!.id, priceListId: pl[0]!.id };
  }

  /** La primera variante de un producto del tenant (los de soytuturno tienen 1 sola). */
  private async variantOf(tx: Tx, tenantId: string, productId: string): Promise<string | null> {
    const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM product_variants WHERE product_id = $1::uuid AND tenant_id = $2::uuid ORDER BY created_at LIMIT 1`,
      productId,
      tenantId,
    );
    return rows.length ? rows[0]!.id : null;
  }

  // ── Panel (CRUD) ────────────────────────────────────────────
  list(): Promise<PanelProduct[]> {
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        { product_id: string; name: string; active: boolean; price: number | null; stock: number; image_url: string | null }[]
      >(
        `SELECT p.id AS product_id, p.name, p.active,
                pli.price::float8 AS price,
                COALESCE(sl.quantity, 0)::int AS stock,
                (SELECT url FROM product_images WHERE product_id = p.id AND tenant_id = $1::uuid ORDER BY sort_order LIMIT 1) AS image_url
           FROM products p
           JOIN LATERAL (
             SELECT id FROM product_variants WHERE product_id = p.id AND tenant_id = $1::uuid ORDER BY created_at LIMIT 1
           ) v ON true
           LEFT JOIN warehouses w ON w.tenant_id = $1::uuid AND w.is_default = true
           LEFT JOIN stock_levels sl ON sl.variant_id = v.id AND sl.warehouse_id = w.id
           LEFT JOIN price_lists pl ON pl.tenant_id = $1::uuid AND pl.is_default = true
           LEFT JOIN price_list_items pli ON pli.variant_id = v.id AND pli.price_list_id = pl.id
          WHERE p.tenant_id = $1::uuid
          ORDER BY p.name`,
        ctx.tenantId,
      );
      return rows.map((r) => ({
        id: r.product_id,
        name: r.name,
        price: r.price != null ? Number(r.price) : null,
        stock: Number(r.stock),
        active: r.active,
        imageUrl: r.image_url ?? null,
      }));
    });
  }

  create(input: CreateProductInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const { warehouseId, priceListId } = await this.ensureDefaults(tx, ctx.tenantId);
      const prod = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO products (tenant_id, name, updated_at) VALUES ($1::uuid, $2, now()) RETURNING id`,
        ctx.tenantId,
        input.name.trim(),
      );
      const productId = prod[0]!.id;
      const varr = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO product_variants (tenant_id, product_id, sku, updated_at)
         VALUES ($1::uuid, $2::uuid, 'TT-' || left(replace(gen_random_uuid()::text, '-', ''), 8), now()) RETURNING id`,
        ctx.tenantId,
        productId,
      );
      const variantId = varr[0]!.id;
      await tx.$executeRawUnsafe(
        `INSERT INTO stock_levels (tenant_id, variant_id, warehouse_id, quantity, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, now())`,
        ctx.tenantId,
        variantId,
        warehouseId,
        input.stock ?? 0,
      );
      if (input.price != null) {
        await tx.$executeRawUnsafe(
          `INSERT INTO price_list_items (tenant_id, price_list_id, variant_id, price, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, now())`,
          ctx.tenantId,
          priceListId,
          variantId,
          input.price,
        );
      }
      if (input.imageUrl) {
        await tx.$executeRawUnsafe(
          `INSERT INTO product_images (tenant_id, product_id, url) VALUES ($1::uuid, $2::uuid, $3)`,
          ctx.tenantId,
          productId,
          input.imageUrl,
        );
      }
      return { id: productId };
    });
  }

  update(id: string, input: UpdateProductInput) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      const variantId = await this.variantOf(tx, ctx.tenantId, id);
      if (!variantId) throw new NotFoundException('Producto no encontrado');
      const { warehouseId, priceListId } = await this.ensureDefaults(tx, ctx.tenantId);

      if (input.name !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE products SET name = $1, updated_at = now() WHERE id = $2::uuid AND tenant_id = $3::uuid`,
          input.name.trim(),
          id,
          ctx.tenantId,
        );
      }
      if (input.active !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE products SET active = $1, updated_at = now() WHERE id = $2::uuid AND tenant_id = $3::uuid`,
          input.active,
          id,
          ctx.tenantId,
        );
      }
      if (input.stock !== undefined) {
        const stock = input.stock ?? 0;
        const n = await tx.$executeRawUnsafe(
          `UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE variant_id = $2::uuid AND warehouse_id = $3::uuid AND tenant_id = $4::uuid`,
          stock,
          variantId,
          warehouseId,
          ctx.tenantId,
        );
        if (!n) {
          await tx.$executeRawUnsafe(
            `INSERT INTO stock_levels (tenant_id, variant_id, warehouse_id, quantity, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, now())`,
            ctx.tenantId,
            variantId,
            warehouseId,
            stock,
          );
        }
      }
      if (input.price !== undefined) {
        if (input.price == null) {
          await tx.$executeRawUnsafe(
            `DELETE FROM price_list_items WHERE variant_id = $1::uuid AND price_list_id = $2::uuid AND tenant_id = $3::uuid`,
            variantId,
            priceListId,
            ctx.tenantId,
          );
        } else {
          const n = await tx.$executeRawUnsafe(
            `UPDATE price_list_items SET price = $1, updated_at = now() WHERE variant_id = $2::uuid AND price_list_id = $3::uuid AND tenant_id = $4::uuid`,
            input.price,
            variantId,
            priceListId,
            ctx.tenantId,
          );
          if (!n) {
            await tx.$executeRawUnsafe(
              `INSERT INTO price_list_items (tenant_id, price_list_id, variant_id, price, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, now())`,
              ctx.tenantId,
              priceListId,
              variantId,
              input.price,
            );
          }
        }
      }
      if (input.imageUrl !== undefined) {
        await tx.$executeRawUnsafe(
          `DELETE FROM product_images WHERE product_id = $1::uuid AND tenant_id = $2::uuid`,
          id,
          ctx.tenantId,
        );
        if (input.imageUrl) {
          await tx.$executeRawUnsafe(
            `INSERT INTO product_images (tenant_id, product_id, url) VALUES ($1::uuid, $2::uuid, $3)`,
            ctx.tenantId,
            id,
            input.imageUrl,
          );
        }
      }
      return { id };
    });
  }

  remove(id: string) {
    assertCanWrite();
    const ctx = requireTenantContext();
    return this.prisma.tenantSafe(async (tx) => {
      // ON DELETE CASCADE limpia variantes, stock_levels y price_list_items.
      const n = await tx.$executeRawUnsafe(
        `DELETE FROM products WHERE id = $1::uuid AND tenant_id = $2::uuid`,
        id,
        ctx.tenantId,
      );
      if (!n) throw new NotFoundException('Producto no encontrado');
      return { id };
    });
  }

  // ── Portal (ofertas + reserva) ──────────────────────────────
  async offerings(tx: Tx, tenantId: string): Promise<ProductOffering[]> {
    const rows = await tx.$queryRawUnsafe<
      { variant_id: string; product_name: string; variant_name: string | null; price: number | null; available: number; image_url: string | null }[]
    >(
      `SELECT v.id AS variant_id, p.name AS product_name, NULLIF(v.name, '') AS variant_name,
              pli.price::float8 AS price,
              GREATEST(0, COALESCE(sl.quantity, 0) - COALESCE(sl.reserved, 0))::int AS available,
              (SELECT url FROM product_images WHERE product_id = p.id AND tenant_id = $1::uuid ORDER BY sort_order LIMIT 1) AS image_url
         FROM product_variants v
         JOIN products p ON p.id = v.product_id AND p.tenant_id = $1::uuid AND p.active = true
         JOIN warehouses w ON w.tenant_id = $1::uuid AND w.is_default = true
         JOIN stock_levels sl ON sl.variant_id = v.id AND sl.warehouse_id = w.id AND sl.tenant_id = $1::uuid
         LEFT JOIN price_lists pl ON pl.tenant_id = $1::uuid AND pl.is_default = true
         LEFT JOIN price_list_items pli ON pli.variant_id = v.id AND pli.price_list_id = pl.id AND pli.tenant_id = $1::uuid
        WHERE v.tenant_id = $1::uuid AND v.active = true
        ORDER BY p.name, v.name`,
      tenantId,
    );
    return rows.map((r) => ({
      variantId: r.variant_id,
      name: nameOf(r.product_name, r.variant_name),
      price: r.price != null ? Number(r.price) : null,
      available: Number(r.available),
      imageUrl: r.image_url ?? null,
    }));
  }

  /** Reserva (incrementa reserved) las variantes elegidas, DENTRO de la tx del turno. */
  async reserve(tx: Tx, tenantId: string, items: BookProductInput[]): Promise<ReservedProduct[]> {
    if (!items.length) return [];
    const wh = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM warehouses WHERE tenant_id = $1::uuid AND is_default = true LIMIT 1`,
      tenantId,
    );
    if (!wh.length) throw new ConflictException('El comercio no tiene depósito configurado');
    const warehouseId = wh[0]!.id;

    const lines: ReservedProduct[] = [];
    for (const it of items) {
      const rows = await tx.$queryRawUnsafe<
        { product_name: string; variant_name: string | null; quantity: number | null; reserved: number | null; price: number | null }[]
      >(
        `SELECT p.name AS product_name, NULLIF(v.name, '') AS variant_name,
                sl.quantity, sl.reserved, pli.price::float8 AS price
           FROM product_variants v
           JOIN products p ON p.id = v.product_id AND p.tenant_id = $1::uuid
           JOIN stock_levels sl ON sl.variant_id = v.id AND sl.warehouse_id = $2::uuid AND sl.tenant_id = $1::uuid
           LEFT JOIN price_lists pl ON pl.tenant_id = $1::uuid AND pl.is_default = true
           LEFT JOIN price_list_items pli ON pli.variant_id = v.id AND pli.price_list_id = pl.id AND pli.tenant_id = $1::uuid
          WHERE v.id = $3::uuid AND v.tenant_id = $1::uuid AND v.active = true
          LIMIT 1`,
        tenantId,
        warehouseId,
        it.variantId,
      );
      if (!rows.length) throw new ConflictException('Alguno de los productos ya no está disponible');
      const r = rows[0]!;
      const name = nameOf(r.product_name, r.variant_name);
      const available = Number(r.quantity ?? 0) - Number(r.reserved ?? 0);
      if (available < it.qty) throw new ConflictException(`No hay stock suficiente de ${name}`);
      await tx.$executeRawUnsafe(
        `UPDATE stock_levels SET reserved = COALESCE(reserved, 0) + $1, updated_at = now()
          WHERE variant_id = $2::uuid AND warehouse_id = $3::uuid AND tenant_id = $4::uuid`,
        it.qty,
        it.variantId,
        warehouseId,
        tenantId,
      );
      lines.push({ variantId: it.variantId, warehouseId, name, qty: it.qty, price: r.price != null ? Number(r.price) : null });
    }
    return lines;
  }

  /** Devuelve (decrementa reserved) los productos reservados de un turno cancelado. */
  async restore(tx: Tx, tenantId: string, reserved: unknown): Promise<void> {
    if (!Array.isArray(reserved)) return;
    for (const line of reserved) {
      const v = (line as ReservedProduct)?.variantId;
      const w = (line as ReservedProduct)?.warehouseId;
      const qty = (line as ReservedProduct)?.qty;
      if (typeof v === 'string' && typeof w === 'string' && typeof qty === 'number' && qty > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE stock_levels SET reserved = GREATEST(0, COALESCE(reserved, 0) - $1), updated_at = now()
            WHERE variant_id = $2::uuid AND warehouse_id = $3::uuid AND tenant_id = $4::uuid`,
          qty,
          v,
          w,
          tenantId,
        );
      }
    }
  }
}
