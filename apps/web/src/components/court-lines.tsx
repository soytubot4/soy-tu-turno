import { SPORT_ASPECT, type Sport } from '@soytuturno/shared';

/**
 * Dibuja las líneas de la cancha según el deporte, como un SVG que llena el
 * rectángulo (se escala y rota junto con la cancha). El viewBox coincide con la
 * proporción del deporte, así los círculos no se deforman.
 */
export function CourtLines({ sport }: { sport: Sport | null }) {
  const s = (sport ?? 'otro') as Sport;
  const { w, h } = SPORT_ASPECT[s] ?? SPORT_ASPECT.otro;
  const stroke = 'rgba(255,255,255,0.9)';
  const sw = Math.max(w, h) * 0.008; // grosor relativo al tamaño de la cancha

  const svgProps = {
    viewBox: `0 0 ${w} ${h}`,
    preserveAspectRatio: 'none' as const,
    className: 'pointer-events-none absolute inset-0 h-full w-full',
  };
  const L = (props: React.SVGProps<SVGLineElement>) => (
    <line stroke={stroke} strokeWidth={sw} {...props} />
  );

  if (s === 'tenis') {
    const sx = w * 0.125; // líneas de single (inset)
    const st = h * 0.231; // línea de saque (arriba)
    const sb = h * 0.769; // línea de saque (abajo)
    const net = h * 0.5;
    const cx = w * 0.5;
    return (
      <svg {...svgProps}>
        {/* líneas de single */}
        <L x1={sx} y1={0} x2={sx} y2={h} />
        <L x1={w - sx} y1={0} x2={w - sx} y2={h} />
        {/* líneas de saque */}
        <L x1={sx} y1={st} x2={w - sx} y2={st} />
        <L x1={sx} y1={sb} x2={w - sx} y2={sb} />
        {/* línea central de saque */}
        <L x1={cx} y1={st} x2={cx} y2={sb} />
        {/* red */}
        <L x1={0} y1={net} x2={w} y2={net} strokeWidth={sw * 1.5} />
        {/* marcas centrales */}
        <L x1={cx} y1={0} x2={cx} y2={h * 0.035} />
        <L x1={cx} y1={h * 0.965} x2={cx} y2={h} />
      </svg>
    );
  }

  if (s === 'padel') {
    const st = h * 0.15;
    const sb = h * 0.85;
    const net = h * 0.5;
    const cx = w * 0.5;
    return (
      <svg {...svgProps}>
        <L x1={0} y1={st} x2={w} y2={st} />
        <L x1={0} y1={sb} x2={w} y2={sb} />
        <L x1={cx} y1={st} x2={cx} y2={sb} />
        <L x1={0} y1={net} x2={w} y2={net} strokeWidth={sw * 1.5} />
      </svg>
    );
  }

  // "Otra" (quincho, entrada, vestuarios, buffet…): es un espacio, sin líneas.
  if (s === 'otro') return null;

  // Fútbol / futsal / básquet: línea de mitad + círculo central.
  const mid = h * 0.5;
  const r = Math.min(w, h) * 0.16;
  return (
    <svg {...svgProps}>
      <L x1={0} y1={mid} x2={w} y2={mid} />
      <circle cx={w * 0.5} cy={mid} r={r} fill="none" stroke={stroke} strokeWidth={sw} />
      <circle cx={w * 0.5} cy={mid} r={sw * 1.5} fill={stroke} />
    </svg>
  );
}
