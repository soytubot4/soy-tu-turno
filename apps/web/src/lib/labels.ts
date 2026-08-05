/**
 * Cómo llamamos a las cosas según el rubro del comercio.
 *
 * El mismo recurso es una cancha en un club y un profesional en una peluquería,
 * así que el texto sale de acá y no hardcodeado en cada pantalla.
 */

/** "Cancha" / "Profesional" — para etiquetas de un solo recurso. */
export function resourceLabel(canchas: boolean): string {
  return canchas ? 'Cancha' : 'Profesional';
}

/** "Canchas" / "Profesionales" — para títulos y listados. */
export function resourceLabelPlural(canchas: boolean): string {
  return canchas ? 'Canchas' : 'Profesionales';
}
