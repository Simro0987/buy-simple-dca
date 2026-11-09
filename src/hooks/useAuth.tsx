import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });

    // Núdzová brzda: aj keď je backend nedostupný, nikdy nezostaneme
    // navždy v loading stave (čierna obrazovka).
    const failSafe = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 6000);

    const validateStoredSession = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (mounted) {
            setSession(null);
            setLoading(false);
          }
          return;
        }

        // Sieťová chyba (pauznutý/nedostupný backend) NESMIE odhlásiť užívateľa.
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
          // fetch failed → offline / paused backend, ponecháme uloženú session
          userOk = true;
        }

        if (invalidToken || !userOk) {
          try { await supabase.auth.signOut(); } catch { /* ignore */ }
          if (mounted) {
            setSession(null);
            setLoading(false);
          }
          return;
        }

        if (mounted) {
          setSession(sessionData.session);
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

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
