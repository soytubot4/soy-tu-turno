-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — profesores y sus horarios de clase.
--
-- Un profesor da clases en ciertas canchas, ciertos días y horarios. Esas
-- franjas dejan de ofrecerse para reservar: la cancha está ocupada por la clase.
-- El socio no ve al profesor, solo ve que ese horario no está disponible.
--
-- Se repiten todas las semanas (day_of_week), con "desde/hasta" opcional para
-- los ciclos que arrancan y terminan en el año.
--
-- Idempotente. Aplicar con:
--   pnpm --filter @soytuturno/db exec prisma db execute --file sql/10-instructors.sql --schema prisma/schema.prisma
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "instructors" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID NOT NULL,
    "name"       TEXT NOT NULL,
    "phone"      TEXT,
    "notes"      TEXT,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "instructors_tenant_id_idx" ON "instructors"("tenant_id");

-- Una franja de clase: día de la semana + horario + en qué cancha.
CREATE TABLE IF NOT EXISTS "instructor_slots" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    -- La cancha que ocupa la clase. Null = todas (ej: el club entero cierra).
    "resource_id"   UUID,
    "day_of_week"   INTEGER NOT NULL,   -- 0=Dom … 6=Sáb (igual que resource_schedules)
    "start_time"    TEXT NOT NULL,      -- 'HH:MM'
    "end_time"      TEXT NOT NULL,      -- 'HH:MM'
    "label"         TEXT,               -- ej: "Escuelita", "Clase adultos"
    -- Vigencia opcional del ciclo de clases (marzo a noviembre, por ejemplo).
    "starts_on"     DATE,
    "ends_on"       DATE,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instructor_slots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "instructor_slots_tenant_id_day_idx"
  ON "instructor_slots"("tenant_id", "day_of_week");
CREATE INDEX IF NOT EXISTS "instructor_slots_instructor_id_idx"
  ON "instructor_slots"("instructor_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_tenant_id_fkey') THEN
    ALTER TABLE "instructors" ADD CONSTRAINT "instructors_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructor_slots_tenant_id_fkey') THEN
    ALTER TABLE "instructor_slots" ADD CONSTRAINT "instructor_slots_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructor_slots_instructor_id_fkey') THEN
    ALTER TABLE "instructor_slots" ADD CONSTRAINT "instructor_slots_instructor_id_fkey"
      FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- Si borran la cancha, la franja se va con ella (ya no tiene dónde dictarse).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructor_slots_resource_id_fkey') THEN
    ALTER TABLE "instructor_slots" ADD CONSTRAINT "instructor_slots_resource_id_fkey"
      FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: mismo aislamiento por tenant que el resto de las tablas de turnos.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['instructors', 'instructor_slots'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      tbl
    );
  END LOOP;
END $$;
