-- ─────────────────────────────────────────────────────────────
-- Jugadores / acompañantes de un turno (nombre, apellido, socio o no).
-- Se guardan como JSON en el turno. Columna NULLABLE → no afecta a nada
-- existente. El flag que pide estos datos vive en tenants.turno_config->>'askPlayers'.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS players jsonb;
