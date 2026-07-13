import { Button } from '@/components/ui/button';

/** Landing (apex: soytuturno.com). Placeholder de Fase 1. */
export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
        soy<span className="text-[var(--color-primary)]">tuturno</span>
      </h1>
      <p className="max-w-md text-[var(--color-muted-foreground)]">
        Turnos online para tu comercio. Tus clientes reservan solos, vos manejás todo desde un
        panel. Chau planillas y Google Calendar.
      </p>
      <Button disabled>Próximamente</Button>
    </main>
  );
}
