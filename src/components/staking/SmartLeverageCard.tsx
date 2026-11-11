import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Check, Gauge, Zap, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  runCollateralShowdown, depegPct,
  LTV_HARD_CAP, LTV_MIN, LTV_MAX, type ShowdownResult,
} from '@/lib/collateralShowdown';
import { useLeverageRates } from '@/hooks/useLeverageRates';
import { GasGuardBadge } from './GasGuardBadge';


const DEFI_SAVER_URL = 'https://app.defisaver.com/recipes/create';

/** Malý skeleton loader namiesto čísla, kým sa ťahajú live dáta. */
function RateValue({ value, loading, className }: { value: number | null; loading: boolean; className?: string }) {
  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        <span className="inline-block h-3 w-8 animate-pulse rounded bg-slate-700/60 align-middle" />
      </span>
    );
  }
  return <span className={className}>{value == null ? '— %' : `${value.toFixed(2)} %`}</span>;
}


function fmtEth(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0.0000';
  if (n < 0.0001) return n.toExponential(3);
  return n.toFixed(4);
}

function CopyChip({ value, label }: { value: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(value.toFixed(6)));
      setCopied(true);
      toast({ title: label ? `${label} skopírované` : 'Skopírované', description: value.toFixed(6) });
      setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[11px] font-medium text-purple-200 transition hover:bg-purple-500/20 hover:border-purple-400/60"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'OK' : 'Copy'}
    </button>
  );
}

export interface SmartLeverageInputs {
  /** ETH k dispozícii pre Lido (wstETH) leg */
  lidoEth: number;
  /** ETH k dispozícii pre Rocket (rETH) leg */
  rocketEth: number;
  /** fallback APY (použité len ak live dáta nedobehnú) */
  lidoApy: number;
  rocketApy: number;
  /** on-chain kurzy */
  wstEthPerEth: number;
  rEthPerEth: number;
  /** trhové kurzy z najlepších route (0 = nedostupné) */
  wstEthMarketRatio: number;
  rEthMarketRatio: number;
  /** L1 → L2 bridge fee kolaterálu v USD */
  bridgeGasUsd: number;
  /** exekučný fee na L2 (swap + deposit do DeFi Saver) v USD */
  l2GasUsd: number;
  ethPriceUsd: number;
}

interface Props {
  inputs: SmartLeverageInputs;
  executed?: boolean;
  onConfirm: (payload: { symbol: string; ethAmount: number; ltv: number }) => void;
  /** ratio pracovného kapitálu smerovaného do páky (0..1) */
  leverageShare?: number;
  onResult?: (r: {
    symbol: string; ethAmount: number; ltv: number; depegPct: number; netCarry: number;
  } | null) => void;
}

