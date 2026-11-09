import { useState } from 'react';
import {
  ShieldCheck, Radar, ArrowDownUp, Fuel, RotateCcw, Trophy, Sparkles,
  TrendingUp, TrendingDown, AlertTriangle, Undo2, PowerOff, Banknote, PackageOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { TokenValue } from './TokenValue';
import { RecordActionButton } from './RecordActionButton';
import { DefiSaverAlmPanel } from './DefiSaverAlmPanel';
import { BorrowAllocatorPanel } from './BorrowAllocatorPanel';
import { useLiveMarketData } from '@/hooks/useLiveMarketData';
import { useYieldScanner } from '@/hooks/useYieldScanner';
import { useGlobalBalances } from '@/hooks/useGlobalBalances';
import { usePortfolioAssets } from '@/hooks/usePortfolioAssets';
import { useDefiActions } from '@/stores/defiActionStore';
import {
  BTC_CONFIG, ETH_CONFIG, dynamicNativeSplit, liquidationPrice, distanceToLiquidation,
  currentLtv, riskLevel,
  borrowPlan,
} from '@/lib/leverageEngine';
import { candidateRoutes, winningRoute, bestStableSupply, cheapestStableBorrow, isEurStable, bestCombinedRoute, bestNetRoute, refinancingSaving } from '@/lib/smartYieldRoutes';
import { priorityGasUsd } from '@/lib/gasOracle';
import { useEurUsd } from '@/hooks/useEurUsd';
import { weeklyBudget } from '@/lib/weeklyBudget';
import { useLidoApr } from '@/hooks/useStakingApr';
import { useAssetLayers, layerFor, splitLayers } from '@/hooks/useAssetLayers';
import { layerTarget, grandTotalOf } from '@/lib/dynamicTargets';
import { useFearGreed } from '@/hooks/usePrices';
import { useOracle } from '@/hooks/useOracleRegistry';
import { useMarketData } from '@/hooks/useMarketData';
import { Button } from '@/components/ui/button';
import { fmtQty } from '@/lib/formatNumber';
import { unwindPlan, borrowPillars, dissolvedValue, type SupplyPosition } from '@/lib/leverageEngine';
import { useStakeOperationsStore } from '@/stores/stakeOperationsStore';
import { useStakeAlmStore } from '@/stores/stakeAlmStore';
import { setAssetLayerOverride } from '@/stores/assetLayerOverrideStore';
import { UnwindSupplyPanel } from './UnwindSupplyPanel';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useMultiChainPosition, useMultiProtocolBtc, useSmartWalletAddress, isEvmAddress, useStableBuffer, useGasMap } from '@/hooks/useAaveArbitrumPosition';
import { Input } from '@/components/ui/input';
import { computeRoboAction, ETH_ROBO } from '@/lib/roboAdvisorEngine';
import { AuditLogPanel } from './AuditLogPanel';
import { useBtcIndicators } from '@/hooks/useBtcIndicators';
import { BtcIndicatorBox, BtcTurboLayer3, BtcAutomationLayer4 } from './BtcSmartTurboPanels';
import { whitelistCollateral, whitelistBorrows, anchoredBorrow, BTC_POOL_PCT } from '@/lib/btcSmartTurbo';

// Robo-Advisor background variables (no sliders).
const ROBO_FEAR_GREED = 40;
const ROBO_BORROW_APY = 5.0;

const NATIVE_STAKING_APY_FALLBACK = 3.1; // Lido stETH APR fallback

type Mode = 'build' | 'unwind';

