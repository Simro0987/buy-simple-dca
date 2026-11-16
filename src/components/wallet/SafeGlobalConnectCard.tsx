import { useEffect, useRef, useState } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Link2,
  ExternalLink,
  Loader2,
  Unlink,
  QrCode,
  Copy,
  Eye,
  AlertTriangle,
  ArrowUpRight,
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
  buildSafeGlobalPortalUrls,
  detectSafeAppsSdkContext,
  formatShortAddress,
  saveSafeSession,
  type SupportedChainId,
  type SafeSession,
  type OnChainSafeVerification,
} from '@/lib/safeWalletGuard';
import {
  connectSafeViaWalletConnect,
  disconnectWalletConnect,
  isWalletConnectConfigured,
} from '@/lib/safeWalletConnect';

interface Props {
  lang?: 'sk' | 'en';
  compact?: boolean;
  defaultOpenModal?: boolean;
  onConnected?: (session: SafeSession) => void;
}

type Mode = 'menu' | 'walletconnect' | 'watch';

/** Safe{Wallet} only exists on EVM chains - BTC / SOL / HYPE entries are not selectable here. */
const EVM_SAFE_CHAINS = SAFE_SUPPORTED_CHAINS.filter((c) => c.chainIdNumeric && c.rpcUrl);

function buildSession(
  address: string,
  chain: SupportedChainId,
  check: OnChainSafeVerification,
  connectedVia: SafeSession['connectedVia'],
  walletName: string,
): SafeSession {
  const modules = check.modules ?? [];
  return {
    safeAddress: address,
    owners: check.owners,
    signerAddress: check.owners[0],
    selectedWalletName: walletName,
    primaryChain: chain,
    enabledChains: EVM_SAFE_CHAINS.map((c) => c.id),
    connectedVia,
    onChainVerified: true,
    nonCustodial: true,
    threshold: check.threshold,
    ownersCount: check.ownersCount,
    safeVersion: check.safeVersion,
    onChainGuard: check.guard ?? null,
    onChainModules: modules,
    zodiacRolesGuardActive: Boolean(check.guard) || modules.length > 0,
    guardPolicy: { ...DEFAULT_SAFE_GUARD_POLICY },
    connectedAt: Date.now(),
  };
}

/**
 * Simplified Safe{Wallet} connection. Three ways, from best to simplest:
 *  1. Open this app INSIDE app.safe.global (Safe App) -> connects automatically, no copy/paste.
 *  2. WalletConnect: show a real `wc:` QR/URI, paste it into Safe{Wallet}'s WalletConnect button.
 *  3. Watch-only: paste the Safe address; verified on-chain (fail-closed), read-only.
 * In every mode this app holds NO keys; every transaction is signed by the owners in Safe{Wallet}.
 */
