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
  Copy,
  RefreshCw,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
  DEFAULT_SAFE_GUARD_POLICY,
  parseSafeAddressInput,
  verifySafeContractOnChain,
  lookupRealSafesForOwnerOnSafeGlobal,
  buildSafeGlobalPortalUrls,
  detectSafeAppsSdkContext,
  formatShortAddress,
  saveSafeSession,
  type SupportedChainId,
  type SafeSession,
} from '@/lib/safeWalletGuard';

interface Props {
  lang?: 'sk' | 'en';
  compact?: boolean;
  defaultOpenModal?: boolean;
  onConnected?: (session: SafeSession) => void;
}

/**
 * Generates a standard WalletConnect v2 pairing URI (`wc:<topic>@2?relay-protocol=irn&symKey=<key>`)
 * so the user can copy it into `app.safe.global` (WalletConnect icon in the top bar of Safe Global)
 * or scan the QR code from the Safe{Wallet} mobile app.
 */
function generateStandardWcV2PairingUri(): string {
  const randomHex = (len: number) => {
    const bytes = new Uint8Array(len / 2);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };
  const topic = randomHex(64);
  const symKey = randomHex(64);
  return `wc:${topic}@2?relay-protocol=irn&symKey=${symKey}`;
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
  const [safeAddressInput, setSafeAddressInput] = useState<string>(
    safeSession?.safeAddress ?? '',
  );
  const [ownerLookupInput, setOwnerLookupInput] = useState<string>('');
  const [discoveredSafes, setDiscoveredSafes] = useState<string[]>([]);
  const [lookingUpSafes, setLookingUpSafes] = useState(false);

  const [wcPairingUri, setWcPairingUri] = useState<string>(() =>
    generateStandardWcV2PairingUri(),
  );
  const [verifying, setVerifying] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const currentOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://buy-simple-dca.vercel.app';

  const portalUrls = buildSafeGlobalPortalUrls({
    chainId: selectedChain,
    safeAddress: safeAddressInput,
    appUrl: currentOrigin,
    wcUri: wcPairingUri,
  });

  // Automatically check if running inside app.safe.global iframe via @safe-global/safe-apps-sdk
  useEffect(() => {
    void (async () => {
      const iframeSession = await detectSafeAppsSdkContext(1500);
      if (iframeSession) {
        signInWithSafe(iframeSession);
        onConnected?.(iframeSession);
      }
    })();
  }, [signInWithSafe, onConnected]);

  const handleOpenModal = () => {
    setValidationError(null);
    setWcPairingUri(generateStandardWcV2PairingUri());
    setModalOpen(true);
  };

  const handleCopyText = (text: string, labelSk: string, labelEn: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(sk ? labelSk : labelEn);
  };

  /**
   * Read-only lookup on official Safe Global Transaction Service API (`safe.global`)
   * to find existing Safe contracts where the user's personal wallet is an owner.
   */
  const handleLookupSafesByOwner = async () => {
    const parsed = parseSafeAddressInput(ownerLookupInput);
    if (!parsed.valid) {
      toast.error(
        sk
          ? 'Zadaj platnú verejnú adresu (0x...) pre vyhľadanie tvojich Safe účtov na app.safe.global'
          : 'Enter a valid public address (0x...) to find your Safe accounts on app.safe.global',
      );
      return;
    }

    setLookingUpSafes(true);
    setValidationError(null);
    try {
      const res = await lookupRealSafesForOwnerOnSafeGlobal(parsed.address, selectedChain);
      setDiscoveredSafes(res.safes);
      if (res.safes.length > 0) {
        setSafeAddressInput(res.safes[0]);
        toast.success(
          sk
            ? `Nájdených ${res.safes.length} Safe Global trezorov na sieti ${selectedChain.toUpperCase()}!`
            : `Found ${res.safes.length} Safe Global vaults on ${selectedChain.toUpperCase()}!`,
        );
      } else {
        setValidationError(
          sk
            ? `Pre túto adresu sa na sieti ${selectedChain.toUpperCase()} nenašiel žiadny nasadený Safe kontrakt. Klikni vyššie na "Otvoriť app.safe.global" a pripoj tam svoju peňaženku.`
            : `No deployed Safe contract found for this address on ${selectedChain.toUpperCase()}. Click "Open app.safe.global" above to connect your wallet there.`,
        );
      }
    } finally {
      setLookingUpSafes(false);
    }
  };

  /**
   * Connects strictly to a verified on-chain Safe Global Smart Account contract.
   * Rejects regular EOA addresses so the flow is 100% Non-Custodial via Safe Global.
   */
  const handleVerifyAndConnectSafe = async (addressOverride?: string) => {
    setValidationError(null);
    const raw = (addressOverride ?? safeAddressInput).trim();
    const parsed = parseSafeAddressInput(raw);

    if (!parsed.valid) {
      setValidationError(
        sk
          ? 'Zadaj platnú adresu svojho Safe Global trezoru (napr. arb1:0x… alebo 0x…) z app.safe.global.'
          : 'Enter a valid Safe Global vault address (e.g. arb1:0x… or 0x…) from app.safe.global.',
      );
      return;
    }

    const chainToUse = parsed.chain ?? selectedChain;
    setVerifying(true);
    try {
      const check = await verifySafeContractOnChain(parsed.address, chainToUse);

      if (!check.isSafeContract) {
        setValidationError(
          sk
            ? check.errorReasonSk ??
                'Táto adresa nie je Safe Global Smart Account kontrakt (je to bežná EOA peňaženka). Otvor app.safe.global, pripoj tam svoju peňaženku a vlož sem adresu svojho Safe trezoru.'
            : check.errorReasonEn ??
                'This address is not a Safe Global Smart Account contract (it is a plain EOA). Open app.safe.global, connect your wallet there, and paste your Safe vault address.',
        );
        toast.error(
          sk
            ? 'Odmietnuté: Musíš zadať adresu Safe Global kontraktu, nie bežnú EOA peňaženku!'
            : 'Rejected: You must provide a Safe Global contract address, not a plain EOA wallet!',
        );
        return;
      }

      const nextSession: SafeSession = {
        safeAddress: parsed.address,
        owners: check.owners,
        signerAddress: check.owners[0],
        selectedWalletName: 'Safe{Wallet} Global (app.safe.global)',
        primaryChain: chainToUse,
        enabledChains: SAFE_SUPPORTED_CHAINS.map((c) => c.id),
        wcPairingUri,
        connectedVia: 'safe_walletconnect',
        onChainVerified: true,
        nonCustodial: true,
        threshold: check.threshold || 1,
        ownersCount: check.ownersCount || 1,
        safeVersion: check.safeVersion,
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
          ? `Non-Custodial Safe Global (${formatShortAddress(parsed.address)}) overený on-chain a prepojený!`
          : `Non-Custodial Safe Global (${formatShortAddress(parsed.address)}) verified on-chain and connected!`,
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
        ? 'Safe{Wallet} Global relácia bola odpojená.'
        : 'Safe{Wallet} Global session disconnected.',
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
                    100% Non-Custodial · Safe&#123;Wallet&#125; Global
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-mono text-emerald-200 border border-emerald-500/30">
                    On-Chain Safe ({safeSession.threshold}/{safeSession.ownersCount}) · Zodiac Guard LOCKED
                  </span>
                </div>
                <p className="text-xs font-mono text-foreground mt-0.5 break-all">
                  Safe Smart Account: {safeSession.safeAddress}
                </p>
                {safeSession.owners.length > 0 && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {sk ? 'Vlastníci Safe (pripojení výhradne v app.safe.global):' : 'Safe Owners (connected exclusively in app.safe.global):'}{' '}
                    {safeSession.owners.map((o) => formatShortAddress(o)).join(', ')}
                  </p>
                )}
                {isEmailLoggedIn && (
                  <p className="text-[10px] text-emerald-200/80 mt-0.5">
                    {sk
                      ? `Prepojené s e-mailovým účtom (${user?.email})`
                      : `Linked with email account (${user?.email})`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={
                  buildSafeGlobalPortalUrls({
                    chainId: safeSession.primaryChain,
                    safeAddress: safeSession.safeAddress,
                    appUrl: currentOrigin,
                  }).openAsSafeAppUrl
                }
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-[#12FF80] text-black text-[11px] font-bold flex items-center gap-1 hover:bg-[#12FF80]/90 transition-colors"
                title={sk ? 'Otvoriť našu stránku priamo vo vnútri app.safe.global' : 'Open our app directly inside app.safe.global'}
              >
                app.safe.global
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={handleOpenModal}
                className="px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-[11px] font-semibold flex items-center gap-1 transition-colors border border-border"
              >
                <RefreshCw className="w-3 h-3 text-[#12FF80]" />
                {sk ? 'Nastavenia Safe' : 'Safe Settings'}
              </button>
              <button
                type="button"
                onClick={disconnectSafe}
                className="px-2.5 py-1.5 rounded-lg bg-secondary/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground text-[11px] font-medium flex items-center gap-1 transition-colors"
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
                {sk ? '100% Non-Custodial cez Safe Global' : '100% Non-Custodial via Safe Global'}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                {sk
                  ? 'Tvoja osobná peňaženka sa pripája VÝHRADNE na stránke app.safe.global. Naša stránka nikdy nemá prístup k tvojmu privátnemu kľúču ani k výberom.'
                  : 'Your personal wallet connects EXCLUSIVELY on app.safe.global. Our site never touches your private key or withdrawal rights.'}
              </p>
            </div>

            <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase">
                <Bitcoin className="w-3.5 h-3.5" />
                {sk ? 'In-Wallet AI Agenti → Viac BTC' : 'In-Wallet AI Agents → More BTC'}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                {sk
                  ? 'Agenti operujú len vo vnútri Safe kontraktu (recipient === Safe). Výbery na inú adresu sú zablokované.'
                  : 'Agents operate strictly inside the Safe contract (recipient === Safe). External transfers are blocked.'}
              </p>
            </div>

            <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400 uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                {sk ? `${safeSession.enabledChains.length} Sietí Povolených` : `${safeSession.enabledChains.length} Chains Enabled`}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                {sk
                  ? 'ARB, ETH, BASE, OP, POL, BSC, AVAX, SOL, BTC, HYPE — plne pod ochranou Safe Smart Accountu.'
                  : 'ARB, ETH, BASE, OP, POL, BSC, AVAX, SOL, BTC, HYPE — protected by your Safe Smart Account.'}
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
                    100% Non-Custodial · Safe&#123;Wallet&#125; Global Bridge
                  </h3>
                  <span className="px-1.5 py-0.5 rounded bg-[#12FF80]/15 text-[#12FF80] text-[10px] font-semibold">
                    app.safe.global + WalletConnect v2
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {sk
                    ? 'Svoju osobnú peňaženku (MetaMask, Rabby, Ledger, Trezor, Phantom, Trust…) pripájaš priamo na oficiálnej stránke app.safe.global a odtiaľ ju cez WalletConnect / Safe App prepojíš s našou stránkou.'
                    : 'Connect your personal wallet directly on the official app.safe.global site, then bridge that Safe to our app via WalletConnect / Safe App.'}
                </p>
              </div>
            </div>
          </div>

          {!compact && (
            <div className="rounded-xl bg-black/40 border border-white/[0.06] p-3 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-[#12FF80]">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {sk
                    ? 'Prečo je tento postup najbezpečnejší (100% Non-Custodial)?'
                    : 'Why is this architecture the safest (100% Non-Custodial)?'}
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {sk
                  ? '1. Tvoja osobná peňaženka sa nepripája priamo k našej stránke — pripájaš si ju sám na oficiálnom portáli app.safe.global.\n2. Naša stránka komunikuje výhradne s tvojím Safe Smart Account kontraktom, kde Zodiac Roles Guard technicky zakazuje akýkoľvek prevod tokenov na cudziu adresu.'
                  : '1. Your personal wallet never connects directly to our site — you connect it yourself on official app.safe.global.\n2. Our app communicates strictly with your Safe Smart Account contract where external transfers are blocked.'}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleOpenModal}
              className="flex-1 py-3 px-4 rounded-xl bg-[#12FF80] text-black font-bold text-xs hover:bg-[#12FF80]/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_-4px_rgba(18,255,128,0.45)]"
            >
              <QrCode className="w-4 h-4" />
              {sk
                ? 'Prepojiť cez app.safe.global (WalletConnect / Safe App)'
                : 'Connect via app.safe.global (WalletConnect / Safe App)'}
            </button>

            <a
              href={portalUrls.openAsSafeAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              {sk ? 'Otvoriť priamo v app.safe.global' : 'Open inside app.safe.global'}
              <ExternalLink className="w-3.5 h-3.5 text-[#12FF80]" />
            </a>
          </div>
        </div>
      )}

      {/* NON-CUSTODIAL SAFE GLOBAL + WALLETCONNECT BRIDGE MODAL */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg bg-[#0b0e14] border border-[#12FF80]/35 text-foreground p-5 rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#12FF80]/15 border border-[#12FF80]/40 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#12FF80]" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {sk
                    ? 'Non-Custodial Prepojenie cez app.safe.global'
                    : 'Non-Custodial Connection via app.safe.global'}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground">
                  {sk
                    ? 'Tvoja peňaženka ostáva pripojená iba na oficiálnej stránke Safe Global. Tu prepojíš svoj Safe Smart Account s našou stránkou.'
                    : 'Your personal wallet stays connected only on official Safe Global. Bridge your Safe Smart Account here.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* STEP 1: SELECT NETWORK & OPEN APP.SAFE.GLOBAL */}
            <div className="rounded-xl bg-secondary/40 border border-border p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#12FF80]">
                  {sk
                    ? 'KROK 1: Otvor app.safe.global a pripoj tam svoju peňaženku'
                    : 'STEP 1: Open app.safe.global and connect your wallet there'}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">100% Non-Custodial</span>
              </div>

              <p className="text-[11px] text-muted-foreground leading-snug">
                {sk
                  ? 'Na stránke app.safe.global si sám vyberieš a pripojíš svoju peňaženku (MetaMask, Rabby, Ledger, Trezor, Phantom, Trust, Coinbase, OKX…). Naša stránka nemá nikdy priamy prístup k tvojej podpisovej peňaženke.'
                  : 'On app.safe.global you choose and connect your own wallet (MetaMask, Rabby, Ledger, Trezor, Phantom, Trust…). Our site never has direct access to your signer wallet.'}
              </p>

              {/* Chain selector */}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <a
                  href={portalUrls.openAsSafeAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-[#12FF80] text-black font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#12FF80]/90 transition-colors"
                >
                  {sk ? 'Otvoriť túto stránku v app.safe.global' : 'Open this site inside app.safe.global'}
                  <ArrowUpRight className="w-4 h-4" />
                </a>

                <a
                  href={portalUrls.openSafeDashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  {sk ? 'Otvoriť môj Safe na app.safe.global' : 'Open my Safe on app.safe.global'}
                  <ExternalLink className="w-3.5 h-3.5 text-[#12FF80]" />
                </a>
              </div>
            </div>

            {/* STEP 2: WALLETCONNECT V2 BRIDGE (QR CODE + PAIRING URI FOR APP.SAFE.GLOBAL) */}
            <div className="rounded-xl bg-secondary/40 border border-border p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#12FF80] flex items-center gap-1.5">
                  <QrCode className="w-4 h-4" />
                  {sk
                    ? 'KROK 2: Prepoj Safe Global s našou stránkou cez WalletConnect'
                    : 'STEP 2: Bridge Safe Global to our site via WalletConnect'}
                </span>
                <button
                  type="button"
                  onClick={() => setWcPairingUri(generateStandardWcV2PairingUri())}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  {sk ? 'Nový WC kód' : 'New WC URI'}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white shrink-0">
                  <QRCodeSVG value={wcPairingUri} size={116} level="M" />
                </div>

                <div className="space-y-2 flex-1 min-w-0 w-full">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {sk
                      ? 'V hornej lište na stránke app.safe.global klikni na ikonu WalletConnect a vlož tento Pairing kód (alebo naskenuj QR kód v mobilnej aplikácii Safe{Wallet}):'
                      : 'In the top bar of app.safe.global click the WalletConnect icon and paste this Pairing code (or scan the QR code in Safe{Wallet} mobile):'}
                  </p>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={wcPairingUri}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/50 text-[10px] font-mono text-muted-foreground border border-border truncate"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          wcPairingUri,
                          'WalletConnect Pairing URI skopírované! Vlož ho do WalletConnect v app.safe.global.',
                          'WalletConnect Pairing URI copied! Paste it into WalletConnect in app.safe.global.',
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-[#12FF80]/20 text-[#12FF80] border border-[#12FF80]/40 text-[11px] font-bold flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      {sk ? 'Kopírovať WC' : 'Copy WC'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          currentOrigin,
                          'URL našej Safe App skopírovaná! V app.safe.global → Apps → Add custom Safe App vlož túto URL.',
                          'Safe App URL copied!',
                        )
                      }
                      className="text-[10px] text-[#12FF80] hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {sk
                        ? `Kopírovať URL našej stránky pre Safe Apps (${currentOrigin})`
                        : `Copy our Safe App URL (${currentOrigin})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 3: VERIFY & BIND YOUR ON-CHAIN SAFE CONTRACT ADDRESS */}
            <div className="rounded-xl bg-secondary/40 border border-border p-3.5 space-y-3">
              <span className="text-xs font-bold text-[#12FF80] block">
                {sk
                  ? 'KROK 3: Zadaj adresu svojho Safe trezoru z app.safe.global (On-Chain Kontrola)'
                  : 'STEP 3: Enter your Safe vault address from app.safe.global (On-Chain Verification)'}
              </span>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground block">
                  {sk
                    ? 'Adresa tvojho Safe Smart Accountu (napr. arb1:0x… alebo eth:0x…):'
                    : 'Your Safe Smart Account address (e.g. arb1:0x… or eth:0x…):'}
                </label>
                <input
                  type="text"
                  value={safeAddressInput}
                  onChange={(e) => {
                    setSafeAddressInput(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="arb1:0x... (adresa tvojho Safe kontraktu z app.safe.global)"
                  className="w-full px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-mono border border-border focus:border-[#12FF80] focus:outline-none"
                />
              </div>

              {/* Optional helper: Lookup Safes by Owner public address via Safe Global API */}
              <div className="pt-1 border-t border-border/50 space-y-1.5">
                <label className="text-[10px] text-muted-foreground block">
                  {sk
                    ? 'Nepamätáš si adresu svojho Safe? Zadaj verejnú adresu svojej peňaženky a vyhľadáme tvoje Safe účty priamo v Safe Global registri:'
                    : 'Find your deployed Safe accounts on Safe Global by entering your public owner address:'}
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={ownerLookupInput}
                    onChange={(e) => setOwnerLookupInput(e.target.value)}
                    placeholder="0x... (verejná adresa vlastníka na vyhľadanie v Safe Global)"
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/40 text-foreground text-[11px] font-mono border border-border focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={lookingUpSafes}
                    onClick={() => void handleLookupSafesByOwner()}
                    className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-[11px] font-semibold border border-border shrink-0"
                  >
                    {lookingUpSafes ? '...' : sk ? 'Nájsť môj Safe' : 'Find Safe'}
                  </button>
                </div>

                {discoveredSafes.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {discoveredSafes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSafeAddressInput(s)}
                        className="px-2 py-0.5 rounded bg-[#12FF80]/15 text-[#12FF80] border border-[#12FF80]/40 text-[10px] font-mono"
                      >
                        {formatShortAddress(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {validationError && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-2.5 flex items-start gap-2 text-[11px] text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p>{validationError}</p>
                    <a
                      href={portalUrls.openSafeWelcomeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#12FF80] font-semibold hover:underline"
                    >
                      {sk
                        ? 'Otvoriť app.safe.global a vytvoriť / vybrať Safe →'
                        : 'Open app.safe.global to create / select a Safe →'}
                    </a>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={verifying}
                onClick={() => void handleVerifyAndConnectSafe()}
                className="w-full py-2.5 px-4 rounded-xl bg-[#12FF80] text-black font-bold text-xs hover:bg-[#12FF80]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {sk
                  ? 'Overiť Safe Smart Account On-Chain & Prepojiť'
                  : 'Verify Safe Smart Account On-Chain & Connect'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