function Section({
  index, icon, title, desc, children,
}: { index: number; icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card/50 border border-accent/20 backdrop-blur-sm p-4 space-y-3 transition-all duration-300 ease-in-out motion-reduce:transition-none hover:border-accent/40 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-accent">Vrstva {index}</p>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function FiveLayerBrain({ lang, asset }: { lang: Lang; asset: 'BTC' | 'ETH' }) {
  const sk = lang === 'sk';
  const cfg = asset === 'BTC' ? BTC_CONFIG : ETH_CONFIG;
  const isBtc = asset === 'BTC';
  const { data: btcInd } = useBtcIndicators();
  const { data: prices, isLoading: pricesLoading, isError: priceError } = useLiveMarketData();
  const { data: scan, isError: yieldError } = useYieldScanner();
  const { byToken } = usePortfolioAssets();
  const { data: balances } = useGlobalBalances();
  const { reset } = useDefiActions();
  const { data: lido } = useLidoApr();
  const { data: fearGreedLegacy } = useFearGreed();
  const { data: fgOracle } = useOracle('fearGreed');
  const fearGreedBase = fgOracle?.value != null ? { ...(fearGreedLegacy ?? {}), value: Math.round(fgOracle.value) } : fearGreedLegacy;
  // BTC: F&G zo servera (Centrálny API Uzol · On-Chain Motor) — vstup pre horizont a multiplikátor.
  const fearGreed = isBtc && btcInd?.fearGreed.value != null ? { ...(fearGreedBase ?? {}), value: Math.round(btcInd.fearGreed.value) } : fearGreedBase;
  const { data: market } = useMarketData();
  const nativeApy = lido?.apr ?? NATIVE_STAKING_APY_FALLBACK;
  const operations = useStakeOperationsStore();
  const mode = operations.modes[asset];
  const setMode = (next: Mode) => operations.setMode(asset, next);
  const [reportedSupply, setReportedSupply] = useState<SupplyPosition>({ stableUsdc: 0, nativeQty: 0, cashUsdc: 0 });
  const unwind = mode === 'unwind';

  const { data: btcOracle } = useOracle('btcUsd');
  const { data: ethOracle } = useOracle('ethUsd');
  const btcLive = btcOracle?.value ?? prices?.btc;
  const ethLive = ethOracle?.value ?? prices?.eth;
  const price = asset === 'BTC' ? btcLive : ethLive;
  const ethPrice = ethLive;
  const gas = useGasMap(ethLive);
  const holding = byToken[asset];
  const total = holding ? holding.liquidQty + holding.stakedQty + holding.collateralQty : 0;
  const gasEth = balances?.ETH ?? 0;
  const lowGas = ethPrice ? gasEth * ethPrice < 25 : gasEth < 0.01;

  // Layer 2 — live route comparison
  const scanFresh = scan && Date.now() - scan.updatedAt < 15 * 60 * 1000 && !yieldError;
  const liveRoutes = scanFresh ? scan.routes : undefined;
  const routes = candidateRoutes(liveRoutes, asset);
  // Same-chain rule: collateral + borrow always on the identical protocol/chain position.
  const combo = bestCombinedRoute(liveRoutes, asset, cfg.targetLtv);
  // Preliminary route from net-APY; refined to the gas-aware net-profit route below.
  let route = combo?.collateral ?? winningRoute(liveRoutes, asset);
  let borrowRoute = combo?.borrow ?? null;
  // Continuous F&G curve (no fixed weekly phases): 0 at F&G 80, 100 % at F&G 40.
  const fgRatio = Math.max(0, Math.min(1, (80 - (fearGreed?.value ?? 40)) / 40));
  const stableRoute = bestStableSupply(liveRoutes);
  const split = dynamicNativeSplit(cfg, route?.supplyApy, nativeApy);

  // Vnorené vrstvy portfólia — Grand Total = Liquid + Staked + Collateral.
  const assetLayers = useAssetLayers();
  const ls = splitLayers(total, layerFor(assetLayers, asset), price ?? 0);
  const grandTotal = grandTotalOf(ls);

  const reserve = grandTotal * (cfg.reservePct / 100);

  // Dynamické cieľe — vždy iba ZVYŠOK do cieľa, zastropovaný Liquid zostatkom.
  const stakeT = layerTarget({
    grandTotal,
    liquid: ls.liquid,
    allocated: ls.staked,
    targetPct: split.nativePct,
  });
  const collT = layerTarget({
    grandTotal,
    liquid: ls.liquid,
    allocated: ls.collateral,
    targetPct: split.defiPct,
    perActionCap: grandTotal * 0.25 * 0.01 * fgRatio,
  });

  const nativeStake = stakeT.suggested;
  const working = collT.target;

  // Robo-Advisor inputs (BTC only); empty field = live portfolio value.
  const layerRec = layerFor(assetLayers, asset);
  const liveDebt = layerRec.borrowUsd + layerRec.borrowNative * (price ?? 0);
  const { data: appSettings } = useAppSettings();
  const [walletAddr, setWalletAddr] = useSmartWalletAddress(asset);
  const [addrDraft, setAddrDraft] = useState(walletAddr);
  const aave = useMultiChainPosition(asset === 'BTC' ? walletAddr : '', price);
  const isEthMod = asset === 'ETH';
  const { data: eurUsdLive } = useEurUsd();
  const btcScan = useMultiProtocolBtc(walletAddr, btcLive, eurUsdLive ?? 1.08, asset, ethLive);
  // TotalDepositedBtcAcrossAllProtocols — real BTC units from all 5 protocols.
  const chainWbtc = btcScan.data?.totalDepositedBtcAcrossAllProtocols ?? ls.collateral;
  // TotalDebtAcrossAllProtocols — USD/EUR stable debt from all 5 protocols (USD).
  const chainDebt = btcScan.data?.TotalDebtAcrossAllProtocols ?? aave.debtUsd ?? liveDebt;
  // Gas-aware winning route: highest estimated NET USD profit (yield − gas),
  // not raw APY — expensive L1 routes lose on micro-transactions.
  const netRoute = bestNetRoute(liveRoutes, asset, cfg.targetLtv, Math.max(1, chainWbtc * (price ?? 0)), gas.data);
  if (netRoute) { route = netRoute.collateral; borrowRoute = netRoute.borrow; }
  // BTC Smart Turbo: DeFi Saver whitelist — iba Aave V3 na Arbitrum/Base/Optimism + ukotvenie pozície.
  const wlBorrows = whitelistBorrows(liveRoutes);
  const currentChain = btcScan.data?.entries.find(e => e.protocol === 'Aave V3')?.chain ?? null;
  const anchor = anchoredBorrow(wlBorrows, currentChain);
  if (isBtc) {
    borrowRoute = anchor.route;
    const colls = whitelistCollateral(liveRoutes);
    route = colls.find(c => c.chain === anchor.route?.chain) ?? colls[0] ?? null;
  }
  // Fiat Buffer: live on-chain scan of the smart wallet's free USD/EUR stables.
  // Empty wallet strictly shows $0; recorded balances are only a fallback while
  // no valid address is entered.
  const { data: eurUsdRate } = useEurUsd();
  const buffer = useStableBuffer(walletAddr, eurUsdRate);
  const recordedStableUsd = ['USDC', 'USDT', 'USDS', 'DAI', 'USDC.E'].reduce((a, k) => a + Math.max(0, balances?.[k] ?? 0), 0)
    + ['EURC', 'EURS', 'EURE'].reduce((a, k) => a + Math.max(0, balances?.[k] ?? 0), 0) * (eurUsdRate ?? 1.08);
  void recordedStableUsd;
  // Strict: no address, fetch error or no data → exactly $0. Never mock/cached values.
  const freeStableUsd = walletAddr.trim().length > 0 && isEvmAddress(walletAddr) && !buffer.isError
    ? Math.max(0, Number(buffer.data?.totalUsd) || 0) : 0;
  const portfolioUsd = Object.values(byToken ?? {}).reduce((a, t) => a + (Number(t?.currentFiatValue) || 0), 0);
  const budgetRule = weeklyBudget(freeStableUsd, portfolioUsd);
  const autoBudget = budgetRule.amount;
  // Total BTC = wallet/portfolio (liquid + staked) + live deposited collateral across scanned protocols.
  const roboTotalBtc = ls.liquid + ls.staked + Math.max(0, chainWbtc);
  const { data: eurUsd } = useEurUsd();
  const [ccy, setCcy] = useState<'USD' | 'EUR'>('USD');
  const stableSym = borrowRoute?.symbol?.toUpperCase() ?? 'USDC';
  const stableIsEur = isEurStable(stableSym);
  const stablePrice = stableIsEur ? (eurUsd ?? 1.08) : 1;
  const roboFg = fearGreed?.value ?? ROBO_FEAR_GREED;
  const robo = price ? computeRoboAction({
    ...(isEthMod ? ETH_ROBO : { hardcapPct: BTC_POOL_PCT }),
    totalBtc: roboTotalBtc,
    currentDepositedWbtc: chainWbtc,
    currentDebt: chainDebt,
    weeklyBudget: autoBudget,
    fearAndGreed: roboFg,
    borrowApy: borrowRoute?.borrowApy ?? ROBO_BORROW_APY,
    btcPrice: price,
  }) : null;
  const roboBorrow = robo ? Math.max(0, robo.borrowDelta) : 0;
  // Repay flow: largest live USD/EUR liability across all 5 protocols is repaid first.
  const repayTarget = btcScan.data?.debts.length ? [...btcScan.data.debts].sort((x, y) => y.amountUsd - x.amountUsd)[0] : null;
  const repaySym = repayTarget?.asset ?? 'USDC';
  // Priority gas for emergency Auto-Repay (1.5× base) on the position's chain.
  const repayChain = repayTarget?.chain ?? borrowRoute?.chain ?? route?.chain;
  const priorityGas = priorityGasUsd(gas.data?.[repayChain ?? '']);
  // Smart debt rebalancing: alert when a cheaper route saves more per year than gas.
  const refi = refinancingSaving(chainDebt, borrowRoute?.borrowApy ?? ROBO_BORROW_APY, cheapestStableBorrow(liveRoutes), gas.data);
  const weeklyDeposit = robo ? robo.weeklyDepositBtc : collT.suggested;

  // Layer 3 — leverage engine (cumulative collateral after this week's deposit)
  // Risk engines (LTV, liquidation, breaker) use multi-protocol collateral and debt.
  const collateral = chainWbtc;
  const existingDebt = chainDebt;
  const plan = borrowPlan(collateral, price, existingDebt, cfg);
  const previewPlan = borrowPlan(collateral + weeklyDeposit, price, existingDebt, cfg);
  const debtUsd = existingDebt;
  const liqPrice = liquidationPrice(collateral, debtUsd ?? 0, cfg.liqThreshold);
  const plannedLiqPrice = liquidationPrice(collateral + weeklyDeposit, previewPlan.targetDebt ?? 0, cfg.liqThreshold);
  const liqDistance = distanceToLiquidation(price, liqPrice);
  const ltv = currentLtv(collateral, price, debtUsd);
  const risk = riskLevel(ltv, cfg.maxLtv, cfg.liqThreshold);

  // De-risking targets
  const exit = unwindPlan(collateral, price, debtUsd, operations.recovered[asset], cfg);
  const deriskLtv = exit.safeLtv;
  const repayUsd = exit.repay;
  const fullRepayUsd = debtUsd ?? 0;
  // Only CURRENT debt may authorize withdrawal, never a not-yet-executed repay.
  const withdrawable = unwindPlan(collateral, price, debtUsd, 0, cfg).withdrawable;
  const collateralProtocol = `${route?.protocol ?? 'Morpho'} · ${route?.chain ?? 'Base'} (${route?.symbol ?? cfg.collateralSymbol})`;
  const atr = asset === 'BTC' ? market?.btc.atr14d : market?.eth.atr14d;
  const marketVolatility = atr && price && !market?.fallback ? Math.min(100, atr / price * 1000) : undefined;
  const allocationBudget = existingDebt > 0 ? existingDebt : previewPlan.targetDebt;
  const recordedSupply = operations.positions[asset];
  const supply = recordedSupply ?? reportedSupply;
  const supplyValue = dissolvedValue(supply, price);
  const updateLayers = (changes: Partial<{ liquid: number; staked: number; collateral: number; borrowUsd: number }>) =>
    setAssetLayerOverride(asset, { liquid: ls.liquid, staked: ls.staked, collateral: ls.collateral, borrowUsd: existingDebt, ...changes });
  const nativeAmount = unwind ? ls.staked : nativeStake;
  const nearLiquidation = ltv != null && ltv >= cfg.liqThreshold * 0.8;

  const fmtUsd = (n?: number | null) =>
    n == null ? '…' : `$${n.toLocaleString('sk-SK', { maximumFractionDigits: 0 })}`;
  const fmtUsd2 = (n?: number | null) =>
    n == null ? '…' : `$${n.toLocaleString('sk-SK', { maximumFractionDigits: 2 })}`;

  const layer1 = (
    <Section
      key="l1"
      index={1}
      icon={<ShieldCheck className="w-5 h-5 text-purple-400" />}
      title={unwind
        ? (sk ? 'Rezerva zostáva nedotknutá' : 'Reserve stays untouched')
        : (sk ? 'Rezerva (Cold Storage)' : 'Reserve (Cold Storage)')}
      desc={unwind
        ? (sk
          ? 'Pri znižovaní rizika sa rezerva nikdy nepredáva — vybraný kolaterál sa presúva sem.'
          : 'When de-risking, the reserve is never sold — withdrawn collateral moves here.')
        : (sk
          ? `${cfg.reservePct} % kapitálu bezpečne v hardware wallet (Trezor/Ledger).`
          : `${cfg.reservePct}% of capital safely in a hardware wallet (Trezor/Ledger).`)}
    >
      <TokenValue amount={unwind ? ls.liquid : Math.min(reserve, ls.liquid)} symbol={asset} price={price} decimals={4} copy copyLabel={sk ? 'Kopírovať' : 'Copy'} />
      <RecordActionButton
        actionId={`${asset}:${mode}:layer1`}
        symbol={asset}
        amount={unwind ? ls.liquid : Math.min(reserve, ls.liquid)}
        disabled={ls.liquid <= 0}
        label={unwind
          ? (sk ? 'Potvrdiť presun do cold storage' : 'Confirm move to cold storage')
          : (sk ? 'Potvrdiť zabezpečenie rezervy' : 'Confirm reserve security')}
        doneLabel={sk ? 'Zaznamenané' : 'Recorded'}
        toastMessage={sk ? 'Rezerva zaznamenaná.' : 'Reserve recorded.'}
      />
    </Section>
  );

  const layer2 = (
    <Section
      key="l2"
      index={2}
      icon={unwind ? <PackageOpen className="w-5 h-5 text-amber-300" /> : <Radar className="w-5 h-5 text-blue-400" />}
      title={unwind ? (sk ? 'Výber Kolaterálu' : 'Collateral Withdrawal') : 'Smart Yield Collateral'}
      desc={unwind
        ? (sk
          ? 'Po splatení dlhu vyber kolaterál a odstakuj Lido staking (stETH) pozíciu.'
          : 'After the debt is repaid, withdraw the collateral and unstake the native position.')
        : isBtc ? 'Smart Yield Router · DeFi Saver whitelist: Aave V3 na Arbitrum, Base a Optimism (WBTC / cbBTC). Najlacnejší borrow USDT / USDC s ukotvením pozície (zmena siete iba pri úspore > 2.0 %).'
        : (sk
          ? 'Live porovnanie Aave V3, Morpho, Spark, Compound V3 a Maker/Sky na Arbitrum, Base, Optimism, Ethereum a Gnosis — víťazná trasa podľa reálneho APY.'
          : 'Live comparison of Aave V3, Morpho, Spark, Compound V3 and Maker/Sky across 5 chains — winning route by real APY.')}
    >
      {!unwind && (
        <>
          <div className="flex items-center gap-2 text-[11px] text-emerald-300">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
          {scanFresh
              ? (sk ? `Live skenovanie: ${scan.scannedPools} poolov` : `Live scan: ${scan.scannedPools} pools`)
              : (yieldError ? 'Dáta výnosov nedostupné' : 'Načítavam DefiLlama…')}
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-slate-950 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              <Trophy className="w-3.5 h-3.5" /> {sk ? 'Víťazná trasa' : 'Winning route'}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><p className="text-slate-500">{sk ? 'Sieť' : 'Network'}</p><p className="text-slate-100 font-semibold">{route?.chain ?? '…'}</p></div>
              <div><p className="text-slate-500">{sk ? 'Protokol' : 'Protocol'}</p><p className="text-slate-100 font-semibold">{route?.protocol ?? '…'}</p></div>
              <div><p className="text-slate-500">{sk ? 'Kolaterál' : 'Collateral'}</p><p className="text-slate-100 font-semibold">{route?.symbol ?? cfg.collateralSymbol}</p></div>
              <div><p className="text-muted-foreground">Výnos APY · živé dáta</p><p className="text-gain font-semibold font-mono">{route ? `${route.supplyApy.toFixed(4)}%` : 'Dáta nedostupné'}</p></div>
              {<div className="col-span-2"><p className="text-slate-500">Najlacnejší borrow</p><p className="text-slate-100 font-semibold font-mono">{borrowRoute ? `${borrowRoute.symbol} · ${borrowRoute.protocol} · ${borrowRoute.chain} : ${borrowRoute.borrowApy!.toFixed(2)}%` : 'Dáta nedostupné'}</p></div>}
            </div>
            {route && <p className="text-[11px] text-amber-200 font-semibold">Víťazná trasa: {route.protocol} na {route.chain} · {route.symbol}{borrowRoute ? ` · borrow ${borrowRoute.symbol}${borrowRoute.chain !== route.chain || borrowRoute.protocol !== route.protocol ? ` (${borrowRoute.protocol} · ${borrowRoute.chain})` : ''}` : ''}</p>}
            {netRoute && gas.data && <p className="text-[10px] font-mono text-slate-400">Čistý zisk / rok: <span className={netRoute.netUsd >= 0 ? 'text-gain' : 'text-loss'}>{fmtUsd2(netRoute.yieldUsd)} výnos − {fmtUsd2(netRoute.gasUsd)} gas = {fmtUsd2(netRoute.netUsd)}</span></p>}
            {robo && <p className={`text-xs font-bold font-mono ${robo.isHardcapReached ? 'text-warning' : 'text-gain'}`}>
              {robo.isHardcapReached
                ? `Hardcap ${isBtc ? 33 : 25} % dosiahnutý · Vložiť 0 ${asset} · všetko do Cold Storage`
                : `Vložiť ${fmtQty(robo.depositToCollateral / (price ?? 1))} ${asset} z Cold Storage (${fmtUsd(robo.depositToCollateral)})`}
            </p>}
          </div>

          {isBtc && <div className="space-y-1 text-[10px] font-mono">
            {wlBorrows.map(b => <div key={b.chain} className="flex justify-between gap-2 whitespace-nowrap"><span className="text-slate-400">Aave V3 · {b.chain} · {b.symbol}</span><span className={b.chain === borrowRoute?.chain ? 'text-gain' : 'text-slate-300'}>borrow {b.borrowApy!.toFixed(2)} %</span></div>)}
            <p className={anchor.switchSuggested ? 'text-warning' : 'text-slate-500'}>{anchor.current
              ? (anchor.switchSuggested ? `Ukotvenie: presuň na ${anchor.route?.chain} — borrow nižší o ${anchor.saving.toFixed(2)} %` : `Ukotvenie: drž pozíciu na ${anchor.current.chain} (rozdiel ${anchor.saving.toFixed(2)} % ≤ 2.0 %)`)
              : 'Bez existujúcej Aave pozície — navrhnutá najlacnejšia sieť'}</p>
          </div>}
          {!isBtc && routes.length > 1 && (
            <div className="space-y-1">
              {routes.slice(1).map(r => (
                <div key={`${r.protocol}-${r.chain}-${r.symbol}`} className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-[11px]">
                  <span className="text-slate-400">{r.protocol} · {r.chain} · {r.symbol}</span>
                  <span className="font-mono text-slate-300">{r.supplyApy.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          )}

          {asset === 'ETH' && (
            <div className={`rounded-lg px-3 py-2 text-[11px] flex items-start gap-2 ${
              split.favorNative ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200' : 'bg-purple-600/10 border border-purple-500/25 text-purple-200'
            }`}>
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {sk
                  ? `AI rozdelenie: ${split.nativePct} % Lido staking (stETH) (${lido?.source === 'lido' ? 'živý APR' : 'odhad APR'} ${nativeApy.toFixed(2)} %) / ${split.defiPct} % DeFi kolaterál${split.favorNative ? ' — slabé DeFi výnosy zvýhodňujú staking.' : '.'}`
                  : `AI split: ${split.nativePct}% Lido staking (stETH) (~${nativeApy.toFixed(2)}%) / ${split.defiPct}% DeFi collateral${split.favorNative ? ' — DeFi yields are poor, capital shifted to staking.' : '.'}`}
              </span>
            </div>
          )}
        </>
      )}

      {asset === 'ETH' && (
        <>
          <TokenValue amount={nativeAmount} symbol="ETH" price={price} decimals={4} copy copyLabel={sk ? 'Kopírovať' : 'Copy'} />
          <RecordActionButton
            actionId={`ETH:${mode}:layer2-native`}
            symbol="ETH"
            amount={nativeAmount}
            performAction={() => unwind
              ? updateLayers({ staked: 0, liquid: ls.liquid + nativeAmount })
              : updateLayers({ staked: ls.staked + nativeAmount, liquid: ls.liquid - nativeAmount })}
            stakeProtocol={unwind ? undefined : 'Lido staking (stETH)'}
            unstakeProtocol={unwind ? 'Lido staking (stETH)' : undefined}
            stakeApy={nativeApy}
            fullyAllocated={!unwind && stakeT.fullyAllocated}
            disabled={nativeAmount <= 0}
            label={unwind
              ? (sk ? 'Zaznamenať odstakovanie (Ledger)' : 'Record unstaking (Ledger)')
              : (sk ? 'Zaznamenať Lido staking (stETH) (Ledger)' : 'Record Lido staking (stETH) (Ledger)')}
            doneLabel={unwind ? (sk ? 'Odstakovanie zaznamenané' : 'Unstake recorded') : (sk ? 'Staking zaznamenaný' : 'Staking recorded')}
            toastMessage={unwind
              ? (sk ? 'Odstakovanie zaznamenané.' : 'Unstake recorded.')
              : (sk ? 'Lido staking (stETH) zaznamenaný.' : 'Lido staking (stETH) recorded.')}
          />
        </>
      )}

      {!unwind && robo && (
        <div className="rounded-lg border border-purple-500/30 bg-slate-950/60 p-2.5 space-y-1 text-[10px] font-mono">
          <div className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="text-purple-300 font-semibold">Týždenný rozpočet (Horizon DCA)</span><span className="text-accent font-semibold">{fmtUsd2(robo.weeklyBudgetUsd)}{eurUsd ? ` · €${(robo.weeklyBudgetUsd / eurUsd).toLocaleString('sk-SK', { maximumFractionDigits: 2 })}` : ''}</span></div>
          <div className="flex items-center justify-between gap-2 whitespace-nowrap text-slate-400"><span>Horizont (F&G {roboFg})</span><span className="text-slate-200">{robo.paused ? 'Pozastavené' : `${robo.horizonWeeks} týždňov`}</span></div>
          <div className="flex items-center justify-between gap-2 whitespace-nowrap text-slate-400"><span>Voľné miesto {isBtc ? 33 : 25} % poolu</span><span className="text-slate-200">{fmtQty(robo.remainingSpaceBtc)} {asset}</span></div>
          <div className="flex items-center justify-between gap-2 whitespace-nowrap text-slate-400"><span>Základ × F&G multiplikátor</span><span className="text-slate-200">{fmtUsd2(robo.baseWeeklyUsd)} × {robo.multiplier.toFixed(2)}×</span></div>
        </div>
      )}
      <TokenValue amount={unwind ? withdrawable : weeklyDeposit} symbol={asset} price={price} decimals={4} copy copyLabel={sk ? 'Kopírovať' : 'Copy'} />
      {unwind && btcScan.data && btcScan.data.entries.length > 0 && <div className="space-y-0.5 text-[10px] font-mono">
        <p className="text-slate-400">{asset} kolaterál na výber (live):</p>
        {[...btcScan.data.entries].sort((x, y) => y.amountBtc - x.amountBtc).map(e => (
          <div key={`${e.protocol}-${e.chain}-${e.asset}`} className="flex justify-between gap-2 whitespace-nowrap"><span className="text-slate-500 truncate">{e.protocol} · {e.chain} · {e.asset}</span><span className="text-slate-200">{e.amountBtc.toFixed(4)} {asset}</span></div>
        ))}
      </div>}
      {unwind && <p className="text-xs text-warning">Výber zachová bezpečné LTV {(deriskLtv * 100).toFixed(0)} %. Celý kolaterál možno vybrať až po úplnom splatení. Auto-Repay nevypínaj pri rizikovej pozícii.</p>}
      {!unwind && (
        <p className="text-[10px] text-slate-500 font-mono">
          {sk ? 'Už alokované' : 'Already allocated'} {fmtQty(ls.collateral)} / {sk ? 'cieľ' : 'target'} {fmtQty(working)} {asset}
          {collT.liquidLimited && (sk ? ' · limitované Liquid zostatkom' : ' · limited by liquid balance')}
        </p>
      )}
      <RecordActionButton
        actionId={`${asset}:${mode}:layer2`}
        symbol={asset}
        amount={unwind ? withdrawable : weeklyDeposit}
        performAction={() => unwind
          ? updateLayers({ collateral: Math.max(0, collateral - withdrawable), liquid: ls.liquid + withdrawable })
          : updateLayers({ collateral: collateral + weeklyDeposit, liquid: ls.liquid - weeklyDeposit })}
        stakeProtocol={unwind ? undefined : collateralProtocol}
        stakeKind="collateral"
        unstakeProtocol={unwind ? collateralProtocol : undefined}
        stakeApy={route?.supplyApy}
        fullyAllocated={!unwind && collT.fullyAllocated}
        disabled={(unwind ? withdrawable : weeklyDeposit) <= 0 || (!unwind && !route && !robo)}
        label={unwind
          ? (sk
            ? `Zaznamenať výber kolaterálu (${route?.protocol ?? 'Morpho'} · ${route?.chain ?? 'Base'})`
            : `Record collateral withdrawal (${route?.protocol ?? 'Morpho'} · ${route?.chain ?? 'Base'})`)
          : isBtc ? 'Zaznamenať týždenný DCA vklad do DeFi Savera (Aave V3)' : (sk
            ? (`Zaznamenať DCA vklad (${route?.protocol ?? 'Morpho'} · ${route?.chain ?? 'Base'})`)
            : `Record DCA deposit (${route?.protocol ?? 'Morpho'} · ${route?.chain ?? 'Base'})`)}
        doneLabel={unwind ? (sk ? 'Výber zaznamenaný' : 'Withdrawal recorded') : (sk ? 'Vklad zaznamenaný' : 'Deposit recorded')}
        toastMessage={unwind
          ? (sk ? 'Výber kolaterálu zaznamenaný.' : 'Collateral withdrawal recorded.')
          : (sk ? 'DCA vklad zaznamenaný.' : 'DCA deposit recorded.')}
      />
    </Section>
  );

  const layer3 = (
    <Section
      key="l3"
      index={3}
      icon={unwind ? <Banknote className="w-5 h-5 text-emerald-400" /> : <ArrowDownUp className="w-5 h-5 text-purple-400" />}
      title={unwind
        ? (sk ? 'Splatenie dlhu (Repay Borrow)' : 'Debt Repayment (Repay Borrow)')
        : (sk ? 'Leverage & Borrow (Risk Engine)' : 'Leverage & Borrow (Risk Engine)')}
      desc={unwind
        ? (sk
          ? `Splať USDC z rozpustenej Vrstvy 5, aby LTV spadlo na bezpečných ${(deriskLtv * 100).toFixed(0)} %.`
          : `Repay USDC from the dissolved Layer 5 to drop the LTV to a safe ${(deriskLtv * 100).toFixed(0)}%.`)
        : (sk
          ? `Borrow ${stableSym} (najlacnejší stablecoin) pri cieľovom LTV ${(cfg.targetLtv * 100).toFixed(0)} % — hardcap ${(cfg.maxLtv * 100).toFixed(0)} %.`
          : `Borrow USDC at ${(cfg.targetLtv * 100).toFixed(0)}% target LTV — hardcap ${(cfg.maxLtv * 100).toFixed(0)}%.`)}
    >
      <div className="space-y-1.5">
        <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-in-out ${
              risk === 'DANGER' ? 'bg-red-500' : risk === 'WATCH' ? 'bg-amber-400' : 'bg-purple-500'
            }`}
            style={{ width: `${(ltv ?? cfg.targetLtv) * 100}%` }}
          />
          <div className="absolute inset-y-0 right-0 bg-red-500/30" style={{ width: `${(1 - cfg.maxLtv) * 100}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span className="text-accent font-semibold">LTV {ltv == null ? 'Bez pozície' : `${(ltv * 100).toFixed(2)}%`}</span>
          <span className="text-red-300">{sk ? `Hardcap ${(cfg.maxLtv * 100).toFixed(0)} %` : `Hardcap ${(cfg.maxLtv * 100).toFixed(0)}%`}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5">
          <p className="text-slate-500">{unwind ? (sk ? 'Kolaterál v protokole' : 'Collateral in protocol') : (sk ? 'Kolaterál (tento týždeň)' : 'Collateral (this week)')}</p>
          <TokenValue amount={collateral} symbol={asset} price={price} size="sm" />
        </div>
        <div className="col-span-2 rounded-lg bg-slate-950 border border-slate-800 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-slate-500 whitespace-nowrap">{unwind ? (sk ? 'Celkový dlh' : 'Total debt') : `Borrow ${stableSym}`}</p>
            <div className="flex shrink-0 rounded-md border border-slate-700 overflow-hidden text-[10px]">
              {(['USD', 'EUR'] as const).map(c => (
                <button key={c} type="button" onClick={() => setCcy(c)}
                  className={`px-2 py-0.5 ${ccy === c ? 'bg-purple-500/30 text-purple-200' : 'text-slate-400'}`}>{c === 'USD' ? '$' : '€'}</button>
              ))}
            </div>
          </div>
          {(() => {
            const usd = !unwind && robo ? Math.abs(robo.borrowDelta) : debtUsd;
            if (usd == null) return <p className="text-warning">Dáta nedostupné</p>;
            const fiat = ccy === 'EUR' ? usd / (eurUsd ?? 1.08) : usd;
            return (
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="font-mono font-semibold text-slate-100 truncate">{(usd / stablePrice).toFixed(2)} {unwind ? repaySym : stableSym}</span>
                <span className="font-mono text-slate-400 shrink-0">≈ {ccy === 'EUR' ? '€' : '$'}{fiat.toFixed(2)}</span>
              </div>
            );
          })()}
          {!unwind && robo && <div className="flex items-center justify-between gap-2 text-[10px] whitespace-nowrap">
            <span className={`font-semibold ${robo.borrowDelta > 0 ? 'text-gain' : 'text-warning'}`}>{robo.borrowDelta > 0 ? 'Akumulácia · požičať' : 'Zníženie dlhu'}</span>
            <span className="text-slate-500 truncate">{borrowRoute ? `${borrowRoute.protocol} · ${borrowRoute.chain} · ${borrowRoute.borrowApy?.toFixed(2)} %` : 'Najlacnejší stable: čakám na sken'}</span>
          </div>}
        </div>
        {unwind ? (
          <>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/30 p-2.5">
              <p className="text-slate-500">{sk ? 'Splatiť na bezpečné LTV' : 'Repay to safe LTV'}</p>
              <TokenValue amount={repayUsd} symbol="USDC" price={1} size="sm" copy />
            </div>
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5">
              <p className="text-slate-500">{sk ? 'Úplné splatenie' : 'Full repayment'}</p>
              <p className="text-slate-100 font-semibold font-mono">{fmtUsd2(fullRepayUsd)}</p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-red-500/5 border border-red-500/30 p-2.5">
              <p className="text-slate-500">{sk ? 'Likvidačná cena' : 'Liquidation price'}</p>
              <p className="text-loss font-semibold font-mono">{liqPrice == null ? 'Bez dlhu / kolaterálu' : fmtUsd2(liqPrice)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/25 p-2.5">
              <p className="text-slate-500">{sk ? 'Odstup od likvidácie' : 'Distance to liquidation'}</p>
              <p className="text-emerald-300 font-semibold font-mono">
                {liqDistance == null ? '…' : `−${Math.abs(liqDistance).toFixed(1)}%`}
              </p>
            </div>
          </>
        )}
      </div>
      {unwind && <div className="space-y-2 text-xs">
        <p className="text-muted-foreground">Potrebné na bezpečné LTV: {fmtUsd2(exit.required)} USDC · dostupné: {fmtUsd2(operations.recovered[asset])} USDC</p>
        {!!exit.shortfall && <p className="text-warning">Chýba {fmtUsd2(exit.shortfall)} USDC. Najprv rozpusti Vrstvu 5; rozdiel treba doplniť externe.</p>}
        <p className="text-muted-foreground">LTV po navrhnutom splatení: {exit.postRepayLtv == null ? 'Dáta nedostupné' : `${(exit.postRepayLtv * 100).toFixed(2)} %`}</p>
      </div>}
      <p className="text-[10px] text-slate-500">
        {sk
          ? `Modelový likvidačný prah ${(cfg.liqThreshold * 100).toFixed(0)} % · overiť v zvolenom trhu. Cena likvidácie = dlh / (kolaterál × prah).`
          : `Protocol liquidation threshold ${(cfg.liqThreshold * 100).toFixed(0)}% · computed from the live ${asset} price.`}
      </p>
      {!unwind && robo && <div className="space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="text-slate-500">{`DeFi pool (25 % ${asset})`}</span><span className="font-mono text-slate-200">{robo.maxDefiPool.toFixed(4)} BTC</span></div>
        <div className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="text-slate-500">{sk ? 'Cieľ kolaterálu (F&G % poolu)' : 'Target collateral (F&G % of pool)'}</span><span className="font-mono text-slate-200">{(robo.collateralRatio * 100).toFixed(0)} % · {robo.targetCollateralBtc.toFixed(4)} {asset}</span></div>
        <div className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="text-slate-500">{sk ? 'V DeFi Saver teraz' : 'In DeFi Saver now'}</span><span className="font-mono text-slate-200">{chainWbtc.toFixed(4)} {asset}</span></div>
        <div className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="text-slate-500">{sk ? 'Presunúť z Cold Storage' : 'Transfer from cold storage'}</span><span className="font-mono text-accent font-semibold">{robo.weeklyDepositBtc.toFixed(4)} {asset} · {fmtUsd2(robo.depositToCollateral)}</span></div>
        <div className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="text-slate-500">{sk ? 'Borrow z kolaterálu (Target LTV)' : 'Borrow of collateral (Target LTV)'}</span><span className="font-mono text-slate-200">{(robo.targetLtv * 100).toFixed(1)} % · {fmtUsd2(robo.collateralUsd * robo.targetLtv)}</span></div>
        <div className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="text-slate-500">{sk ? 'Pozícia' : 'Position'}</span><span className={`truncate ${borrowRoute ? 'text-emerald-300' : 'text-warning'}`}>{borrowRoute ? `${borrowRoute.protocol} · ${borrowRoute.chain} ✓` : (sk ? 'Bez borrow trhu na rovnakej sieti' : 'No same-chain borrow market')}</span></div>
      </div>}
      {!unwind && <div className="space-y-2 border-y border-border py-2">
        <p className="text-xs text-muted-foreground">Dodatočný borrow po potvrdenom vklade</p>
        <TokenValue amount={plan.additionalDebt} symbol="USDC" price={1} size="sm" />
        {collateral <= 0 && <p className="text-[11px] text-warning">Najprv zaznamenať kolaterál vo Vrstve 2. Predbežný plán: {fmtUsd2(previewPlan.targetDebt)} USDC.</p>}
        <p className="text-[11px] text-muted-foreground">Likvidačná cena plánovanej pozície: <span className="text-loss font-mono">{plannedLiqPrice == null ? 'Bez plánovaného dlhu' : fmtUsd2(plannedLiqPrice)}</span></p>
      </div>}

      {unwind && repayTarget && <div className="space-y-0.5 text-[10px] font-mono">
        <p className="text-warning font-semibold">Splatiť najprv: {repayTarget.asset} · {repayTarget.protocol} · {repayTarget.chain}</p>
        {btcScan.data!.debts.map(d => (
          <div key={`${d.protocol}-${d.chain}-${d.asset}`} className="flex justify-between gap-2 whitespace-nowrap"><span className="text-slate-500 truncate">{d.protocol} · {d.chain} · {d.asset}</span><span className="text-slate-200">{d.peg === 'EUR' ? '€' : '$'}{d.amount.toFixed(2)}</span></div>
        ))}
      </div>}
      <RecordActionButton
        actionId={`${asset}:${mode}:layer3`}
        symbol="USDC"
        amount={unwind ? (repayUsd ?? 0) : roboBorrow}
        debtAsset={asset}
        debtUsd={unwind ? (repayUsd ?? 0) : roboBorrow}
        repay={unwind}
        performAction={unwind ? () => {
          if (!operations.consume(asset, repayUsd)) return false;
          return updateLayers({ borrowUsd: exit.remainingDebt });
        } : () => updateLayers({ borrowUsd: existingDebt + roboBorrow })}
        disabled={unwind ? repayUsd <= 0 || !price : robo ? roboBorrow <= 0 : (!route || collateral <= 0 || plan.additionalDebt <= 0 || risk === 'DANGER')}
        label={unwind
          ? (sk ? `Zaznamenať splatenie ${repaySym}` : `Record ${repaySym} repayment`)
          : (sk ? 'Zaznamenať manuálny Borrow USDC' : 'Record manual USDC borrow')}
        doneLabel={unwind ? (sk ? 'Splatenie zaznamenané' : 'Repayment recorded') : (sk ? 'Borrow zaznamenaný' : 'Borrow recorded')}
        toastMessage={unwind
          ? (sk ? 'Splatenie dlhu zaznamenané.' : 'Debt repayment recorded.')
          : (sk ? 'Borrow USDC zaznamenaný.' : 'USDC borrow recorded.')}
      />
      {unwind && <RecordActionButton
        actionId={`${asset}:unwind:layer3-full:${fullRepayUsd}`}
        symbol="USDC" amount={fullRepayUsd}
        disabled={fullRepayUsd <= 0 || operations.recovered[asset] < fullRepayUsd || !price}
        performAction={() => operations.consume(asset, fullRepayUsd) && updateLayers({ borrowUsd: 0 })}
        label="Zaznamenať úplné splatenie USDC" doneLabel="Splatenie zaznamenané" toastMessage="Celý dlh zaznamenaný ako splatený."
      />}
    </Section>
  );

  const layer4 = (
    <Section
      key="l4"
      index={4}
      icon={unwind ? <PowerOff className="w-5 h-5 text-amber-300" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
      title={unwind
        ? (sk ? 'Vypnutie automatizácie' : 'Disabling Automation')
        : (sk ? 'Automatizácia & Ochrana (DeFi Saver ALM)' : 'Automation & Protection (DeFi Saver ALM)')}
      desc={unwind
        ? (sk
          ? 'Vypni Auto-Boost aj Auto-Repay v DeFi Saver, aby automat nezvyšoval pozíciu počas odchodu.'
          : 'Turn off Auto-Boost and Auto-Repay in DeFi Saver so automation cannot re-lever while you exit.')
        : (sk ? 'Auto-Repay chráni pred likvidáciou, Auto-Boost škáluje borrow po DCA vklade.' : 'Auto-Repay protects from liquidation, Auto-Boost scales the borrow after each DCA deposit.')}
    >
      <DefiSaverAlmPanel
        sk={sk}
        targetLtv={cfg.targetLtv}
        maxLtv={cfg.maxLtv}
        liqPrice={liqPrice}
        livePrice={price}
        assetSymbol={route?.symbol ?? cfg.collateralSymbol}
        asset={asset}
        weeklyDeposit={weeklyDeposit}
        unwind={unwind}
      />
      {!unwind && robo && <div className="rounded-lg border border-emerald-500/30 bg-slate-950/60 p-2.5 space-y-1 text-[10px] font-mono">
        <div className="flex justify-between gap-2 whitespace-nowrap"><span className="text-slate-400">Auto-Repay spúšťač</span><span className="text-slate-200">LTV ≥ {(robo.autoRepayTrigger * 100).toFixed(0)} % → {(robo.targetLtv * 100).toFixed(1)} %</span></div>
        <div className="flex justify-between gap-2 whitespace-nowrap"><span className="text-slate-400">Živé LTV</span><span className="text-slate-200">{(robo.liveLtv * 100).toFixed(2)} %</span></div>
        <div className="flex justify-between gap-2 whitespace-nowrap"><span className="text-slate-400">Potrebné splatenie</span><span className={robo.autoRepayUsd > 0 ? 'text-warning font-semibold' : 'text-gain'}>{robo.autoRepayUsd > 0 ? `${fmtUsd2(robo.autoRepayUsd)}${repayTarget ? ` · ${repayTarget.asset} ${repayTarget.protocol} ${repayTarget.chain}` : ''}` : 'Nie je potrebné'}</span></div>
        {robo.autoRepayUsd > 0 && <div className="flex justify-between gap-2 whitespace-nowrap"><span className="text-amber-300">⛽ Priority gas ×1,5{repayChain ? ` (${repayChain})` : ''}</span><span className="text-amber-200">{priorityGas != null ? fmtUsd2(priorityGas) : 'odhad nedostupný'}</span></div>}
        <div className="flex justify-between gap-2 whitespace-nowrap"><span className="text-slate-400">Auto-Boost</span><span className="text-slate-200">iba po týždennom DCA vklade</span></div>
      </div>}
      <RecordActionButton
        actionId={`${asset}:${mode}:layer4`}
        symbol={asset}
        amount={unwind ? 1 : collateral}
        disabled={unwind ? nearLiquidation || operations.automationOff[asset] : collateral <= 0}
        performAction={unwind ? () => {
          const alm = useStakeAlmStore.getState();
          alm.configure(asset, 'autoBoost', false);
          alm.configure(asset, 'autoRepay', false);
          operations.confirmAutomation(asset, true);
          return true;
        } : undefined}
        label={unwind
          ? (sk ? 'Potvrdiť vypnutie automatizácie' : 'Confirm automation shutdown')
          : (sk ? 'Potvrdiť nastavenie automatizácie' : 'Confirm automation setup')}
        doneLabel="Zaznamenané"
        toastMessage={unwind
          ? 'Vypnutie automatizácie zaznamenané; stav v DeFi Saver over externe.'
          : 'Nastavenie DeFi Saver zaznamenané; aktiváciu over externe.'}
      />
      {unwind && nearLiquidation && <p className="text-xs text-loss">Najprv zníž rizikový dlh. Vypnutie bezpečnostnej automatizácie je zatiaľ zablokované.</p>}
    </Section>
  );

  const layer5 = (
    <Section
      key="l5"
      index={5}
      icon={unwind ? <Undo2 className="w-5 h-5 text-sky-400" /> : <Radar className="w-5 h-5 text-sky-400" />}
      title={unwind
        ? (sk ? 'Rozpustenie alokácie' : 'Dissolving the Allocation')
        : 'AI Borrow Allocator & Cash-Flow'}
      desc={unwind
        ? (sk
          ? 'Rozpusti Stablecoin Supply aj Native Token Supply späť na čisté USDC — to poslúži na splatenie dlhu.'
          : 'Liquidate the Stablecoin Supply and Native Token Supply back into pure USDC to fund the repayment.')
        : (sk ? 'Rozdelenie pôžičky do 3 izolovaných pilierov podľa volatility a Fear & Greed.' : 'Splits the loan across 3 isolated pillars from volatility and Fear & Greed.')}
    >
      {unwind ? <UnwindSupplyPanel position={supply} recorded={!!recordedSupply} nativeSymbol={asset} price={price} recovered={operations.recovered[asset]} onChange={setReportedSupply} /> : <BorrowAllocatorPanel
        sk={sk}
        borrowUsd={allocationBudget}
        nativeCollateral={cfg.collateralSymbol}
        stableRoute={stableRoute}
        nativePrice={price}
        marketVolatility={marketVolatility}
        fearAndGreedIndex={fearGreed?.value}
        roboSplit={robo && robo.borrowDelta > 0 ? { stableUsd: robo.borrowDelta * robo.usdcSupplyRatio, nativeUsd: robo.borrowDelta * robo.cbBtcRatio, cashUsd: robo.borrowDelta * robo.cashRatio } : undefined}
      />}
      <RecordActionButton
        actionId={`${asset}:${mode}:layer5-v3`}
        symbol="USDC"
        amount={unwind ? supplyValue ?? 0 : (robo ? roboBorrow : debtUsd)}
        disabled={unwind ? !supplyValue || (!recordedSupply && operations.recovered[asset] > 0) : robo ? roboBorrow <= 0 || !price || !!recordedSupply : !debtUsd || !stableRoute || !price || !!recordedSupply}
        performAction={unwind ? () => {
          const result = operations.dissolve(asset, price, supply);
          if (result) setReportedSupply({ stableUsdc: 0, nativeQty: 0, cashUsdc: 0 });
          return result;
        } : () => {
          if (!price) return false;
          if (robo) return operations.deploy(asset, { stableUsdc: roboBorrow * robo.usdcSupplyRatio, nativeQty: roboBorrow * robo.cbBtcRatio / price, cashUsdc: roboBorrow * robo.cashRatio });
          const pillars = borrowPillars(debtUsd, marketVolatility ?? 100, fearGreed?.value ?? 100);
          return operations.deploy(asset, { stableUsdc: pillars.stableUsd, nativeQty: pillars.nativeUsd / price, cashUsdc: pillars.cashUsd });
        }}
        label={unwind
          ? (sk ? 'Zaznamenať rozpustenie na USDC' : 'Record dissolution to USDC')
          : (sk ? 'Zaznamenať nasadenie pôžičky' : 'Record loan deployment')}
        doneLabel={unwind ? (sk ? 'Rozpustenie zaznamenané' : 'Dissolution recorded') : (sk ? 'Nasadenie zaznamenané' : 'Deployment recorded')}
        toastMessage={unwind
          ? (sk ? 'Alokácia rozpustená na USDC.' : 'Allocation dissolved to USDC.')
          : (sk ? 'Alokácia pôžičky zaznamenaná.' : 'Loan allocation recorded.')}
      />
    </Section>
  );

  const turbo3 = (
    <Section key="l3" index={3} icon={<ArrowDownUp className="w-5 h-5 text-purple-400" />} title="Turbo Calculator (DeFi Saver Boost 1.40x)" desc="Týždenný vklad z Vrstvy 2 × Boost 1.40x (LTV ≈ 28.57 %) · likvidačný prah Aave V3 78 %.">
      <BtcTurboLayer3 depositBtc={weeklyDeposit} price={price} existingCollBtc={collateral} existingDebtUsd={existingDebt}
        avgPrice={holding?.wacb} chain={route?.chain ?? borrowRoute?.chain} stable={borrowRoute?.symbol?.toUpperCase() ?? 'USDC'}
        rsi={btcInd?.rsi14} sma200={btcInd?.sma200}
        onRecord={(extraColl, debt) => updateLayers({ collateral: collateral + extraColl, borrowUsd: existingDebt + debt })} />
    </Section>
  );
  const auto4 = (
    <Section key="l4" index={4} icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />} title="Automation Engine — DeFi Saver Roboti & Semafor" desc="Ochrana nadol, statický Unwind rebrík a dynamický Override semafor (F&G + MVRV Z-Score).">
      <BtcAutomationLayer4 price={price} fg={fearGreed?.value} mvrv={btcInd?.mvrv.value} mvrvZ={btcInd?.mvrv.z} debtUsd={existingDebt} />
    </Section>
  );
  const layers = isBtc
    ? (unwind ? [layer4, layer3, layer2, layer1] : [layer1, layer2, turbo3, auto4])
    : unwind ? [layer5, layer4, layer3, layer2, layer1] : [layer1, layer2, layer3, layer4, layer5];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-purple-950/60 via-slate-950/80 to-slate-950/60 border border-purple-500/30 backdrop-blur-sm p-4 space-y-3 shadow-[0_0_40px_-15px_rgba(139,92,246,0.5)]">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-purple-400 font-semibold">
            {isBtc ? 'DEFI MOZOG — BTC · SMART TURBO (4 VRSTVY)' : `DEFI MOZOG — ${asset} · 5 VRSTIEV`}
          </p>
          <Button variant="ghost" size="sm"
            type="button"
            onClick={() => { reset(`${asset}:`); toast.success(sk ? `Plán ${asset} resetnutý.` : `${asset} plan reset.`); }}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-400 transition-all duration-300 hover:text-slate-200"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
        </div>

        {/* Action mode toggle */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
          {([
            { id: 'build' as Mode, icon: <TrendingUp className="w-3.5 h-3.5" />, label: sk ? 'Budovanie pozície' : 'Building position', hint: 'Deposit / Borrow' },
            { id: 'unwind' as Mode, icon: <TrendingDown className="w-3.5 h-3.5" />, label: sk ? 'Znižovanie rizika' : 'Reducing risk', hint: 'Withdraw / Repay' },
          ]).map(m => (
            <Button variant="ghost"
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`h-auto min-h-12 flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                mode === m.id
                  ? m.id === 'build'
                    ? 'bg-accent/20 text-accent border border-accent/50'
                    : 'bg-warning/20 text-warning border border-warning/50'
                  : 'text-muted-foreground border border-transparent hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-1.5">{m.icon}{m.label}</span>
              <span className="text-[9px] font-normal opacity-70">{m.hint}</span>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-400">{sk ? 'Celkový zostatok' : 'Total balance'}</p>
            <TokenValue amount={total} symbol={asset} price={price} decimals={4} size="xl" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all duration-300 ${
              unwind
                ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                : 'bg-purple-600/15 text-purple-300 border-purple-500/30'
            }`}>
              {unwind
                ? (sk ? 'Režim: Withdraw / Repay' : 'Mode: Withdraw / Repay')
                : robo ? `F&G ${roboFg} · ${robo.paused ? 'Pozastavené' : `Horizont ${robo.horizonWeeks} t.`} · ${robo.multiplier.toFixed(2)}×` : `F&G ${fearGreed?.value ?? '–'} · ${sk ? 'vklad' : 'deposit'} ${(fgRatio * 100).toFixed(0)} %`}
            </span>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              {isBtc ? 'Boost 1.40x (LTV 28.5%) · Pool Cap 33%' : `Target LTV ${(cfg.targetLtv * 100).toFixed(0)}% · Hardcap ${(cfg.maxLtv * 100).toFixed(0)}%`}
            </span>
          </div>
        </div>

        {(
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 grid grid-cols-3 gap-2 text-[10px] text-slate-400 font-mono">
              <div className="min-w-0"><p className="truncate">Celkové {asset}</p><p className="text-slate-200 truncate">{fmtQty(grandTotal)}</p></div>
              <div className="min-w-0"><p className="truncate">{asset} kolaterál (multi-chain)</p><p className="text-slate-200 truncate">{fmtQty(chainWbtc)}</p></div>
              <div className="min-w-0"><p className="truncate">Dlh stablecoiny (USD)</p><p className="text-slate-200 truncate">{chainDebt.toFixed(2)}</p></div>
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] text-slate-400" htmlFor={`ds-addr-${asset}`}>DeFi Saver Smart Wallet Address ({asset} modul)</label>
              <Input id={`ds-addr-${asset}`} value={addrDraft} placeholder="0x…" spellCheck={false}
                onChange={e => { setAddrDraft(e.target.value); if (isEvmAddress(e.target.value) || !e.target.value) setWalletAddr(e.target.value); }}
                className="h-8 bg-slate-950/70 border-slate-800 font-mono text-[11px]" />
              <p className={`text-[10px] font-mono ${btcScan.isError ? 'text-warning' : 'text-slate-500'}`}>
                {!isEvmAddress(walletAddr) ? 'Zadaj adresu – zatiaľ sa používajú zaznamenané hodnoty'
                  : btcScan.isFetching ? 'Načítavam on-chain zostatky…'
                  : btcScan.isError ? 'Dáta nedostupné – použité zaznamenané hodnoty'
                  : btcScan.data ? `LIVE 5 protokolov · ${btcScan.data.entries.length ? btcScan.data.entries.map(e => `${e.protocol} ${e.chain} ${e.asset} ${e.amountBtc.toFixed(4)}`).join(' · ') : `žiadny ${asset} kolaterál`}${btcScan.data.debts.length ? ` · dlh: ${btcScan.data.debts.map(d => `${d.protocol} ${d.chain} ${d.asset} ${d.peg === 'EUR' ? '€' : '$'}${d.amount.toFixed(2)}`).join(' · ')}` : ' · bez dlhu'}${btcScan.data.failed.length ? ` · nedostupné: ${btcScan.data.failed.join(', ')}` : ''} · ${new Date(btcScan.data.fetchedAt).toLocaleTimeString('sk-SK')}`
                  : '—'}
              </p>
            </div>
            {!isBtc && <div className="col-span-2 flex justify-between text-[10px] text-slate-400 font-mono">
              <span>Fiat Buffer (Rezerva pre Auto-Repay)</span>
              <span className="text-slate-200">{fmtUsd(freeStableUsd)}</span>
            </div>}
            {robo && <p className="col-span-2 text-[10px] text-slate-500 font-mono">
              Cieľové LTV {(robo.targetLtv * 100).toFixed(1)} % · voľné miesto {fmtQty(Math.max(0, robo.availableSpace))} {asset}
            </p>}
          </div>
        )}

        <p className="text-[10px] text-slate-500 font-mono">
          {priceError ? 'Dáta cien nedostupné' : pricesLoading || !price
            ? (sk ? 'Načítavam live cenu…' : 'Loading live price…')
            : `LIVE ${asset} ${fmtUsd(price)} · CoinGecko`}
        </p>

        {isBtc && <BtcIndicatorBox data={btcInd} />}

        {robo?.breaker.active && !unwind && (
          <div role="alert" className="rounded-lg border-2 border-amber-500/60 bg-gradient-to-r from-red-500/15 to-amber-500/15 px-3 py-2 text-[11px] text-amber-100 flex items-start gap-2 animate-fade-in shadow-[0_0_18px_hsl(var(--warning)/0.35)]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <div>
              <p className="font-bold tracking-wider uppercase text-red-300">⚠ Safety Circuit Breaker aktívny</p>
              <p>{robo.breaker.reasons.join(' · ')}. Nové požičiavanie pozastavené — priorita: splácanie dlhu a ochrana cold storage.</p>
            </div>
          </div>
        )}

        {/* Risk Engine warning */}
        {risk !== 'SAFE' && (
          <div className={`rounded-lg px-3 py-2 text-[11px] flex items-start gap-2 animate-fade-in ${
            risk === 'DANGER'
              ? 'bg-red-500/10 border border-red-500/40 text-red-200'
              : 'bg-amber-500/10 border border-amber-500/35 text-amber-200'
          }`}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p>
                {sk
                  ? `LTV ${((ltv ?? 0) * 100).toFixed(1)} % ${nearLiquidation ? 'sa blíži likvidácii' : 'dosahuje rizikový limit'}. Hardcap ${(cfg.maxLtv * 100).toFixed(0)} % · likvidačný prah ${(cfg.liqThreshold * 100).toFixed(0)} %. ${unwind ? 'Pokračuj v splácaní dlhu.' : 'Odporúčame Znižovanie rizika (Repay).'}`
                  : `LTV ${((ltv ?? 0) * 100).toFixed(1)}% is approaching the ${(cfg.liqThreshold * 100).toFixed(0)}% liquidation threshold. Switch to "Reducing risk (Repay)".`}
              </p>
              {!unwind && <Button variant="outline" size="sm"
                type="button"
                onClick={() => setMode('unwind')}
                className="rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-100 transition-all duration-300 hover:bg-amber-500/25"
              >
                {sk ? 'Prepnúť na Znižovanie rizika' : 'Switch to Reducing risk'}
              </Button>}
            </div>
          </div>
        )}

        {lowGas && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-[11px] text-red-300 flex items-center gap-2">
            <Fuel className="w-3.5 h-3.5 shrink-0" />
            {sk ? 'Nedostatok ETH pre Gas na L2.' : 'Insufficient ETH for L2 gas.'}
          </div>
        )}

        {refi && (
          <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100 flex items-start gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
            <p><span className="font-bold">Refinancing Alert:</span> Presun dlhu na {refi.route.protocol} na {refi.route.chain} ({refi.route.symbol} {refi.route.borrowApy?.toFixed(2)} %) ušetrí {fmtUsd2(refi.savingUsd)} ročne (po odpočte gasu {fmtUsd2(refi.gasUsd)}).</p>
          </div>
        )}
      </div>

      <div key={mode} className="space-y-4 animate-fade-in motion-reduce:animate-none transition-all duration-300 ease-in-out motion-reduce:transition-none">
        {layers}
      </div>

      <AuditLogPanel />
    </div>
  );
}
