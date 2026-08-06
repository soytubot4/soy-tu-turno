-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — turnos fijos.
--
-- Un socio tiene la cancha reservada todas las semanas (ej: martes 19:00,
-- Cancha 1). Guardamos la REGLA y a partir de ella se generan turnos concretos
-- de las próximas semanas, que se comportan como cualquier otro turno: se ven
-- en la agenda, se cobran, y se puede cancelar uno suelto sin perder el resto.
--
-- La vigencia es opcional: sin fecha de fin se renueva solo hasta que el club
-- lo da de baja; con fecha de fin (ej: "te doy la cancha hasta el 30/09") se
-- generan turnos hasta ahí y después el horario se libera solo.
--
-- Idempotente. Aplicar con:
--   pnpm --filter @soytuturno/db exec prisma db execute --file sql/11-recurring.sql --schema prisma/schema.prisma
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "recurring_appointments" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID NOT NULL,
    "customer_id"       UUID NOT NULL,
    "resource_id"       UUID NOT NULL,
    "service_id"        UUID NOT NULL,
    "day_of_week"       INTEGER NOT NULL,   -- 0=Dom … 6=Sáb
    "start_time"        TEXT NOT NULL,      -- 'HH:MM'
    "active"            BOOLEAN NOT NULL DEFAULT true,
    -- Vigencia opcional. NULL = hasta que lo den de baja.
    "starts_on"         DATE,
    "ends_on"           DATE,
    -- Hasta qué fecha ya se generaron turnos. Evita rehacer el trabajo y saber
    -- desde dónde seguir cuando toca renovar.
    "generated_until"   DATE,
    "notes"             TEXT,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurring_appointments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "recurring_appointments_tenant_active_idx"
  ON "recurring_appointments"("tenant_id", "active");

-- El turno generado recuerda de qué regla salió: así al dar de baja se pueden
-- limpiar los futuros, y en la agenda se distingue de un turno suelto.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "recurring_id" UUID;
CREATE INDEX IF NOT EXISTS "appointments_recurring_id_idx" ON "appointments"("recurring_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_appointments_tenant_id_fkey') THEN
    ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_appointments_customer_id_fkey') THEN
    ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_appointments_resource_id_fkey') THEN
    ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_resource_id_fkey"
      FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_appointments_service_id_fkey') THEN
    ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_service_id_fkey"
      FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- El turno NO se borra si se borra la regla: queda el histórico de lo agendado.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_recurring_id_fkey') THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_recurring_id_fkey"
      FOREIGN KEY ("recurring_id") REFERENCES "recurring_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: mismo aislamiento por tenant que el resto de las tablas de turnos.
ALTER TABLE "recurring_appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_appointments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "recurring_appointments";
CREATE POLICY tenant_isolation ON "recurring_appointments"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
