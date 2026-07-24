-- Referencia vs alquiler en el mapa del predio.
-- reference = true  → solo se ve en el plano (bar, entrada, cancha que no se
--                     alquila): no aparece en Canchas ni se puede reservar.
-- reference = false → cancha de alquiler (aparece en Canchas, se reserva).
ALTER TABLE resources ADD COLUMN IF NOT EXISTS reference boolean NOT NULL DEFAULT false;

-- Migración de datos: los espacios "Otra" ya cargados (bar, entrada, admin) eran
-- referencias del mapa → los marcamos como tales.
UPDATE resources SET reference = true WHERE sport = 'otro';
