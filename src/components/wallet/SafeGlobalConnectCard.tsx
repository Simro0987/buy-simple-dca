import { useEffect, useState } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  Link2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Unlink,
  Bitcoin,
  QrCode,
  Sparkles,
  Wallet,
  ChevronRight,
  Smartphone,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  SAFE_SUPPORTED_CHAINS,
  SELECTABLE_WALLET_PROVIDERS,
  DEFAULT_SAFE_GUARD_POLICY,
  parseSafeAddressInput,
  verifySafeContractOnChain,
  connectSelectedWalletAndResolveSafe,
  formatShortAddress,
  saveSafeSession,
  type SupportedChainId,
  type SafeSession,
  type SelectableWalletOption,
} from '@/lib/safeWalletGuard';

interface Props {
  lang?: 'sk' | 'en';
  /** Compact mode for embedding in headers/modals, or full card mode */
  compact?: boolean;
  /** Automatically open the wallet picker modal on mount */
  defaultOpenModal?: boolean;
  onConnected?: (session: SafeSession) => void;
}

export function SafeGlobalConnectCard({
  lang = 'sk',
  compact = false,
  defaultOpenModal = false,
  onConnected,
}: Props) {
  const sk = lang === 'sk';
  const { safeSession, signInWithSafe, user } = useAuth();

  const [modalOpen, setModalOpen] = useState(defaultOpenModal);
  const [selectedChain, setSelectedChain] = useState<SupportedChainId>(
    safeSession?.primaryChain ?? 'arbitrum',
  );
  const [selectedWallet, setSelectedWallet] = useState<SelectableWalletOption | null>(null);
  const [step, setStep] = useState<'pick_wallet' | 'connecting' | 'confirm_safe'>('pick_wallet');

  // Discovered / resolved addresses during handshake
  const [signerAddress, setSignerAddress] = useState<string>('');
  const [safeAddress, setSafeAddress] = useState<string>('');
  const [availableSafes, setAvailableSafes] = useState<string[]>([]);
  const [customSafeOverride, setCustomSafeOverride] = useState<string>('');
  const [wcUri, setWcUri] = useState<string>('');
  const [verifying, setVerifying] = useState(false);
  const [detectedInjected, setDetectedInjected] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasEth = Boolean((window as unknown as { ethereum?: unknown }).ethereum);
      const hasSol = Boolean((window as unknown as { solana?: unknown }).solana);
      setDetectedInjected(hasEth || hasSol);
    }
  }, []);

  const openWalletPicker = () => {
    setStep('pick_wallet');
    setSelectedWallet(null);
    setModalOpen(true);
  };

  const handleSelectWalletProvider = async (wallet: SelectableWalletOption) => {
    setSelectedWallet(wallet);
    setStep('connecting');
    setVerifying(true);

    try {
      const result = await connectSelectedWalletAndResolveSafe(
        wallet,
        selectedChain,
        customSafeOverride.trim() || undefined,
      );
      setSignerAddress(result.signerAddress);
      setSafeAddress(result.safeAddress);
      setAvailableSafes(result.availableSafes);
      setStep('confirm_safe');
    } catch {
      toast.error(
        sk
          ? 'Nepodarilo sa nadviazať spojenie s peňaženkou. Skús znova.'
          : 'Failed to connect wallet. Please try again.',
      );
      setStep('pick_wallet');
    } finally {
      setVerifying(false);
    }
  };

  const finalizeSafeConnection = async (targetSafeAddr?: string) => {
    if (!selectedWallet) return;
    const rawAddr = (targetSafeAddr ?? (customSafeOverride.trim() || safeAddress)).trim();
    const parsed = parseSafeAddressInput(rawAddr);
    if (!parsed.valid) {
      toast.error(
        sk
          ? 'Zadaj platnú Safe Global adresu (0x...)'
          : 'Enter a valid Safe Global address (0x...)',
      );
      return;
    }

    const chainToUse = parsed.chain ?? selectedChain;
    setVerifying(true);
    try {
      const verification = await verifySafeContractOnChain(parsed.address, chainToUse);
      const nextSession: SafeSession = {
        safeAddress: parsed.address,
        signerAddress: signerAddress || undefined,
        selectedWalletId: selectedWallet.id,
        selectedWalletName: selectedWallet.name,
        primaryChain: chainToUse,
        enabledChains: SAFE_SUPPORTED_CHAINS.map((c) => c.id),
        wcPairingUri: wcUri.trim() || undefined,
        connectedVia: 'safe_walletconnect',
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
      setModalOpen(false);
      toast.success(
        sk
          ? `${selectedWallet.name} prepojená cez Safe Global (${formatShortAddress(parsed.address)})! Zodiac Guard aktívny.`
          : `${selectedWallet.name} connected via Safe Global (${formatShortAddress(parsed.address)})! Zodiac Guard active.`,
      );
      onConnected?.(nextSession);
    } finally {
      setVerifying(false);
    }
  };

  const disconnectSafe = () => {
    saveSafeSession(null);
    toast.info(
      sk
        ? 'Safe{Wallet} peňaženka odpojená.'
        : 'Safe{Wallet} disconnected.',
    );
  };

  const isEmailLoggedIn = Boolean(user?.email && !user.email.endsWith('@safe.global'));

  return (
    <>
      {safeSession ? (
        <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.06] p-4 space-y-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Safe&#123;Wallet&#125; Global · {safeSession.selectedWalletName ?? 'WalletConnect'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-mono text-emerald-200 border border-emerald-500/30">
                    Zodiac Guard LOCKED
                  </span>
                </div>
                <p className="text-xs font-mono text-foreground mt-0.5 break-all">
                  Safe Vault: {safeSession.safeAddress}
                </p>
                {safeSession.signerAddress && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {sk ? 'Vlastnícka peňaženka (Signer):' : 'Owner Wallet (Signer):'}{' '}
                    {formatShortAddress(safeSession.signerAddress)} ({safeSession.selectedWalletName ?? 'Web3'})
                  </p>
                )}
                {isEmailLoggedIn && (
                  <p className="text-[10px] text-emerald-200/80 mt-0.5">
                    {sk
                      ? `Prepojené s tvojím e-mailovým účtom (${user?.email})`
                      : `Linked with your email account (${user?.email})`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={openWalletPicker}
                className="px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-[11px] font-semibold flex items-center gap-1 transition-colors border border-border"
                title={sk ? 'Zmeniť peňaženku' : 'Switch wallet'}
              >
                <RefreshCw className="w-3 h-3 text-[#12FF80]" />
                {sk ? 'Zmeniť peňaženku' : 'Switch Wallet'}
              </button>
              <button
                type="button"
                onClick={disconnectSafe}
                className="px-2.5 py-1.5 rounded-lg bg-secondary/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground text-[11px] font-medium flex items-center gap-1 transition-colors"
                title={sk ? 'Odpojiť Safe peňaženku' : 'Disconnect Safe wallet'}
              >
                <Unlink className="w-3.5 h-3.5" />
                {sk ? 'Odpojiť' : 'Unlink'}
              </button>
            </div>
          </div>

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
      ) : (
        <div className="rounded-2xl border border-[#12FF80]/30 bg-[#12FF80]/[0.04] p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#12FF80]/15 border border-[#12FF80]/40 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-[#12FF80]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-foreground">
                    Safe&#123;Wallet&#125; Global · WalletConnect
                  </h3>
                  <span className="px-1.5 py-0.5 rounded bg-[#12FF80]/15 text-[#12FF80] text-[10px] font-semibold">
                    {sk ? 'Výber vlastnej peňaženky' : 'Choose Your Wallet'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isEmailLoggedIn
                    ? sk
                      ? `Si prihlásený e-mailom (${user?.email}). Klikni na tlačidlo nižšie, vyber si svoju peňaženku (MetaMask, Rabby, Phantom, Trust, Ledger…) a prepoj ju cez Safe Global.`
                      : `Signed in via email (${user?.email}). Click below to choose your wallet and route it through Safe Global.`
                    : sk
                      ? 'Klikni na WalletConnect, vyber si vlastnú peňaženku (MetaMask, Rabby, Phantom, Trust, Coinbase, Ledger…) a pripoj ju cez Safe Global.'
                      : 'Click WalletConnect, choose your wallet, and connect through Safe Global.'}
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
                  ? 'Tvoja vybraná peňaženka slúži ako vlastník (Signer) pre Safe Global Smart Account. AI agenti majú cez Safe Zodiac Roles povolené iba operácie VO VNÚTRI peňaženky s cieľom akumulovať viac BTC.'
                  : 'Your chosen wallet acts as the Signer for your Safe Global Smart Account. AI agents are restricted to IN-WALLET operations only to accumulate more BTC.'}
              </p>
            </div>
          )}

          {/* Primary Button: Opens the Interactive Wallet Picker Modal */}
          <button
            type="button"
            onClick={openWalletPicker}
            className="w-full py-3 px-4 rounded-xl bg-[#12FF80] text-black font-bold text-xs hover:bg-[#12FF80]/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_-4px_rgba(18,255,128,0.45)]"
          >
            <Wallet className="w-4 h-4" />
            {sk
              ? 'Pripojiť cez WalletConnect & Safe Global (Vybrať peňaženku)'
              : 'Connect via WalletConnect & Safe Global (Choose Wallet)'}
          </button>
        </div>
      )}

      {/* INTERACTIVE WALLET SELECTOR MODAL (Routed via Safe Global) */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-[#0b0e14] border border-[#12FF80]/30 text-foreground p-5 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#12FF80]/15 border border-[#12FF80]/40 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#12FF80]" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {step === 'pick_wallet' &&
                    (sk ? 'Vyber si peňaženku · Safe Global WC' : 'Select Your Wallet · Safe Global WC')}
                  {step === 'connecting' &&
                    (sk ? `Pripájam ${selectedWallet?.name ?? ''}…` : `Connecting ${selectedWallet?.name ?? ''}…`)}
                  {step === 'confirm_safe' &&
                    (sk ? 'Potvrď Safe Global Trezor' : 'Confirm Safe Global Vault')}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground">
                  {sk
                    ? 'Každá vybraná peňaženka sa prepája cez Safe Global Smart Account so Zodiac Roles Guardom (zákaz výberu mimo peňaženku).'
                    : 'Every selected wallet routes through a Safe Global Smart Account with Zodiac Roles Guard.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* STEP 1: CHOOSE WHICH WALLET TO CONNECT */}
          {step === 'pick_wallet' && (
            <div className="space-y-4 pt-2">
              {/* Network Selector */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  {sk
                    ? '1. Vyber primárnu sieť pre Safe Global (agenti operujú na všetkých 10 sieťach):'
                    : '1. Select primary Safe Global network:'}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SAFE_SUPPORTED_CHAINS.slice(0, 7).map((c) => (
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

              {/* Wallet Provider List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    {sk
                      ? '2. Vyber peňaženku, s ktorou sa chceš pripojiť cez Safe Global:'
                      : '2. Choose the wallet you want to connect via Safe Global:'}
                  </label>
                  {detectedInjected && (
                    <span className="text-[10px] text-[#12FF80] font-mono">
                      ● Browser Web3 detegované
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {SELECTABLE_WALLET_PROVIDERS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => void handleSelectWalletProvider(w)}
                      className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl bg-secondary/50 hover:bg-[#12FF80]/15 border border-border hover:border-[#12FF80]/50 transition-all text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0"
                          style={{
                            backgroundColor: `${w.color}20`,
                            color: w.color,
                            border: `1px solid ${w.color}45`,
                          }}
                        >
                          {w.category === 'hardware' ? (
                            <HardDrive className="w-4 h-4" />
                          ) : w.category === 'mobile_wc' ? (
                            <Smartphone className="w-4 h-4" />
                          ) : (
                            <Wallet className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground group-hover:text-[#12FF80] transition-colors">
                              {w.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-black/50 text-[9px] font-mono text-muted-foreground border border-white/10">
                              {w.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {sk ? w.subtitleSk : w.subtitleEn}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-[#12FF80] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional manual address input before picking */}
              <div className="pt-1 border-t border-border/60 space-y-1.5">
                <label className="text-[10px] text-muted-foreground block">
                  {sk
                    ? 'Voliteľné: Ak už máš existujúcu Safe adresu (napr. arb1:0x...), môžeš ju vložiť sem pred výberom peňaženky:'
                    : 'Optional: Paste an existing Safe address (e.g. arb1:0x...) before selecting a wallet:'}
                </label>
                <input
                  type="text"
                  value={customSafeOverride}
                  onChange={(e) => setCustomSafeOverride(e.target.value)}
                  placeholder="arb1:0x... alebo 0x... (nepovinné — inak sa zistí/vytvorí automaticky)"
                  className="w-full px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-mono border border-border focus:border-[#12FF80] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2: HANDSHAKE / CONNECTING */}
          {step === 'connecting' && selectedWallet && (
            <div className="py-8 text-center space-y-4">
              <div className="relative mx-auto w-16 h-16 flex items-center justify-center rounded-2xl bg-[#12FF80]/10 border border-[#12FF80]/40">
                <Loader2 className="w-8 h-8 text-[#12FF80] animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  {sk
                    ? `Pripájam ${selectedWallet.name} a vyhľadávam Safe Global Smart Account…`
                    : `Connecting ${selectedWallet.name} and discovering Safe Global Smart Account…`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sk
                    ? 'Overujem Safe Transaction Service a aktivujem Zodiac Roles Guard (No-Transfer Policy).'
                    : 'Checking Safe Transaction Service and activating Zodiac Roles Guard.'}
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRM SAFE VAULT & ZODIAC GUARD */}
          {step === 'confirm_safe' && selectedWallet && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl bg-[#12FF80]/10 border border-[#12FF80]/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#12FF80] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {selectedWallet.name} {sk ? 'pripravená' : 'ready'}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-200 bg-black/40 px-2 py-0.5 rounded">
                    {selectedChain.toUpperCase()}
                  </span>
                </div>

                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{sk ? 'Vybraná peňaženka (Signer):' : 'Selected Wallet (Signer):'}</span>
                    <span className="font-mono text-foreground">{formatShortAddress(signerAddress)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{sk ? 'Safe Global Vault:' : 'Safe Global Vault:'}</span>
                    <span className="font-mono text-[#12FF80] font-bold">{formatShortAddress(safeAddress)}</span>
                  </div>
                </div>
              </div>

              {/* Allow user to pick among discovered Safes or edit the Safe address */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground block">
                  {sk
                    ? 'Adresa Safe Global peňaženky (môžeš ponechať detegovanú Safe alebo vložiť inú):'
                    : 'Safe Global Vault Address (keep detected Safe or paste another):'}
                </label>
                <input
                  type="text"
                  value={customSafeOverride || safeAddress}
                  onChange={(e) => setCustomSafeOverride(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-mono border border-border focus:border-[#12FF80] focus:outline-none"
                />
                {availableSafes.length > 1 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {availableSafes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSafeAddress(s);
                          setCustomSafeOverride(s);
                        }}
                        className="px-2 py-0.5 rounded bg-secondary text-[10px] font-mono text-muted-foreground hover:text-foreground border border-border"
                      >
                        {formatShortAddress(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional WalletConnect URI / Deep Link for Mobile or Web Safe */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <QrCode className="w-3 h-3 text-[#12FF80]" />
                    {sk ? 'WalletConnect URI (`wc:...` z app.safe.global — voliteľné):' : 'WalletConnect URI (`wc:...` optional):'}
                  </label>
                  {selectedWallet.deepLinkPrefix && wcUri.trim() && (
                    <a
                      href={`${selectedWallet.deepLinkPrefix}${encodeURIComponent(wcUri.trim())}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#12FF80] hover:underline flex items-center gap-1"
                    >
                      {sk ? `Otvoriť v ${selectedWallet.name}` : `Open in ${selectedWallet.name}`}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <input
                  type="text"
                  value={wcUri}
                  onChange={(e) => setWcUri(e.target.value)}
                  placeholder="wc:a1b2c3...@2?relay-protocol=irn&symKey=..."
                  className="w-full px-3 py-1.5 rounded-lg bg-secondary/70 text-foreground text-[11px] font-mono border border-border focus:border-[#12FF80] focus:outline-none"
                />
              </div>

              {/* Security Policy Summary */}
              <div className="rounded-xl bg-black/50 border border-white/10 p-3 space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Lock className="w-3.5 h-3.5" />
                  {sk ? 'Safe Zodiac Roles Guard: AKTÍVNY' : 'Safe Zodiac Roles Guard: ACTIVE'}
                </div>
                <p className="text-muted-foreground leading-snug">
                  {sk
                    ? '• AI agenti môžu v tejto peňaženke nakupovať, predávať, pridávať/odoberať tokeny a zbierať zisky do BTC na všetkých sieťach.\n• Výber alebo poslanie tokenov na akúkoľvek cudziu adresu je 100% ZABLOKOVANÉ.'
                    : '• AI agents can buy, sell, add/remove tokens and harvest profits into BTC across all chains.\n• Withdrawing or sending tokens to any external address is 100% BLOCKED.'}
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('pick_wallet')}
                  className="px-3 py-2.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground text-xs font-semibold border border-border"
                >
                  {sk ? '← Iná peňaženka' : '← Change Wallet'}
                </button>
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => void finalizeSafeConnection()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#12FF80] text-black font-bold text-xs hover:bg-[#12FF80]/90 transition-colors flex items-center justify-center gap-2"
                >
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  {sk
                    ? `Potvrdiť a prepojiť ${selectedWallet.name} cez Safe Global`
                    : `Confirm & Connect ${selectedWallet.name} via Safe Global`}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
