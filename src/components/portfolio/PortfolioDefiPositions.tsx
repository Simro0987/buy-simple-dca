/**
 * PortfolioDefiPositions — DeFi prehľad portfólia v troch kategóriách:
 *  1. Main Wallet (Liquid)      — voľné aktíva, zdroj Fiat Bufferu a DCA rozpočtov
 *  2. Supplied & Staked         — kolaterál/staking cez 5 protokolov (live on-chain)
 *  3. Borrowed (Liabilities)    — aktívne USD/EUR stablecoin pôžičky
 * Každý riadok má badge siete a odhad gasu (⛽ $) pre interakciu na danej sieti.
 * Hlavička ukazuje celkové Current LTV vs. dynamické Target LTV.
 */
import { useMemo } from 'react';
import { Wallet, Layers, Landmark, Fuel } from 'lucide-react';
import { useSmartWalletAddress, useMultiProtocolBtc, useGasMap, isEvmAddress } from '@/hooks/useAaveArbitrumPosition';
import { useAssetLayers, layerFor } from '@/hooks/useAssetLayers';
import { useOracle } from '@/hooks/useOracleRegistry';
import { useEurUsd } from '@/hooks/useEurUsd';
import { BTC_CONFIG, ETH_CONFIG } from '@/lib/leverageEngine';
import { fmtQty } from '@/lib/formatNumber';
import type { BtcCollateralEntry, StableDebtEntry } from '@/lib/multiProtocolBtc';

const fmtUsd = (n: number) => `$${n.toLocaleString('sk-SK', { maximumFractionDigits: 2 })}`;

function ChainBadge({ chain, gas }: { chain: string; gas?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-purple-400/25 bg-purple-500/10 text-purple-300">{chain}</span>
      {gas != null && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-white/45">
          <Fuel className="w-2.5 h-2.5" /> {fmtUsd(gas)}
        </span>
      )}
    </span>
  );
}

function Row({ left, right, badge }: { left: React.ReactNode; right: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-[11px] text-white/80 truncate">{left}</span>
        {badge}
      </div>
      <span className="text-[11px] font-mono text-white/90 shrink-0">{right}</span>
    </div>
  );
}

function AssetBlock({
  asset, price, gasMap,
}: { asset: 'BTC' | 'ETH'; price?: number; gasMap?: Record<string, number> }) {
  const [addr] = useSmartWalletAddress(asset);
  const { data: eurUsd } = useEurUsd();
  const { data: btcO } = useOracle('btcUsd');
  const { data: ethO } = useOracle('ethUsd');
  const scan = useMultiProtocolBtc(addr, btcO?.value, eurUsd, asset, ethO?.value);
  const layers = useAssetLayers();
  const l = layerFor(layers, asset);
  const cfg = asset === 'BTC' ? BTC_CONFIG : ETH_CONFIG;

  const entries: BtcCollateralEntry[] = scan.data?.entries ?? [];
  const debts: StableDebtEntry[] = scan.data?.debts ?? [];
  const deposited = scan.data?.totalDepositedBtcAcrossAllProtocols ?? 0;
  const debtUsd = scan.data?.TotalDebtAcrossAllProtocols ?? 0;
  const collateralUsd = deposited * (price ?? 0);
  const ltv = collateralUsd > 0 ? debtUsd / collateralUsd : 0;

  const hasAnything = isEvmAddress(addr) || l.staked > 0 || l.collateral > 0 || debtUsd > 0;
  if (!hasAnything) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
        <p className="text-[11px] font-mono font-semibold text-white/80">{asset} · DeFi pozície</p>
        <p className="text-[10px] font-mono text-white/50">
          LTV <span className={ltv > cfg.maxLtv ? 'text-red-400' : 'text-[#14F195]'}>{(ltv * 100).toFixed(1)} %</span>
          <span className="text-white/30"> / cieľ {(cfg.targetLtv * 100).toFixed(0)} %</span>
        </p>
      </div>

      {/* 1. Main Wallet (Liquid) */}
      <div className="border-b border-white/[0.05]">
        <p className="px-3 pt-2 text-[9px] uppercase tracking-widest font-mono text-white/40 flex items-center gap-1">
          <Wallet className="w-3 h-3" /> Main Wallet (Liquid)
        </p>
        <Row
          left={`${asset} · voľný zostatok`}
          badge={<span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-white/50">Wallet</span>}
          right={`${fmtQty(Math.max(0, l.liquidOverride ?? 0))} ${asset}`}
        />
      </div>

      {/* 2. Supplied & Staked (Collateral) */}
      <div className="border-b border-white/[0.05]">
        <p className="px-3 pt-2 text-[9px] uppercase tracking-widest font-mono text-white/40 flex items-center gap-1">
          <Layers className="w-3 h-3" /> Supplied & Staked
        </p>
        {l.staked > 0 && (
          <Row
            left={`${asset} · natívny staking`}
            badge={<span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-white/50">Ledger</span>}
            right={`${fmtQty(l.staked)} ${asset}`}
          />
        )}
        {entries.map(e => (
          <Row
            key={`${e.protocol}-${e.chain}-${e.asset}`}
            left={`${e.asset} · ${e.protocol}`}
            badge={<ChainBadge chain={e.chain} gas={gasMap?.[e.chain]} />}
            right={`${e.amountBtc.toFixed(4)} ${asset}`}
          />
        ))}
        {!entries.length && l.staked <= 0 && (
          <p className="px-3 py-2 text-[10px] text-white/35 font-mono">Žiadny kolaterál — zadaj Smart Wallet adresu v Stake sekcii.</p>
        )}
      </div>

      {/* 3. Borrowed (Liabilities) */}
      <div>
        <p className="px-3 pt-2 text-[9px] uppercase tracking-widest font-mono text-white/40 flex items-center gap-1">
          <Landmark className="w-3 h-3" /> Borrowed (Liabilities)
        </p>
        {debts.length ? debts.map(d => (
          <Row
            key={`${d.protocol}-${d.chain}-${d.asset}`}
            left={`${d.asset} · ${d.protocol}`}
            badge={<ChainBadge chain={d.chain} gas={gasMap?.[d.chain]} />}
            right={`${d.peg === 'EUR' ? '€' : '$'}${d.amount.toFixed(2)}`}
          />
        )) : (
          <p className="px-3 py-2 text-[10px] text-white/35 font-mono">Bez aktívneho dlhu.</p>
        )}
      </div>
    </div>
  );
}

export function PortfolioDefiPositions() {
  const { data: btcO } = useOracle('btcUsd');
  const { data: ethO } = useOracle('ethUsd');
  const gas = useGasMap(ethO?.value);
  const blocks = useMemo(() => (['BTC', 'ETH'] as const), []);
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] uppercase tracking-widest text-white/45 font-mono px-1">DeFi pozície (5 vrstiev)</h2>
      {blocks.map(a => <AssetBlock key={a} asset={a} price={a === 'BTC' ? btcO?.value : ethO?.value} gasMap={gas.data} />)}
    </section>
  );
}
