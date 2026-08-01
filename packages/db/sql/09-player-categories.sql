-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — categorías de persona configurables por el club.
--
-- Reemplaza los precios fijos socio/abono/no-socio que vivían en
-- tenants.turno_config (priceSocioAbono, priceSocioSinAbono, priceNoSocio +
-- sus variantes *Wknd). Ahora cada club define su propia lista de categorías
-- con precio entre semana / fin de semana, y al reservar cada persona elige la
-- suya → el total del turno es la suma de las personas.
--
-- Idempotente. Aplicar con:
--   pnpm --filter @soytuturno/db exec prisma db execute --file sql/09-player-categories.sql --schema prisma/schema.prisma
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "player_categories" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID NOT NULL,
    "name"          TEXT NOT NULL,
    -- Null = sin precio configurado (no suma). Para "no paga" usar 0.
    "price"         DECIMAL(14,2),
    "price_weekend" DECIMAL(14,2),
    "sort_order"    INTEGER NOT NULL DEFAULT 0,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_categories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "player_categories_tenant_id_idx" ON "player_categories"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_categories_tenant_id_fkey') THEN
    ALTER TABLE "player_categories" ADD CONSTRAINT "player_categories_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: mismo aislamiento por tenant que el resto de las tablas de turnos.
ALTER TABLE "player_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "player_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "player_categories";
CREATE POLICY tenant_isolation ON "player_categories"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- El turno guarda a qué categoría pertenecía cada persona (dentro del JSON
-- players), así que no hace falta columna nueva en appointments.

-- ─── Migración de los precios que ya estaban cargados ───
-- Por cada tenant con askPlayers, creamos las 3 categorías históricas con el
-- precio que tenía en turno_config. Solo si el tenant todavía no tiene ninguna.
INSERT INTO "player_categories" ("tenant_id", "name", "price", "price_weekend", "sort_order")
SELECT t.id, v.name, v.price, v.price_weekend, v.sort_order
FROM "tenants" t
CROSS JOIN LATERAL (VALUES
  ('Socio con abono de tenis',
   (t.turno_config->>'priceSocioAbono')::decimal,
   (t.turno_config->>'priceSocioAbonoWknd')::decimal, 0),
  ('Socio sin abono de tenis',
   (t.turno_config->>'priceSocioSinAbono')::decimal,
   (t.turno_config->>'priceSocioSinAbonoWknd')::decimal, 1),
  ('No socio',
   (t.turno_config->>'priceNoSocio')::decimal,
   (t.turno_config->>'priceNoSocioWknd')::decimal, 2)
) AS v(name, price, price_weekend, sort_order)
WHERE t.turno_config->>'askPlayers' = 'true'
  AND NOT EXISTS (SELECT 1 FROM "player_categories" pc WHERE pc.tenant_id = t.id);