export function SmartLeverageCard({ inputs, executed, onConfirm, leverageShare = 0.6, onResult }: Props) {
  const { rates, loading } = useLeverageRates();
  const [open, setOpen] = useState(false);

  // Live dáta majú prioritu; fallback drží engine funkčný aj pri výpadku API.
  const lidoApy = rates.lidoApy ?? inputs.lidoApy;
  const rocketApy = rates.rocketApy ?? inputs.rocketApy;
  const borrowApy = rates.borrowApy ?? 2.6;
  const borrowChain = rates.borrowChain ?? 'Arbitrum';

  const showdown: ShowdownResult = useMemo(() => runCollateralShowdown({
    rEthApy: rocketApy,
    wstEthApy: lidoApy,
    borrowApy,
    rEthDepegPct: depegPct(inputs.rEthMarketRatio, inputs.rEthPerEth),
    wstEthDepegPct: depegPct(inputs.wstEthMarketRatio, inputs.wstEthPerEth),
  }), [inputs, lidoApy, rocketApy, borrowApy]);

  const winner = showdown.winner;
  const legEth = winner.symbol === 'wstETH' ? inputs.lidoEth : inputs.rocketEth;
  const depositEth = Math.max(0, legEth * leverageShare);
  const borrowEth = depositEth * (showdown.targetLtv / 100);
  // Kurz LST vs ETH: on-chain ratio je "token per ETH" (napr. 0.855 wstETH / 1 ETH),
  // takže 1 token = 1 / ratio ETH (~1.17 ETH). Fallbacky držia math bezpečný.
  const tokensPerEth = winner.symbol === 'wstETH'
    ? (inputs.wstEthPerEth > 0 ? inputs.wstEthPerEth : 0.855)
    : (inputs.rEthPerEth > 0 ? inputs.rEthPerEth : 0.905);
  const ethPerToken = 1 / tokensPerEth;              // exchange rate (1 LST ≈ X ETH)
  const depositTokens = depositEth / ethPerToken;    // (alokovaný ETH kapitál) / kurz
  // Route: L1 bridge kolaterálu na L2 + exekúcia (swap/deposit) na L2.
  const totalGasUsd = Math.max(0, inputs.bridgeGasUsd) + Math.max(0, inputs.l2GasUsd);


  useEffect(() => {
    onResult?.(depositEth > 0
      ? {
          symbol: winner.symbol,
          ethAmount: depositEth,
          ltv: showdown.targetLtv,
          depegPct: winner.depegPct,
          netCarry: winner.netCarry,
        }
      : null);
  }, [depositEth, winner.symbol, winner.depegPct, winner.netCarry, showdown.targetLtv, onResult]);




  const ltvPos = Math.min(100, (showdown.targetLtv / LTV_HARD_CAP) * 100);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 backdrop-blur-sm transition ${
        executed
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-slate-950/60 to-slate-950/40 hover:border-purple-400/40'
      }`}
    >
      {!executed && <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${executed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-purple-500/15 text-purple-300'}`}>
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Vrstva 3 · Smart Leverage (DeFi Saver)</div>
            <div className="text-[11px] text-slate-400">Collateral Showdown · Aave v3 · automatický unwind</div>
          </div>
        </div>
        {executed && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">✅ Exekuované</span>}
      </div>

      <div className="relative mt-3 space-y-2">
        {/* Winner */}
        <div className="rounded-lg border border-emerald-500/25 bg-black/30 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-emerald-200">🏆 Víťazný kolaterál · {winner.symbol}</div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <span>Borrow WETH ({borrowChain})</span>
              <RateValue value={rates.borrowApy} loading={loading} className="font-mono text-slate-300" />
              <span>· {rates.borrowApy != null ? 'live' : 'fallback'}</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-black/40 p-2">
              <div className="text-[10px] text-slate-500">Yield</div>
              <div className="font-mono text-sm text-emerald-200">
                <RateValue
                  value={winner.symbol === 'wstETH' ? rates.lidoApy : rates.rocketApy}
                  loading={loading}
                />
              </div>
            </div>
            <div className="rounded-md bg-black/40 p-2">
              <div className="text-[10px] text-slate-500">Net carry</div>
              <div className={`font-mono text-sm ${winner.netCarry >= 0 ? 'text-emerald-200' : 'text-red-300'}`}>
                {loading ? <RateValue value={null} loading /> : `${winner.netCarry >= 0 ? '+' : ''}${winner.netCarry.toFixed(2)} %`}
              </div>
            </div>
            <div className="rounded-md bg-black/40 p-2">
              <div className="text-[10px] text-slate-500">Depeg</div>
              <div className="font-mono text-sm text-slate-200">{winner.depegPct.toFixed(2)} %</div>
            </div>
          </div>


          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-black/40 px-3 py-2">
            <div className="text-[12px] text-slate-300">Vložiť ako kolaterál ({winner.symbol})</div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="font-mono text-base font-semibold text-purple-200">
                  {fmtEth(depositTokens)} {winner.symbol}
                </div>
                <div className="font-mono text-[10px] text-slate-500">
                  (≈ {fmtEth(depositEth)} ETH kapitálu)
                </div>
              </div>
              <CopyChip value={depositTokens} label={`${winner.symbol} kolaterál`} />
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-500">
            <span>Kurz: 1 {winner.symbol} ≈ <span className="font-mono text-slate-300">{ethPerToken.toFixed(4)} ETH</span></span>
            {inputs.ethPriceUsd > 0 && <span>≈ ${(depositEth * inputs.ethPriceUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}
          </div>
          <div className="mt-0.5 px-1 text-[10px] text-slate-500">
            Pôžička WETH pri cieľovom LTV: <span className="font-mono text-slate-300">{fmtEth(borrowEth)} ETH</span>
          </div>

        </div>

        {/* LTV gauge */}
        <div className="rounded-lg border border-purple-500/20 bg-black/30 p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-widest text-purple-300/80">Cieľové LTV</span>
            <span className="font-mono text-purple-200">{showdown.targetLtv.toFixed(1)} %</span>
          </div>
          <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-black/50">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 via-emerald-500 to-purple-500"
              style={{ width: `${ltvPos}%` }}
            />
            <div className="absolute inset-y-0" style={{ left: `${(LTV_MIN / LTV_HARD_CAP) * 100}%` }}>
              <div className="h-full w-px bg-slate-400/50" />
            </div>
            <div className="absolute inset-y-0" style={{ left: `${(LTV_MAX / LTV_HARD_CAP) * 100}%` }}>
              <div className="h-full w-px bg-slate-400/50" />
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>{LTV_MIN} %</span>
            <span>bezpečná zóna {LTV_MIN}–{LTV_MAX} %</span>
            <span className="text-red-300">hard cap {LTV_HARD_CAP} %</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Efektívne APY na vlastný kapitál: <span className="font-mono text-emerald-300">{showdown.leveragedApy.toFixed(2)} %</span> · L1 bridge ${inputs.bridgeGasUsd.toFixed(2)} + L2 gas ${inputs.l2GasUsd.toFixed(2)} = ${totalGasUsd.toFixed(2)}
          </div>
        </div>

        {/* Fee protection · Borrow (L1 bridge + L2 exekúcia) */}
        <GasGuardBadge
          action="Borrow (DeFi Saver)"
          comparisonLabel="L1 Bridge + L2 Gas vs Projected Yield"
          amountUsd={depositEth * inputs.ethPriceUsd}
          apyPct={Math.max(0, showdown.leveragedApy)}
          gasUsd={totalGasUsd}
        />




        {/* Why dropdown */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-[11px] font-medium text-slate-300 hover:text-slate-100"
        >
          <span>Prečo táto alokácia?</span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="space-y-1.5 rounded-lg border border-slate-700/60 bg-black/40 px-3 py-2 text-[11px] text-slate-300">
            {showdown.reasons.map((r, idx) => (
              <div key={idx} className="flex gap-1.5">
                <span className="text-purple-300">▸</span><span>{r}</span>
              </div>
            ))}
            <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="rounded bg-emerald-500/15 p-1.5 text-emerald-100">
                {winner.symbol} · skóre {winner.score.toFixed(1)}
              </div>
              <div className="rounded bg-black/40 p-1.5 text-slate-400">
                {showdown.loser.symbol} · skóre {showdown.loser.score.toFixed(1)}
              </div>
            </div>
            <div className="text-[10px] text-slate-500">
              Skóre = net carry ×10 − depeg ×6 − likviditná penalizácia. Páka sa exekuuje cez{' '}
              <a href={DEFI_SAVER_URL} target="_blank" rel="noreferrer" className="underline decoration-dotted">app.defisaver.com</a>{' '}
              s automatickým unwind triggerom.
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={!!executed || depositEth <= 0}
          onClick={() => onConfirm({ symbol: winner.symbol, ethAmount: depositEth, ltv: showdown.targetLtv })}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_25px_-5px_rgba(139,92,246,0.7)] transition hover:from-purple-500 hover:to-purple-400 disabled:opacity-40 disabled:shadow-none"
        >
          {executed ? '✅ Exekuované' : <><Zap className="h-3.5 w-3.5" /> Potvrdiť páku ({winner.symbol} @ {showdown.targetLtv.toFixed(0)} % LTV)</>}
        </button>
      </div>
    </div>
  );
}
