import { useEffect, useState } from 'react';
import {
  Activity,
  ShieldCheck,
  Lock,
  Bitcoin,
  Copy,
  Code2,
  Send,
  Layers,
  CheckCircle2,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import {
  loadEttSuperTrendState,
  subscribeEttSuperTrend,
  processEttTradingViewSignalOnDex,
  generateEttSuperTrendPineScript,
  type EttSuperTrendAgentState,
} from '@/lib/ettSuperTrendAgent';

interface Props {
  lang: Lang;
}

export function EttSuperTrendPanel({ lang }: Props) {
  const sk = lang === 'sk';
  const { safeSession } = useAuth();
  const [ett, setEtt] = useState<EttSuperTrendAgentState>(() => loadEttSuperTrendState());
  const [showPineScript, setShowPineScript] = useState(false);
  const [webhookJsonInput, setWebhookJsonInput] = useState<string>(
    '{"strategy":"ETT SuperTrend Strategy","ticker":"BTC/USD","action":"BUY","timeframe":"1h","priceUsd":75120}',
  );

  const activeSafeAddress =
    safeSession?.safeAddress ?? '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  useEffect(() => {
    return subscribeEttSuperTrend(() => {
      setEtt(loadEttSuperTrendState());
    });
  }, []);

  const handleCopyPineScript = () => {
    const code = generateEttSuperTrendPineScript();
    void navigator.clipboard.writeText(code);
    toast.success(
      sk
        ? 'Pine Script v5 (ETT SuperTrend + Fibo Zones + EMA/MA Color Signal) skopírovaný do schránky!'
        : 'Pine Script v5 copied to clipboard!',
    );
  };

  const handleSimulateTradingViewAlert = () => {
    try {
      const parsed = JSON.parse(webhookJsonInput.trim());
      const { alertEntry, updatedState } = processEttTradingViewSignalOnDex(
        parsed,
        activeSafeAddress,
        75000,
      );
      setEtt(updatedState);
      toast.success(
        sk
          ? `TradingView signál (${alertEntry.strategy} · ${alertEntry.ticker}) spracovaný na DEX (${alertEntry.dexVenueUsed}) → +${alertEntry.btcAccumulated.toFixed(6)} BTC v Safe!`
          : `TradingView signal (${alertEntry.strategy}) executed on DEX (${alertEntry.dexVenueUsed}) → +${alertEntry.btcAccumulated.toFixed(6)} BTC in Safe!`,
      );
    } catch {
      toast.error(
        sk ? 'Neplatný JSON formát TradingView alertu' : 'Invalid TradingView JSON payload',
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* 3-Pillar Architecture Header (Replacing TradingView -> Bitunix CEX -> Lovable with 100% Sovereign DEX) */}
      <div className="rounded-2xl border border-[#14F195]/40 bg-[#14F195]/[0.05] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#14F195]/20 border border-[#14F195]/40 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-[#14F195]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-foreground">
                  ETT SuperTrend · Fibo Zóny &amp; EMA/MA Color Signal AI Agent
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Ban className="w-3 h-3" />
                  BEZ BITUNIX / BEZ CEX
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {sk
                  ? '100% On-Chain Non-Custodial náhrada za pôvodný CEX setup: zachováva mozog signálov (ETT SuperTrend Strategy, Fibo zóny, EMA/MA Color Signal Change), ale namiesto Bitunix CEX burzy vykonáva všetky obchody priamo na decentralizovaných DEXoch vo vnútri tvojej Safe Global peňaženky s cieľom mať viac BTC.'
                  : '100% On-Chain Non-Custodial replacement for the CEX setup: keeps the ETT SuperTrend, Fibo Zones & EMA/MA Color Signal brain, but executes strictly on decentralized DEXs inside your Safe Global wallet to accumulate more BTC.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" />
              100% DEX In-Wallet
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Bitcoin className="w-3 h-3" />
              +{ett.totalBtcStackedViaSuperTrend.toFixed(5)} ₿
            </span>
          </div>
        </div>

        {/* 3-Column Comparison Table (Matching the uploaded "Nástroje potrebné pre Bot Trading" diagram, upgraded to 100% DEX) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <div className="rounded-xl bg-black/50 border border-[#14F195]/30 p-3 space-y-1">
            <div className="text-[10px] font-bold text-[#14F195] uppercase tracking-wider">
              1. TradingView + Pyth Orákulá
            </div>
            <div className="text-xs font-bold text-foreground">
              Mozog signálov (Bez zmeny)
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Bežia tu indikátory <strong>ETT SuperTrend Strategy</strong>, <strong>Fibo zóny (0.618 Golden Pocket)</strong> a <strong>EMA/MA Color Signal Change</strong> — počítané naživo v termináli aj cez TradingView Webhook.
            </p>
          </div>

          <div className="rounded-xl bg-black/50 border border-amber-400/40 p-3 space-y-1">
            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              2. On-Chain DEX (Namiesto Bitunix CEX)
            </div>
            <div className="text-xs font-bold text-foreground">
              Exekúcia v Safe Global (0% CEX)
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Žiadny Bitunix, žiadne KYC ani zverovanie USDT burze! Obchody sa vykonávajú cez <strong>Hyperliquid DEX, GMX v2, CowSwap a Jupiter v6</strong> priamo vo vnútri tvojej Safe peňaženky.
            </p>
          </div>

          <div className="rounded-xl bg-black/50 border border-sky-400/30 p-3 space-y-1">
            <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
              3. Sovereign Terminal (Namiesto Lovable)
            </div>
            <div className="text-xs font-bold text-foreground">
              100% Nezávislá Swarm Sieť
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Plne autonómny terminál bez závislosti na Lovable, prepojený s <strong>Arweave, Filecoin, Akash, Pyth, Chainlink a Bittensor TAO</strong>. Všetci agenti spolupracujú na cieli: <strong>Viac BTC</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* LIVE ETT SUPERTREND, FIBO ZONES & EMA/MA COLOR SIGNAL MATRIX */}
      <div className="glass-card p-4 space-y-3 border border-white/[0.08]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#14F195]" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {sk
                ? 'Živá Matica Indikátorov: ETT SuperTrend + Fibo Zóny + EMA/MA Color Signal'
                : 'Live Indicator Matrix: ETT SuperTrend + Fibo Zones + EMA/MA Color Signal'}
            </h3>
          </div>
          <span className="text-[10px] font-mono text-emerald-300">
            Úspešnosť signálov: {ett.winRatePct.toFixed(1)}% ({ett.totalSignalsProcessed} DEX exekúcií)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {ett.indicators.map((ind) => (
            <div
              key={ind.symbol}
              className="rounded-xl bg-secondary/50 border border-border/70 p-3 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black font-mono text-foreground">{ind.symbol}/USD</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    ${ind.spotPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    ind.superTrendDirection === 'BULLISH_GREEN'
                      ? 'bg-[#14F195]/20 text-[#14F195] border border-[#14F195]/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  SuperTrend: {ind.superTrendDirection === 'BULLISH_GREEN' ? 'GREEN BULL' : 'RED BEAR'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono bg-black/40 rounded-lg p-2 border border-white/[0.05]">
                <div>
                  <span className="text-muted-foreground block">SuperTrend Stop</span>
                  <span className="text-foreground font-bold">${ind.superTrendLineUsd.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Fibo 0.618 (Zóna)</span>
                  <span className="text-amber-300 font-bold">
                    ${ind.fiboLevels.fibo618GoldenPocket.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">EMA21 / SMA55</span>
                  <span className="text-[#14F195] font-bold">
                    {ind.emaColorSignal === 'NEON_GREEN_UP' ? '● NEON GREEN' : '● AMBER'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground truncate">
                  DEX: <strong className="text-foreground/90">{ind.dexVenue}</strong>
                </span>
                <span className="font-mono font-bold text-[#14F195]">
                  {ind.confluenceSignal} ({ind.confidencePct}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TRADINGVIEW PINE SCRIPT EXPORT & WEBHOOK DEX ROUTER */}
      <div className="glass-card p-4 space-y-3 border border-sky-500/30">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {sk
                ? 'TradingView Indikátor (Pine Script v5) & Priamy DEX Webhook prijímač'
                : 'TradingView Indicator (Pine Script v5) & Direct DEX Webhook Receiver'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyPineScript}
              className="px-2.5 py-1 rounded-lg bg-[#14F195] text-black text-[11px] font-bold flex items-center gap-1 hover:bg-[#14F195]/90"
            >
              <Copy className="w-3 h-3" />
              {sk ? 'Kopírovať Pine Script pre TradingView' : 'Copy Pine Script'}
            </button>
            <button
              type="button"
              onClick={() => setShowPineScript((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-[11px] font-semibold border border-border"
            >
              {showPineScript ? (sk ? 'Skryť kód' : 'Hide Code') : sk ? 'Zobraziť Pine Script' : 'Show Pine Script'}
            </button>
          </div>
        </div>

        {showPineScript && (
          <pre className="rounded-xl bg-black/70 border border-white/10 p-3 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-56">
            {generateEttSuperTrendPineScript()}
          </pre>
        )}

        <div className="space-y-2 pt-1">
          <label className="text-[11px] text-muted-foreground block">
            {sk
              ? 'Otestovať príchod TradingView Webhook alertu (vykoná sa 100% na DEXoch vo vnútri Safe peňaženky bez CEX):'
              : 'Simulate incoming TradingView Webhook alert (executes 100% on DEXs inside Safe wallet without CEX):'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={webhookJsonInput}
              onChange={(e) => setWebhookJsonInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-secondary text-foreground text-xs font-mono border border-border focus:outline-none focus:border-[#14F195]"
            />
            <button
              type="button"
              onClick={handleSimulateTradingViewAlert}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              {sk ? 'Spracovať TV Signál cez DEX → +BTC' : 'Execute TV Signal on DEX → +BTC'}
            </button>
          </div>
        </div>

        {/* Recent DEX Executions from ETT SuperTrend Signals */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            {sk
              ? 'Posledné On-Chain DEX exekúcie zo signálov ETT SuperTrend / Fibo / EMA:'
              : 'Recent On-Chain DEX Executions from ETT SuperTrend / Fibo / EMA Signals:'}
          </span>
          {ett.recentSignals.slice(0, 6).map((sig) => (
            <div
              key={sig.id}
              className="rounded-lg bg-black/40 border border-emerald-500/25 px-3 py-2 text-[11px] flex items-center justify-between gap-2 flex-wrap"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-foreground">{sig.strategy}</span>
                <span className="font-mono text-[#14F195]">{sig.ticker} ({sig.timeframe})</span>
                <span className="text-muted-foreground text-[10px]">→ {sig.dexVenueUsed}</span>
              </div>
              <span className="font-mono font-bold text-amber-400">
                +{sig.btcAccumulated.toFixed(6)} BTC (Safe In-Wallet)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
