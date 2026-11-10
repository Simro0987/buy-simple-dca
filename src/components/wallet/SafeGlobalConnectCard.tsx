import { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  Link2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Unlink,
  Bitcoin,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  SAFE_SUPPORTED_CHAINS,
  DEFAULT_SAFE_GUARD_POLICY,
  parseSafeAddressInput,
  verifySafeContractOnChain,
  formatShortAddress,
  saveSafeSession,
  type SupportedChainId,
  type SafeSession,
} from '@/lib/safeWalletGuard';

interface Props {
  lang?: 'sk' | 'en';
  /** Compact mode for embedding in headers/modals, or full card mode */
  compact?: boolean;
  onConnected?: (session: SafeSession) => void;
}

const DEMO_SAFE_VAULT = 'arb1:0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

export function SafeGlobalConnectCard({ lang = 'sk', compact = false, onConnected }: Props) {
  const sk = lang === 'sk';
  const { safeSession, signInWithSafe, user } = useAuth();

  const [safeInput, setSafeInput] = useState<string>(
    safeSession ? `${safeSession.primaryChain === 'arbitrum' ? 'arb1' : 'eth'}:${safeSession.safeAddress}` : '',
  );
  const [wcUri, setWcUri] = useState<string>('');
  const [selectedChain, setSelectedChain] = useState<SupportedChainId>(
    safeSession?.primaryChain ?? 'arbitrum',
  );
  const [verifying, setVerifying] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const connectSafe = async (addressToUse?: string, via: SafeSession['connectedVia'] = 'safe_walletconnect') => {
    const raw = (addressToUse ?? safeInput).trim();
    const parsed = parseSafeAddressInput(raw);
    if (!parsed.valid) {
      toast.error(
        sk
          ? 'Zadaj platnú Safe Global adresu (napr. arb1:0x742d... alebo 0x...)'
          : 'Enter a valid Safe Global address (e.g. arb1:0x742d... or 0x...)',
      );
      return;
    }

    const chainToUse = parsed.chain ?? selectedChain;
    setVerifying(true);
    try {
      let signerAddress: string | undefined;
      // Optional Web3 provider signature / account discovery if available in browser
      const ethProvider = (window as unknown as { ethereum?: { request?: (args: { method: string }) => Promise<string[]> } }).ethereum;
      if (ethProvider?.request) {
        try {
          const accounts = await ethProvider.request({ method: 'eth_accounts' });
          if (Array.isArray(accounts) && accounts[0]) {
            signerAddress = accounts[0];
          }
        } catch {
          // ignore
        }
      }

      const verification = await verifySafeContractOnChain(parsed.address, chainToUse);
      const nextSession: SafeSession = {
        safeAddress: parsed.address,
        signerAddress,
        primaryChain: chainToUse,
        enabledChains: SAFE_SUPPORTED_CHAINS.map((c) => c.id),
        wcPairingUri: wcUri.trim() || undefined,
        connectedVia: via,
        onChainVerified: verification.isSafeContract,
        threshold: verification.threshold,
        ownersCount: verification.ownersCount,
        zodiacRolesGuardActive: true,
        guardPolicy: {
          ...DEFAULT_SAFE_GUARD_POLICY,
          allowExternalWithdrawals: false,
          enforceSelfRecipientOnly: true,
          blockOwnerAndGuardChanges: true,
          primaryObjective: 'ACCUMULATE_BTC',
        },
        connectedAt: Date.now(),
      };

      signInWithSafe(nextSession);
      toast.success(
        sk
          ? `Safe{Wallet} (${formatShortAddress(parsed.address)}) pripojená! Zodiac Roles Guard aktívny — výbery mimo peňaženku sú zablokované.`
          : `Safe{Wallet} (${formatShortAddress(parsed.address)}) connected! Zodiac Roles Guard active — external withdrawals blocked.`,
      );
      onConnected?.(nextSession);
    } finally {
      setVerifying(false);
    }
  };

  const disconnectSafe = () => {
    saveSafeSession(null);
    toast.info(sk ? 'Safe{Wallet} odpojená (e-mail účet ostáva prihlásený).' : 'Safe{Wallet} disconnected.');
  };

  const isEmailLoggedIn = Boolean(user?.email && !user.email.endsWith('@safe.global'));

  if (safeSession) {
    return (
      <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.06] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  Safe&#123;Wallet&#125; Global · Pripojené
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-mono text-emerald-200 border border-emerald-500/30">
                  Zodiac Guard LOCKED
                </span>
              </div>
              <p className="text-xs font-mono text-foreground mt-0.5 break-all">
                {safeSession.safeAddress}
              </p>
              {isEmailLoggedIn && (
                <p className="text-[10px] text-emerald-200/80 mt-0.5">
                  {sk
                    ? `Prepojené s tvojím e-mailovým účtom (${user?.email})`
                    : `Linked with your email account (${user?.email})`}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={disconnectSafe}
            className="px-2.5 py-1.5 rounded-lg bg-secondary/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
            title={sk ? 'Odpojiť Safe peňaženku' : 'Disconnect Safe wallet'}
          >
            <Unlink className="w-3.5 h-3.5" />
            {sk ? 'Odpojiť' : 'Unlink'}
          </button>
        </div>

        {/* Security Guarantees Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase">
              <Lock className="w-3.5 h-3.5" />
              {sk ? 'Zákaz výberu von' : 'Zero External Transfer'}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
              {sk
                ? 'Žiadny AI agent (súčasný ani budúci) nemôže poslať tokeny na inú adresu. Všetky swapy končia v tvojej Safe.'
                : 'No AI agent (current or future) can send tokens to another address. All swaps settle inside your Safe.'}
            </p>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase">
              <Bitcoin className="w-3.5 h-3.5" />
              {sk ? 'Cieľ: Viac BTC' : 'Goal: More BTC'}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
              {sk
                ? 'Všetci agenti spravujú veľké multi-token portfólio, ale zisky z altcoinov a výnosov zbierajú do čistého BTC.'
                : 'All agents manage the multi-token portfolio, harvesting altcoin profits & yields into pure BTC.'}
            </p>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400 uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              {sk ? `${safeSession.enabledChains.length} Sietí Aktívnych` : `${safeSession.enabledChains.length} Chains Active`}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
              {sk
                ? 'ARB, ETH, BASE, OP, POL, BSC, AVAX, SOL, BTC, HYPE — plný prístup k DEX a staking protokolom.'
                : 'ARB, ETH, BASE, OP, POL, BSC, AVAX, SOL, BTC, HYPE — full access to DEX & staking protocols.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#12FF80]/30 bg-[#12FF80]/[0.04] p-4 space-y-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#12FF80]/15 border border-[#12FF80]/40 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-[#12FF80]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground">
                {sk ? 'Safe{Wallet} Global · WalletConnect' : 'Safe{Wallet} Global · WalletConnect'}
              </h3>
              <span className="px-1.5 py-0.5 rounded bg-[#12FF80]/15 text-[#12FF80] text-[10px] font-semibold">
                {sk ? 'Zodiac Roles Ochrana' : 'Zodiac Roles Guard'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isEmailLoggedIn
                ? sk
                  ? `Si prihlásený e-mailom (${user?.email}). Pripoj svoju Safe Global peňaženku pre autonómnych AI agentov.`
                  : `Signed in via email (${user?.email}). Connect your Safe Global wallet for autonomous AI agents.`
                : sk
                  ? 'Prihlás sa alebo prepoj účet s multisig Safe Global peňaženkou cez WalletConnect.'
                  : 'Sign in or link your account with a Safe Global multisig wallet via WalletConnect.'}
            </p>
          </div>
        </div>
        <a
          href="https://app.safe.global"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-[#12FF80] hover:underline flex items-center gap-1 shrink-0"
        >
          app.safe.global
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {!compact && (
        <div className="rounded-xl bg-black/40 border border-white/[0.06] p-3 space-y-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 font-semibold text-[#12FF80]">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {sk
                ? 'Garancia bezpečnosti: Žiadny AI agent nemôže vybrať peniaze na cudziu peňaženku'
                : 'Security Guarantee: No AI agent can withdraw funds to an external wallet'}
            </span>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            {sk
              ? 'Agenti majú cez Safe Zodiac Roles povolené iba operácie VO VNÚTRI peňaženky (nákup, predaj, DEX swapy, staking, pridávanie a odstraňovanie tokenov na všetkých sieťach) s cieľom maximalizovať množstvo BTC.'
              : 'Agents are restricted via Safe Zodiac Roles to IN-WALLET operations only (buy, sell, DEX swaps, staking, adding/removing tokens across all chains) to maximize total BTC.'}
          </p>
        </div>
      )}

      {/* Primary Chain Selector */}
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1.5">
          {sk ? 'Primárna sieť Safe peňaženky (agenti operujú multi-chain na všetkých 10 sieťach)' : 'Primary Safe Chain (agents operate multi-chain across all 10 networks)'}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SAFE_SUPPORTED_CHAINS.slice(0, 6).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedChain(c.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                selectedChain === c.id
                  ? 'bg-[#12FF80]/20 text-[#12FF80] border-[#12FF80]/50'
                  : 'bg-secondary/60 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {c.shortName} ({c.safePrefix}:)
            </button>
          ))}
        </div>
      </div>

      {/* Safe Address Input */}
      <div className="space-y-2">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">
            {sk ? 'Safe Global Adresa (napr. arb1:0x... alebo eth:0x...)' : 'Safe Global Address (e.g. arb1:0x... or eth:0x...)'}
          </label>
          <input
            type="text"
            value={safeInput}
            onChange={(e) => setSafeInput(e.target.value)}
            placeholder="arb1:0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
            className="w-full px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-mono border border-border focus:border-[#12FF80] focus:outline-none"
          />
        </div>

        {/* Optional WalletConnect URI */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-muted-foreground">
              {sk ? 'WalletConnect Pairing URI z app.safe.global (voliteľné `wc:...`)' : 'WalletConnect Pairing URI from app.safe.global (optional `wc:...`)'}
            </label>
            <button
              type="button"
              onClick={() => setShowQrModal((v) => !v)}
              className="text-[10px] text-[#12FF80] hover:underline flex items-center gap-1"
            >
              <QrCode className="w-3 h-3" />
              {showQrModal ? (sk ? 'Skryť návod' : 'Hide guide') : (sk ? 'Ako prepojiť cez Safe WC?' : 'How to pair Safe WC?')}
            </button>
          </div>
          <input
            type="text"
            value={wcUri}
            onChange={(e) => setWcUri(e.target.value)}
            placeholder="wc:a1b2c3d4...@2?relay-protocol=irn&symKey=..."
            className="w-full px-3 py-1.5 rounded-lg bg-secondary/70 text-foreground text-[11px] font-mono border border-border focus:border-[#12FF80] focus:outline-none"
          />
        </div>

        {showQrModal && (
          <div className="rounded-xl bg-black/60 border border-[#12FF80]/30 p-3 text-[11px] text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">
              {sk ? 'Postup prepojenia v Safe{Wallet} (app.safe.global):' : 'How to connect in Safe{Wallet} (app.safe.global):'}
            </p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>{sk ? 'Otvor svoju Safe peňaženku na app.safe.global' : 'Open your Safe wallet at app.safe.global'}</li>
              <li>{sk ? 'Skopíruj adresu svojej Safe (napr. arb1:0x...) do poľa vyššie' : 'Copy your Safe address (e.g. arb1:0x...) into the field above'}</li>
              <li>{sk ? 'Klikni na ikonu WalletConnect v hornej lište Safe alebo vlož wc: URI' : 'Click the WalletConnect icon in the Safe header or paste the wc: URI'}</li>
              <li>{sk ? 'Zodiac Roles Guard automaticky uzamkne všetky externé výbery (Recipient === Safe)' : 'Zodiac Roles Guard automatically locks all external withdrawals (Recipient === Safe)'}</li>
            </ol>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={verifying}
          onClick={() => void connectSafe(undefined, 'safe_walletconnect')}
          className="flex-1 py-2.5 px-4 rounded-xl bg-[#12FF80] text-black font-bold text-xs hover:bg-[#12FF80]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {isEmailLoggedIn
            ? sk
              ? 'Prepojiť Safe Global cez WalletConnect'
              : 'Link Safe Global via WalletConnect'
            : sk
              ? 'Prihlásiť cez Safe Global (WalletConnect)'
              : 'Sign in with Safe Global (WalletConnect)'}
        </button>

        <button
          type="button"
          disabled={verifying}
          onClick={() => {
            setSafeInput(DEMO_SAFE_VAULT);
            void connectSafe(DEMO_SAFE_VAULT, 'safe_walletconnect');
          }}
          className="py-2.5 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          title={sk ? 'Rýchle pripojenie multi-chain Safe trezoru s aktivovaným Zodiac Guard' : 'Quick connect multi-chain Safe vault with active Zodiac Guard'}
        >
          <ShieldCheck className="w-4 h-4 text-[#12FF80]" />
          {sk ? 'Aktivovať Safe Vault (Multi-Chain)' : 'Activate Safe Vault (Multi-Chain)'}
        </button>
      </div>
    </div>
  );
}
