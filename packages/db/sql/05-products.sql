-- ─────────────────────────────────────────────────────────────
-- Productos en soytuturno = se reutilizan las tablas de soytuadmin (misma DB):
--   products + product_variants + stock_levels + price_list_items
-- El CRUD de soytuturno inserta ahí (crea el producto con 1 variante, stock en
-- el depósito default y precio en la lista default; auto-crea "Principal" y
-- "Lista General" si el tenant no las tiene). Así, si el comercio después paga
-- soytuadmin, sus productos ya están cargados → traspaso directo.
--
-- NO se crea ninguna tabla nueva. Lo único propio es la columna que guarda, en
-- el turno, qué se reservó (ya corrida):
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "products" JSONB;
