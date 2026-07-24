-- ─────────────────────────────────────────────────────────────
-- Modo "canchas" (clubes de pádel / tenis / fútbol / futsal).
-- Extiende la tabla resources con deporte, superficie y la ubicación
-- de la cancha en el mapa del predio (canvas del editor del admin).
-- Todas las columnas son NULLABLE → no afecta a los tenants existentes
-- (barberías, etc.) que no usan canchas.
--
-- El flag que enciende la feature vive en tenants.turno_config->>'canchas'
-- (JSON), no necesita cambio de esquema.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS sport        text,
  ADD COLUMN IF NOT EXISTS surface      text,
  ADD COLUMN IF NOT EXISTS map_x        double precision,
  ADD COLUMN IF NOT EXISTS map_y        double precision,
  ADD COLUMN IF NOT EXISTS map_w        double precision,
  ADD COLUMN IF NOT EXISTS map_h        double precision,
  ADD COLUMN IF NOT EXISTS map_rotation double precision;