export function SafeGlobalConnectCard({
  lang = 'sk',
  compact = false,
  defaultOpenModal = false,
  onConnected,
}: Props) {
  const sk = lang === 'sk';
  const t = (skText: string, enText: string) => (sk ? skText : enText);
  const { safeSession, signInWithSafe } = useAuth();

  const [modalOpen, setModalOpen] = useState(defaultOpenModal);
  const [mode, setMode] = useState<Mode>('menu');
  const [chain, setChain] = useState<SupportedChainId>(safeSession?.primaryChain ?? 'arbitrum');
  const [addressInput, setAddressInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wcUri, setWcUri] = useState<string>('');
  const wcRunId = useRef(0);
  const wcAvailable = isWalletConnectConfigured();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const portal = buildSafeGlobalPortalUrls({ chainId: chain, appUrl: origin });

  // Auto-connect when opened as a Safe App inside app.safe.global.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const iframeSession = await detectSafeAppsSdkContext(1500);
      if (!iframeSession || cancelled) return;
      // Enrich with on-chain guard/module info (best effort).
      const check = await verifySafeContractOnChain(iframeSession.safeAddress, iframeSession.primaryChain);
      const session = check.isSafeContract
        ? buildSession(
            iframeSession.safeAddress,
            iframeSession.primaryChain,
            check,
            'safe_app_iframe_sdk',
            'Safe{Wallet} (Safe App)',
          )
        : iframeSession;
      signInWithSafe(session);
      onConnected?.(session);
    })();
    return () => {
      cancelled = true;
    };
  }, [signInWithSafe, onConnected]);

  const openModal = (m: Mode = 'menu') => {
    setError(null);
    setMode(m);
    setModalOpen(true);
  };

  const finish = (session: SafeSession) => {
    signInWithSafe(session);
    setModalOpen(false);
    setMode('menu');
    toast.success(
      t(
        `Safe ${formatShortAddress(session.safeAddress)} pripojený (${session.threshold}/${session.ownersCount}).`,
        `Safe ${formatShortAddress(session.safeAddress)} connected (${session.threshold}/${session.ownersCount}).`,
      ),
    );
    onConnected?.(session);
  };

  const verifyAndFinish = async (
    rawAddress: string,
    chainId: SupportedChainId,
    via: SafeSession['connectedVia'],
    walletName: string,
  ) => {
    const check = await verifySafeContractOnChain(rawAddress, chainId);
    if (!check.isSafeContract) {
      setError(t(check.errorReasonSk ?? 'Nie je to Safe.', check.errorReasonEn ?? 'Not a Safe.'));
      return false;
    }
    finish(buildSession(parseSafeAddressInput(rawAddress).address, check.chainChecked, check, via, walletName));
    return true;
  };

  const startWalletConnect = async () => {
    setMode('walletconnect');
    setError(null);
    setWcUri('');
    setBusy(true);
    const runId = ++wcRunId.current;
    try {
      const res = await connectSafeViaWalletConnect((uri) => {
        if (runId === wcRunId.current) setWcUri(uri);
      });
      if (runId !== wcRunId.current) return;
      if (!res.chain) {
        setError(t(`Nepodporovaná sieť (chainId ${res.chainIdNumeric}).`, `Unsupported chain (chainId ${res.chainIdNumeric}).`));
        await disconnectWalletConnect();
        return;
      }
      setChain(res.chain);
      const ok = await verifyAndFinish(res.address, res.chain, 'safe_walletconnect', res.peerName || 'Safe{Wallet} (WalletConnect)');
      if (!ok) {
        setError((prev) =>
          (prev ? prev + ' ' : '') +
          t(
            'Pripojená peňaženka nie je Safe. V app.safe.global najprv otvor svoj Safe a WalletConnect spusti odtiaľ.',
            'The connected wallet is not a Safe. Open your Safe on app.safe.global and start WalletConnect from there.',
          ),
        );
        await disconnectWalletConnect();
      }
    } catch (e) {
      if (runId !== wcRunId.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(t(`WalletConnect zlyhal: ${msg}`, `WalletConnect failed: ${msg}`));
    } finally {
      if (runId === wcRunId.current) setBusy(false);
    }
  };

  const connectWatchOnly = async () => {
    setError(null);
    const parsed = parseSafeAddressInput(addressInput);
    if (!parsed.valid) {
      setError(t('Vlož adresu Safe v tvare 0x… alebo arb1:0x…', 'Paste the Safe address as 0x… or arb1:0x…'));
      return;
    }
    const chainId = parsed.chain ?? chain;
    setBusy(true);
    try {
      await verifyAndFinish(parsed.address, chainId, 'safe_onchain_verified', t('Safe (iba sledovanie)', 'Safe (watch-only)'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    void disconnectWalletConnect();
    saveSafeSession(null);
    toast.info(t('Safe odpojený.', 'Safe disconnected.'));
  };

  const closeModal = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      wcRunId.current++;
      setBusy(false);
      setMode('menu');
      if (mode === 'walletconnect') void disconnectWalletConnect();
    }
  };

  // ---------------------------------------------------------------- connected
  if (safeSession) {
    const chainInfo = SAFE_SUPPORTED_CHAINS.find((c) => c.id === safeSession.primaryChain);
    const modules = safeSession.onChainModules ?? [];
    const hasOnChainProtection = Boolean(safeSession.onChainGuard) || modules.length > 0;
    const viaLabel =
      safeSession.connectedVia === 'safe_app_iframe_sdk'
        ? 'Safe App'
        : safeSession.connectedVia === 'safe_walletconnect'
          ? 'WalletConnect'
          : t('iba sledovanie', 'watch-only');
    return (
      <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.06] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-emerald-300">
                Safe{'{'}Wallet{'}'} · {chainInfo?.name ?? safeSession.primaryChain} · {viaLabel}
              </div>
              <p className="text-xs font-mono text-foreground mt-0.5 break-all">{safeSession.safeAddress}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('Podpisy', 'Signatures')}: {safeSession.threshold}/{safeSession.ownersCount}
                {safeSession.safeVersion ? ` · v${safeSession.safeVersion}` : ''}
                {safeSession.owners.length > 0 &&
                  ` · ${t('vlastníci', 'owners')}: ${safeSession.owners.map((o) => formatShortAddress(o)).join(', ')}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={buildSafeGlobalPortalUrls({ chainId: safeSession.primaryChain, safeAddress: safeSession.safeAddress, appUrl: origin }).openSafeDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg bg-[#12FF80] text-black text-[11px] font-bold flex items-center gap-1"
            >
              app.safe.global <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={disconnect}
              className="px-2.5 py-1.5 rounded-lg bg-secondary/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground text-[11px] font-medium flex items-center gap-1"
            >
              <Unlink className="w-3.5 h-3.5" /> {t('Odpojiť', 'Unlink')}
            </button>
          </div>
        </div>

        <div
          className={`rounded-xl border p-2.5 text-[11px] leading-snug flex gap-2 ${
            hasOnChainProtection ? 'border-emerald-500/30 bg-black/30' : 'border-amber-500/40 bg-amber-500/10'
          }`}
        >
          {hasOnChainProtection ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <div className="space-y-0.5">
            <p>
              {t(
                'Táto aplikácia nemá žiadne kľúče. Každú transakciu musia podpísať vlastníci Safe v app.safe.global.',
                'This app holds no keys. Every transaction must be signed by the Safe owners in app.safe.global.',
              )}
            </p>
            <p className="text-muted-foreground">
              {t('On-chain guard', 'On-chain guard')}: {safeSession.onChainGuard ? formatShortAddress(safeSession.onChainGuard) : t('žiadny', 'none')} ·{' '}
              {t('Moduly', 'Modules')}: {modules.length ? modules.map((m) => formatShortAddress(m)).join(', ') : t('žiadne', 'none')}
            </p>
            {!hasOnChainProtection && (
              <p className="text-amber-200">
                {t(
                  'Autonómne obchodovanie agentov NIE JE zapnuté. Ak ho chceš, nastav Zodiac Roles podľa SAFE_AGENT_PERMISSIONS.md (agent smie len swapovať s príjemcom = tento Safe).',
                  'Autonomous agent trading is NOT enabled. To enable it, set up Zodiac Roles per SAFE_AGENT_PERMISSIONS.md (agent may only swap with recipient = this Safe).',
                )}
              </p>
            )}
            {modules.length > 0 && (
              <p className="text-amber-200">
                {t(
                  'Pozor: moduly môžu vykonávať transakcie BEZ podpisu vlastníkov. Over, že každý modul poznáš.',
                  'Warning: modules can execute transactions WITHOUT owner signatures. Make sure you recognise every module.',
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- not connected
  return (
    <>
      <div className="rounded-2xl border border-[#12FF80]/30 bg-[#12FF80]/[0.04] p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#12FF80]/15 border border-[#12FF80]/40 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-[#12FF80]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{t('Pripojiť Safe{Wallet}', 'Connect Safe{Wallet}')}</h3>
            {!compact && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t(
                  'Aplikácia nikdy nedostane tvoj privátny kľúč. Peňaženku (MetaMask, Ledger, Rabby…) pripájaš len na app.safe.global.',
                  'This app never gets your private key. You connect your wallet (MetaMask, Ledger, Rabby…) only on app.safe.global.',
                )}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href={portal.openAsSafeAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3 rounded-xl bg-[#12FF80] text-black font-bold text-xs flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" /> {t('Otvoriť v Safe{Wallet}', 'Open in Safe{Wallet}')}
          </a>
          <button
            type="button"
            disabled={!wcAvailable}
            title={wcAvailable ? '' : t('Chýba VITE_WALLETCONNECT_PROJECT_ID', 'VITE_WALLETCONNECT_PROJECT_ID missing')}
            onClick={() => {
              openModal('walletconnect');
              void startWalletConnect();
            }}
            className="py-2.5 px-3 rounded-xl bg-secondary text-foreground font-semibold text-xs border border-border flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <QrCode className="w-4 h-4 text-[#12FF80]" /> WalletConnect
          </button>
          <button
            type="button"
            onClick={() => openModal('watch')}
            className="py-2.5 px-3 rounded-xl bg-secondary text-foreground font-semibold text-xs border border-border flex items-center justify-center gap-1.5"
          >
            <Eye className="w-4 h-4 text-sky-400" /> {t('Iba sledovať adresu', 'Watch address only')}
          </button>
        </div>
        {!compact && (
          <p className="text-[10px] text-muted-foreground">
            {t(
              'Odporúčané: „Otvoriť v Safe{Wallet}“ – aplikácia sa otvorí priamo v Safe a pripojí sa sama. Nemáš Safe? ',
              'Recommended: “Open in Safe{Wallet}” – the app opens inside Safe and connects by itself. No Safe yet? ',
            )}
            <a href={portal.openSafeWelcomeUrl} target="_blank" rel="noopener noreferrer" className="text-[#12FF80] hover:underline">
              {t('Vytvor si ho tu.', 'Create one here.')}
            </a>
          </p>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={closeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Pripojiť Safe{Wallet}', 'Connect Safe{Wallet}')}</DialogTitle>
            <DialogDescription>
              {mode === 'walletconnect'
                ? t(
                    '1) Otvor svoj Safe na app.safe.global  2) klikni na ikonu WalletConnect hore  3) naskenuj QR alebo vlož kód.',
                    '1) Open your Safe on app.safe.global  2) click the WalletConnect icon at the top  3) scan the QR or paste the code.',
                  )
                : mode === 'watch'
                  ? t('Vlož adresu svojho Safe (nájdeš ju vľavo hore v app.safe.global).', 'Paste your Safe address (top-left in app.safe.global).')
                  : t('Vyber spôsob pripojenia.', 'Choose how to connect.')}
            </DialogDescription>
          </DialogHeader>

          {mode === 'menu' && (
            <div className="grid gap-2">
              <a href={portal.openAsSafeAppUrl} target="_blank" rel="noopener noreferrer" className="py-2.5 px-3 rounded-xl bg-[#12FF80] text-black font-bold text-xs flex items-center justify-center gap-1.5">
                <ExternalLink className="w-4 h-4" /> {t('Otvoriť v Safe{Wallet} (odporúčané)', 'Open in Safe{Wallet} (recommended)')}
              </a>
              <button type="button" disabled={!wcAvailable} onClick={() => void startWalletConnect()} className="py-2.5 px-3 rounded-xl bg-secondary text-xs font-semibold border border-border flex items-center justify-center gap-1.5 disabled:opacity-40">
                <QrCode className="w-4 h-4" /> WalletConnect
              </button>
              <button type="button" onClick={() => setMode('watch')} className="py-2.5 px-3 rounded-xl bg-secondary text-xs font-semibold border border-border flex items-center justify-center gap-1.5">
                <Eye className="w-4 h-4" /> {t('Iba sledovať adresu', 'Watch address only')}
              </button>
            </div>
          )}

          {mode === 'walletconnect' && (
            <div className="space-y-3">
              {wcUri ? (
                <>
                  <div className="flex justify-center">
                    <div className="bg-white p-2 rounded-xl">
                      <QRCodeSVG value={wcUri} size={180} level="M" />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <input readOnly value={wcUri} className="flex-1 px-2 py-1.5 rounded-lg bg-black/40 text-[10px] font-mono border border-border" />
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(wcUri);
                        toast.success(t('Skopírované', 'Copied'));
                      }}
                      className="px-2.5 rounded-lg bg-secondary border border-border"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <a href={portal.openSafeWelcomeUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#12FF80] hover:underline inline-flex items-center gap-1">
                    {t('Otvoriť app.safe.global', 'Open app.safe.global')} <ArrowUpRight className="w-3 h-3" />
                  </a>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('Čakám na schválenie v Safe{Wallet}…', 'Waiting for approval in Safe{Wallet}…')}
                  </p>
                </>
              ) : busy ? (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('Pripravujem WalletConnect…', 'Preparing WalletConnect…')}
                </p>
              ) : null}
              {!busy && (
                <button type="button" onClick={() => void startWalletConnect()} className="w-full py-2 rounded-xl bg-secondary text-xs font-semibold border border-border">
                  {t('Skúsiť znova', 'Try again')}
                </button>
              )}
            </div>
          )}

          {mode === 'watch' && (
            <div className="space-y-2">
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value as SupportedChainId)}
                className="w-full px-2.5 py-2 rounded-lg bg-black/40 text-xs border border-border"
              >
                {EVM_SAFE_CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={addressInput}
                onChange={(e) => {
                  setAddressInput(e.target.value);
                  const p = parseSafeAddressInput(e.target.value);
                  if (p.chain && EVM_SAFE_CHAINS.some((c) => c.id === p.chain)) setChain(p.chain);
                }}
                placeholder="arb1:0x… / 0x…"
                className="w-full px-2.5 py-2 rounded-lg bg-black/40 text-xs font-mono border border-border"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void connectWatchOnly()}
                className="w-full py-2.5 rounded-xl bg-[#12FF80] text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {t('Overiť on-chain a pripojiť', 'Verify on-chain & connect')}
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-2.5 flex items-start gap-2 text-[11px] text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
