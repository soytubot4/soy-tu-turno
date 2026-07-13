-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — SEED de prueba: comercio "Willy" (barbería, Argentina).
-- Correr en el SQL editor de Supabase DESPUÉS de 01-turnos.sql. Idempotente
-- (podés correrlo varias veces). No crea usuario de login: sirve para probar el
-- PORTAL público (willy.<dominio>) sin sesión. Para el panel de gestión hay que
-- invitar a un dueño desde soyuadmin.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Comercio ───
INSERT INTO "tenants" ("slug", "name", "phone", "owner_name", "enabled_products", "turno_config", "currency", "updated_at")
VALUES (
  'willy',
  'Willy',
  '549416962766',
  'Guillermo Ayala',
  ARRAY['soytuturno'],
  '{"timezone":"America/Argentina/Buenos_Aires","slotStepMin":15,"minLeadMinutes":0,"paymentMethods":["efectivo","transferencia"],"transferAlias":"willy.23.27"}'::jsonb,
  'ARS',
  now()
)
ON CONFLICT ("slug") DO UPDATE SET
  "enabled_products" = ARRAY(SELECT DISTINCT unnest("tenants"."enabled_products" || '{soytuturno}'::text[])),
  "turno_config"     = EXCLUDED."turno_config",
  "updated_at"       = now();

-- ─── Servicio: Corte de pelo ───
INSERT INTO "services" ("tenant_id", "name", "description", "duration_min", "price", "active", "sort_order")
SELECT t."id", 'Corte de pelo',
       'Incluye corte de pelo, barba, lavado y peinado con productos', 30, 15000, true, 0
FROM "tenants" t
WHERE t."slug" = 'willy'
  AND NOT EXISTS (
    SELECT 1 FROM "services" s WHERE s."tenant_id" = t."id" AND s."name" = 'Corte de pelo'
  );

-- ─── Profesional: Guillermo Ayala ───
INSERT INTO "resources" ("tenant_id", "name", "title", "active", "sort_order")
SELECT t."id", 'Guillermo Ayala', 'Barbero', true, 0
FROM "tenants" t
WHERE t."slug" = 'willy'
  AND NOT EXISTS (
    SELECT 1 FROM "resources" r WHERE r."tenant_id" = t."id" AND r."name" = 'Guillermo Ayala'
  );

-- ─── El profesional ofrece el servicio ───
INSERT INTO "resource_services" ("tenant_id", "resource_id", "service_id")
SELECT t."id", r."id", s."id"
FROM "tenants" t
JOIN "resources" r ON r."tenant_id" = t."id" AND r."name" = 'Guillermo Ayala'
JOIN "services"  s ON s."tenant_id" = t."id" AND s."name" = 'Corte de pelo'
WHERE t."slug" = 'willy'
ON CONFLICT ("resource_id", "service_id") DO NOTHING;

-- ─── Horario semanal (0=Dom .. 6=Sáb). Lun y Dom cerrados (sin fila). ───
INSERT INTO "resource_schedules" ("tenant_id", "resource_id", "day_of_week", "ranges", "updated_at")
SELECT t."id", r."id", d.dow, d.ranges::jsonb, now()
FROM "tenants" t
JOIN "resources" r ON r."tenant_id" = t."id" AND r."name" = 'Guillermo Ayala'
CROSS JOIN (VALUES
  (2, '[{"from":"08:00","to":"12:30"},{"from":"15:00","to":"20:00"}]'),  -- Martes
  (3, '[{"from":"08:00","to":"12:30"},{"from":"15:00","to":"20:00"}]'),  -- Miércoles
  (4, '[{"from":"08:00","to":"12:30"},{"from":"15:00","to":"20:00"}]'),  -- Jueves
  (5, '[{"from":"08:00","to":"12:30"},{"from":"15:00","to":"20:00"}]'),  -- Viernes
  (6, '[{"from":"08:00","to":"13:00"},{"from":"15:00","to":"20:00"}]')   -- Sábado
) AS d(dow, ranges)
WHERE t."slug" = 'willy'
ON CONFLICT ("resource_id", "day_of_week") DO UPDATE SET
  "ranges"     = EXCLUDED."ranges",
  "updated_at" = now();
