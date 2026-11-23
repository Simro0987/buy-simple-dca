import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiBaseUrl } from '@/lib/api/client';
import { SafeGlobalConnectCard } from '@/components/wallet/SafeGlobalConnectCard';
import { SiweSignInCard } from '@/components/wallet/SiweSignInCard';

/**
 * Login = Sign-In with Ethereum only (an injected wallet or a Safe via WalletConnect / EIP-1271).
 * There are no e-mail accounts or passwords. Signing the login message never moves funds.
 */
export default function AuthPage() {
  const { session, loading } = useAuth();
  const [authTab, setAuthTab] = useState<'wallet' | 'safe'>('wallet');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const pingBackend = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${apiBaseUrl()}/healthz`, { cache: 'no-store', signal: controller.signal });
      setBackendStatus(response.ok ? 'online' : 'offline');
    } catch {
      setBackendStatus('offline');
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void pingBackend();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pingBackend();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [pingBackend]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="w-full max-w-md relative space-y-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 mb-3">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Buy Simple DCA</h1>
          <p className="text-xs text-muted-foreground mt-1">Týždenný DCA plán · Safe&#123;Wallet&#125; · akumulácia BTC</p>
          <div className="mt-2.5 inline-flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                backendStatus === 'online' ? 'bg-emerald-500' : backendStatus === 'offline' ? 'bg-amber-400' : 'bg-muted-foreground animate-pulse'
              }`}
            />
            {backendStatus === 'online' ? 'Server dostupný' : backendStatus === 'offline' ? 'Server nedostupný – skús o chvíľu' : 'Kontrolujem server…'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-secondary/70 border border-border">
          <button
            type="button"
            onClick={() => setAuthTab('wallet')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              authTab === 'wallet' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            Peňaženka (SIWE)
          </button>
          <button
            type="button"
            onClick={() => setAuthTab('safe')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              authTab === 'safe' ? 'bg-[#12FF80] text-black shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Safe Global (WC)
          </button>
        </div>

        {authTab === 'wallet' ? (
          <div className="space-y-4">
            <SiweSignInCard />
            <SafeGlobalConnectCard lang="sk" compact />
          </div>
        ) : (
          <SafeGlobalConnectCard lang="sk" defaultOpenModal />
        )}
        <p className="text-[10px] text-center text-muted-foreground">
          Prihlásenie je len podpis správy (Sign-In with Ethereum). Nič neodosiela a nemá prístup k prostriedkom.
        </p>
      </div>
    </div>
  );
}
