import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Mail, Loader2, CloudOff, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const RETRY_DELAY_MS = 4_000;
const MAX_ATTEMPTS = 6;

const isNetworkError = (message: string) => {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('fetch')
  );
};

export default function AuthPage() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  // wake state: null = normal UI, 'waking' = retry loop running, 'failed' = gave up
  const [wakeState, setWakeState] = useState<null | 'waking' | 'failed'>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelWake = useRef(false);

  const pingBackend = useCallback(async () => {
    const backendUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    if (!backendUrl || !publishableKey) {
      setBackendStatus('offline');
      return false;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    try {
      const response = await fetch(`${backendUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: { apikey: publishableKey },
        cache: 'no-store',
        signal: controller.signal,
      });
      setBackendStatus(response.ok ? 'online' : 'offline');
      return response.ok;
    } catch {
      setBackendStatus('offline');
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void pingBackend();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !wakeState) void pingBackend();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [pingBackend, wakeState]);

  useEffect(() => () => { cancelWake.current = true; }, []);

  const authenticate = useCallback(async () => {
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      toast.success('Účet vytvorený. Prihlasujem…');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  }, [email, mode, password]);

  // Retry loop: ping every 4s, up to 6 attempts; on success finish the login automatically.
  const startWakeLoop = useCallback(async () => {
    cancelWake.current = false;
    setWakeState('waking');

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      if (cancelWake.current) return;
      setAttempt(i);
      const ok = await pingBackend();
      if (cancelWake.current) return;

      if (ok) {
        try {
          await authenticate();
          setWakeState(null);
          return;
        } catch (e) {
          const message = e instanceof Error ? e.message : '';
          if (!isNetworkError(message)) {
            setWakeState(null);
            toast.error(message || 'Chyba prihlásenia');
            return;
          }
        }
      }

      if (i < MAX_ATTEMPTS) {
        await new Promise((r) => window.setTimeout(r, RETRY_DELAY_MS));
      }
    }

    if (!cancelWake.current) setWakeState('failed');
  }, [authenticate, pingBackend]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    try {
      await authenticate();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Chyba prihlásenia';
      if (isNetworkError(message)) {
        setBackendStatus('offline');
        void startWakeLoop();
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (wakeState) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 text-center">
        <div className="w-full max-w-xs">
          {wakeState === 'waking' ? (
            <>
              <div className="relative mx-auto w-16 h-16 mb-6">
                <span className="absolute inset-0 rounded-full border border-primary/20 animate-ping" />
                <span className="absolute inset-0 rounded-full bg-primary/10 border border-primary/30" />
                <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-primary animate-spin" />
              </div>
              <p className="text-sm text-foreground font-medium">Prebúdzam server… trvá to pár sekúnd.</p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Pokus {attempt} z {MAX_ATTEMPTS}
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-secondary border border-border mb-5">
                <CloudOff className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground font-medium">
                Server sa nepodarilo prebudiť. Skúste to prosím o chvíľu.
              </p>
              <button
                type="button"
                onClick={() => void startWakeLoop()}
                className="mt-5 w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Skúsiť znova
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelWake.current = true;
                  setWakeState(null);
                }}
                className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Späť na prihlásenie
              </button>
            </>
          )}
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 relative overflow-hidden">
      <div
        className="absolute -top-40 -left-40 w-[28rem] h-[28rem] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #9945FF 0%, transparent 65%)', opacity: 0.12 }}
      />
      <div
        className="absolute -bottom-40 -right-40 w-[28rem] h-[28rem] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #14F195 0%, transparent 65%)', opacity: 0.08 }}
      />

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {mode === 'signin' ? 'Prihlásenie' : 'Vytvoriť účet'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'signin' ? 'Prihlás sa do svojho DCA panela' : 'Zaregistruj sa a začni'}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                backendStatus === 'online'
                  ? 'bg-emerald-500'
                  : backendStatus === 'offline'
                    ? 'bg-destructive'
                    : 'bg-muted-foreground animate-pulse'
              }`}
            />
            {backendStatus === 'online'
              ? 'Cloud je pripojený'
              : backendStatus === 'offline'
                ? 'Cloud je nedostupný · skúšam znova'
                : 'Kontrolujem Cloud…'}
          </div>
        </div>

        <form onSubmit={submit} className="bg-card/60 backdrop-blur border border-border rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-secondary text-foreground text-sm border border-border focus:border-primary focus:outline-none"
                placeholder="ty@email.sk"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Heslo</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-secondary text-foreground text-sm border border-border focus:border-primary focus:outline-none"
                placeholder="Minimálne 8 znakov"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signin' ? 'Prihlásiť sa' : 'Vytvoriť účet'}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === 'signin' ? 'Ešte nemáš účet? Zaregistruj sa' : 'Už máš účet? Prihlás sa'}
          </button>
        </form>
      </div>
    </div>
  );
}
