-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — reseñas/puntuaciones (negocio + profesional).
-- Correr en el SQL editor de Supabase DESPUÉS de 01-turnos.sql. Idempotente.
--
-- RLS especial: el SELECT es PÚBLICO (el rating es info pública que se muestra en
-- la landing/portal sin login), pero el INSERT solo se permite dentro del tenant
-- context (app.tenant_id). Sin UPDATE/DELETE por policy → no se editan reseñas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "reviews" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID NOT NULL,
    "resource_id"    UUID,          -- null = reseña del negocio
    "customer_id"    UUID,
    "appointment_id" UUID,
    "rating"         INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
    "comment"        TEXT,
    "author_name"    TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reviews_tenant_id_idx" ON "reviews"("tenant_id");
CREATE INDEX IF NOT EXISTS "reviews_tenant_id_resource_id_idx" ON "reviews"("tenant_id", "resource_id");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: lectura pública, escritura scopeada al tenant.
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_public_read ON "reviews";
CREATE POLICY reviews_public_read ON "reviews" FOR SELECT USING (true);

DROP POLICY IF EXISTS reviews_tenant_insert ON "reviews";
CREATE POLICY reviews_tenant_insert ON "reviews" FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
