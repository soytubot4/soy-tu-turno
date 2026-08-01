-- 08 · Config por servicio: pedir datos de las personas + cantidad fija.
-- Aditivo e idempotente. Aplicar con:
--   pnpm --filter @soytuturno/db exec prisma db execute --file sql/08-service-people.sql --schema prisma/schema.prisma

ALTER TABLE services ADD COLUMN IF NOT EXISTS ask_people boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS people_count integer;
