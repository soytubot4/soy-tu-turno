'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Aceptación de invitación del dueño (o recuperación de contraseña). El link del
 * mail deja el token en el hash (#access_token=…) o como ?code=… (PKCE). Acá
 * armamos la sesión, el usuario elige su contraseña y entra a su panel.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function init() {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) return setState('ready');

      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return setState('ready');
      }

      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          window.history.replaceState(null, '', window.location.pathname);
          return setState('ready');
        }
      }

      setState('invalid');
    }

    void init();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('La contraseña tiene que tener al menos 8 caracteres');
      return;
    }
    if (password !== password2) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setSaving(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('¡Listo! Tu cuenta está activa.');
    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Activá tu cuenta</CardTitle>
          <CardDescription>Elegí una contraseña para empezar a usar tu panel de turnos.</CardDescription>
        </CardHeader>
        <CardContent>
          {state === 'loading' && (
            <p className="text-sm text-[var(--color-muted-foreground)]">Validando la invitación…</p>
          )}

          {state === 'invalid' && (
            <div className="space-y-3 text-sm">
              <p className="text-[var(--color-destructive)]">El link no es válido o ya venció.</p>
              <p className="text-[var(--color-muted-foreground)]">
                Pedile a quien te invitó que te reenvíe la invitación.
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/login')}>
                Ir al login
              </Button>
            </div>
          )}

          {state === 'ready' && (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password2">Repetir contraseña</Label>
                <Input
                  id="password2"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  disabled={saving}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Guardando…' : 'Activar cuenta y entrar'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
