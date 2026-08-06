-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — excepciones de una clase para una fecha puntual.
--
-- La clase semanal del profe queda intacta; acá se guarda lo que cambia SOLO
-- ese día: se movió de horario, se cambió de cancha, o directamente no hay.
--
-- Idempotente. Aplicar con:
--   pnpm --filter @soytuturno/db exec prisma db execute --file sql/12-class-exceptions.sql --schema prisma/schema.prisma
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "instructor_slot_exceptions" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID NOT NULL,
    "slot_id"     UUID NOT NULL,
    "date"        DATE NOT NULL,
    -- true = ese día no hay clase (la cancha queda libre).
    "cancelled"   BOOLEAN NOT NULL DEFAULT false,
    -- Si se movió: horario y/o cancha solo para esa fecha. NULL = como siempre.
    "start_time"  TEXT,
    "end_time"    TEXT,
    "resource_id" UUID,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instructor_slot_exceptions_pkey" PRIMARY KEY ("id")
);
-- Una sola excepción por clase y fecha.
CREATE UNIQUE INDEX IF NOT EXISTS "instructor_slot_exceptions_slot_date_key"
  ON "instructor_slot_exceptions"("slot_id", "date");
CREATE INDEX IF NOT EXISTS "instructor_slot_exceptions_tenant_date_idx"
  ON "instructor_slot_exceptions"("tenant_id", "date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructor_slot_exceptions_tenant_id_fkey') THEN
    ALTER TABLE "instructor_slot_exceptions" ADD CONSTRAINT "instructor_slot_exceptions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructor_slot_exceptions_slot_id_fkey') THEN
    ALTER TABLE "instructor_slot_exceptions" ADD CONSTRAINT "instructor_slot_exceptions_slot_id_fkey"
      FOREIGN KEY ("slot_id") REFERENCES "instructor_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructor_slot_exceptions_resource_id_fkey') THEN
    ALTER TABLE "instructor_slot_exceptions" ADD CONSTRAINT "instructor_slot_exceptions_resource_id_fkey"
      FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: mismo aislamiento por tenant que el resto.
ALTER TABLE "instructor_slot_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instructor_slot_exceptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "instructor_slot_exceptions";
CREATE POLICY tenant_isolation ON "instructor_slot_exceptions"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
