import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Wallet, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getActiveWalletConnectProvider } from '@/lib/safeWalletConnect';
import { getInjectedProvider, signInWithEthereum, type Eip1193Provider } from '@/lib/siweAuth';

/** Wallet login (Sign-In with Ethereum) for the own API on Flux. Replaces e-mail + password. */
export function SiweSignInCard() {
  const { safeSession } = useAuth();
  const [busy, setBusy] = useState<null | 'injected' | 'safe'>(null);
  const injected = typeof window !== 'undefined' ? getInjectedProvider() : null;
  const wc = getActiveWalletConnectProvider();

  const run = async (kind: 'injected' | 'safe', provider: Eip1193Provider | null, expected?: string) => {
    if (!provider) {
      toast.error(kind === 'safe' ? 'Najprv pripoj Safe cez WalletConnect (nižšie).' : 'Nenašiel som peňaženku v prehliadači (MetaMask, Rabby…).');
      return;
    }
    setBusy(kind);
    try {
      const addr = await signInWithEthereum(provider, expected);
      toast.success(`Prihlásený ako ${addr.slice(0, 6)}…${addr.slice(-4)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Prihlásenie zlyhalo');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-card/60 backdrop-blur border border-border rounded-2xl p-5 space-y-3">
      <h2 className="text-sm font-bold text-foreground">Prihlásenie peňaženkou (Sign-In with Ethereum)</h2>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Podpíšeš jednu správu – nič sa neodosiela, nestojí to gas a aplikácia nezíska prístup k prostriedkom.
        Tvoje dáta sú viazané na adresu peňaženky / Safe.
      </p>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run('injected', injected)}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy === 'injected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
        Prihlásiť sa peňaženkou v prehliadači
      </button>
      <button
        type="button"
        disabled={busy !== null || !wc}
        onClick={() => void run('safe', wc as unknown as Eip1193Provider, safeSession?.safeAddress)}
        className="w-full py-2.5 rounded-lg bg-[#12FF80]/15 text-[#12FF80] border border-[#12FF80]/40 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
        title={wc ? '' : 'Najprv pripoj Safe cez WalletConnect'}
      >
        {busy === 'safe' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        Podpísať prihlásenie cez pripojený Safe
      </button>
      {busy === 'safe' && (
        <p className="text-[11px] text-muted-foreground">
          Potvrď správu v Safe&#123;Wallet&#125;. Pri viacerých podpisoch ju musia podpísať všetci potrební vlastníci (max. 25 min).
        </p>
      )}
    </div>
  );
}
