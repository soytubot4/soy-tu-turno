-- Teléfono de contacto del profesional/recurso (opcional).
ALTER TABLE resources ADD COLUMN IF NOT EXISTS phone text;
