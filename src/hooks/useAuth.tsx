import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  loadSafeSession,
  saveSafeSession,
  subscribeSafeSession,
  type SafeSession,
} from '@/lib/safeWalletGuard';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  safeSession: SafeSession | null;
  loading: boolean;
  signInWithSafe: (safeSession: SafeSession) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  safeSession: null,
  loading: true,
  signInWithSafe: () => {},
  signOut: async () => {},
});

function buildSyntheticSessionFromSafe(safe: SafeSession): Session {
  const uid = `safe-${safe.safeAddress.toLowerCase().slice(2, 38)}`;
  const email = `${safe.safeAddress.slice(0, 6).toLowerCase()}…${safe.safeAddress.slice(-4).toLowerCase()}@safe.global`;
  const nowSec = Math.floor(Date.now() / 1000);
  const user: User = {
    id: uid,
    app_metadata: {
      provider: 'safe_walletconnect',
      safe_address: safe.safeAddress,
      primary_chain: safe.primaryChain,
      zodiac_guard: true,
    },
    user_metadata: {
      safe_address: safe.safeAddress,
      primary_chain: safe.primaryChain,
      connected_via: safe.connectedVia,
      allow_external_withdrawals: false,
      primary_objective: 'ACCUMULATE_BTC',
    },
    aud: 'authenticated',
    created_at: new Date(safe.connectedAt).toISOString(),
    email,
  };

  return {
    access_token: `safe-wc-${safe.safeAddress}`,
    refresh_token: `safe-refresh-${safe.safeAddress}`,
    expires_in: 86400 * 30,
    expires_at: nowSec + 86400 * 30,
    token_type: 'bearer',
    user,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [safeSession, setSafeSession] = useState<SafeSession | null>(() => loadSafeSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubSafe = subscribeSafeSession(() => {
      setSafeSession(loadSafeSession());
    });
    return unsubSafe;
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSupabaseSession(s);
      setLoading(false);
    });

    // Fail-safe so the app never hangs on a black screen even if Supabase is unreachable
    const failSafe = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4500);

    const validateStoredSession = async () => {
      try {
        // If user already authenticated via Safe{Wallet} WalletConnect, unlock immediately
        const existingSafe = loadSafeSession();
        if (existingSafe && mounted) {
          setSafeSession(existingSafe);
          setLoading(false);
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (mounted) {
            setSupabaseSession(null);
            setLoading(false);
          }
          return;
        }

        let userOk = true;
        let invalidToken = false;
        try {
          const { data: userData, error } = await supabase.auth.getUser();
          if (error) {
            const status = (error as { status?: number }).status ?? 0;
            invalidToken = status === 401 || status === 403;
            userOk = !invalidToken;
          } else {
            userOk = Boolean(userData?.user);
            invalidToken = !userData?.user;
          }
        } catch {
          userOk = true;
        }

        if (invalidToken || !userOk) {
          try { await supabase.auth.signOut(); } catch { /* ignore */ }
          if (mounted) {
            setSupabaseSession(null);
            setLoading(false);
          }
          return;
        }

        if (mounted) {
          setSupabaseSession(sessionData.session);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    void validateStoredSession();

    return () => {
      mounted = false;
      clearTimeout(failSafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  const effectiveSession = supabaseSession ?? (safeSession ? buildSyntheticSessionFromSafe(safeSession) : null);

  return (
    <Ctx.Provider
      value={{
        user: effectiveSession?.user ?? null,
        session: effectiveSession,
        safeSession,
        loading,
        signInWithSafe: (nextSafe: SafeSession) => {
          saveSafeSession(nextSafe);
          setSafeSession(nextSafe);
          setLoading(false);
        },
        signOut: async () => {
          saveSafeSession(null);
          setSafeSession(null);
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore offline signOut errors
          }
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
