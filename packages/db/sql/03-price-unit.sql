-- ─────────────────────────────────────────────────────────────
-- Unidad de precio por servicio: "por cancha" (court) o "por jugador"
-- (player). Ej: pádel cobra por cancha fijo; tenis puede cobrar por jugador.
-- Columna NULLABLE → no afecta a los servicios/tenants existentes.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS price_unit text;
