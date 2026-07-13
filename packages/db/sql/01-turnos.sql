-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — tablas de turnos sobre la DB compartida.
-- Correr en el SQL editor de Supabase (mismo proyecto que soytucanje/soyuadmin).
-- Idempotente. Las tablas compartidas se tocan SOLO para agregar columnas nuevas
-- (ADD COLUMN IF NOT EXISTS, retrocompatible: los otros apps las ignoran).
-- ═══════════════════════════════════════════════════════════════════════════

-- Necesaria para la exclusion constraint (rangos + igualdad en el mismo índice).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Columnas nuevas en la tabla COMPARTIDA "tenants" ───
-- soytuturno guarda su config por comercio (zona horaria, anticipación, etc.) en
-- tenants.turno_config. `currency` puede ya existir; el IF NOT EXISTS lo respeta.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "turno_config" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'ARS';

-- Helper de RLS (ya existe en la DB compartida; lo dejamos por idempotencia).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
$$;

-- ─── Enums ───
DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AppointmentSource" AS ENUM ('ADMIN','WEB','WHATSAPP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── services ───
CREATE TABLE IF NOT EXISTS "services" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "duration_min" INTEGER NOT NULL,
    "price"        DECIMAL(14,2),
    "color"        TEXT,
    "active"       BOOLEAN NOT NULL DEFAULT true,
    "sort_order"   INTEGER NOT NULL DEFAULT 0,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "services_tenant_id_idx" ON "services"("tenant_id");
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── resources (profesional / box / silla) ───
CREATE TABLE IF NOT EXISTS "resources" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID NOT NULL,
    "name"       TEXT NOT NULL,
    "title"      TEXT,
    "avatar_url" TEXT,
    "color"      TEXT,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "user_id"    UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "resources_tenant_id_idx" ON "resources"("tenant_id");
ALTER TABLE "resources" ADD CONSTRAINT "resources_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── resource_services (N:N recurso ↔ servicio) ───
CREATE TABLE IF NOT EXISTS "resource_services" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "service_id"  UUID NOT NULL,
    CONSTRAINT "resource_services_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_services_resource_id_service_id_key" ON "resource_services"("resource_id", "service_id");
CREATE INDEX IF NOT EXISTS "resource_services_tenant_id_idx" ON "resource_services"("tenant_id");
ALTER TABLE "resource_services" ADD CONSTRAINT "resource_services_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_services" ADD CONSTRAINT "resource_services_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_services" ADD CONSTRAINT "resource_services_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── resource_schedules (horario semanal por recurso, con franjas) ───
CREATE TABLE IF NOT EXISTS "resource_schedules" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL, -- 0=Dom .. 6=Sáb
    "ranges"      JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_schedules_resource_id_day_of_week_key" ON "resource_schedules"("resource_id", "day_of_week");
CREATE INDEX IF NOT EXISTS "resource_schedules_tenant_id_idx" ON "resource_schedules"("tenant_id");
ALTER TABLE "resource_schedules" ADD CONSTRAINT "resource_schedules_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_schedules" ADD CONSTRAINT "resource_schedules_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── schedule_blocks (feriados / bloqueos / vacaciones) ───
CREATE TABLE IF NOT EXISTS "schedule_blocks" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID NOT NULL,
    "resource_id" UUID,          -- null = todo el local
    "date"        DATE NOT NULL,
    "all_day"     BOOLEAN NOT NULL DEFAULT true,
    "start_at"    TIMESTAMPTZ(3),
    "end_at"      TIMESTAMPTZ(3),
    "reason"      TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "schedule_blocks_tenant_id_date_idx" ON "schedule_blocks"("tenant_id", "date");
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── appointments (el turno) ───
CREATE TABLE IF NOT EXISTS "appointments" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID NOT NULL,
    "customer_id"      UUID NOT NULL,
    "resource_id"      UUID NOT NULL,
    "service_id"       UUID NOT NULL,
    "start_at"         TIMESTAMPTZ(3) NOT NULL,
    "end_at"           TIMESTAMPTZ(3) NOT NULL,
    "status"           "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "source"           "AppointmentSource" NOT NULL DEFAULT 'ADMIN',
    "price_at_booking" DECIMAL(14,2),
    "notes"            TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_start_at_idx" ON "appointments"("tenant_id", "start_at");
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_resource_id_start_at_idx" ON "appointments"("tenant_id", "resource_id", "start_at");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 🔒 ANTI-DOBLE-TURNO: impide dos turnos solapados en el MISMO recurso
-- (a nivel base, sirve igual venga de web, whatsapp o admin). Ignora cancelados.
DO $$ BEGIN
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap"
    EXCLUDE USING gist (
      "resource_id" WITH =,
      tstzrange("start_at", "end_at") WITH &&
    ) WHERE ("status" <> 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS por tenant en todas las tablas nuevas ───
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'services', 'resources', 'resource_services',
    'resource_schedules', 'schedule_blocks', 'appointments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      tbl
    );
  END LOOP;
END $$;
