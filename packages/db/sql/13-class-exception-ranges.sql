-- ═══════════════════════════════════════════════════════════════════════════
-- soyTuTurno — la clase de un día se puede partir en tramos.
--
-- Antes la excepción movía la clase a un único horario. Con `ranges` el profe
-- puede dar, por ejemplo, 13:00–15:00 y 16:00–20:00: el hueco del medio queda
-- libre para reservar en vez de tener la cancha bloqueada siete horas.
--
-- Formato: [{"from":"13:00","to":"15:00"},{"from":"16:00","to":"20:00"}]
-- NULL = como siempre (o el horario viejo de start_time/end_time).
--
-- Idempotente. Aplicar con:
--   pnpm --filter @soytuturno/db exec prisma db execute --file sql/13-class-exception-ranges.sql --schema prisma/schema.prisma
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "instructor_slot_exceptions" ADD COLUMN IF NOT EXISTS "ranges" JSONB;

-- Las excepciones que ya existían con un solo horario pasan a un tramo único.
UPDATE "instructor_slot_exceptions"
   SET "ranges" = jsonb_build_array(jsonb_build_object('from', "start_time", 'to', "end_time"))
 WHERE "ranges" IS NULL
   AND "start_time" IS NOT NULL
   AND "end_time" IS NOT NULL;
