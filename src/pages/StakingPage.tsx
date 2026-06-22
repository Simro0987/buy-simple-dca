import { useEffect, useState } from 'react';
import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG, StakingPosition } from '@/lib/wallets';
import { Lock, TrendingUp, Landmark, Zap, Send, ArrowDown } from 'lucide-react';
import { useDefiApys, DefiApyData } from '@/hooks/useDefiApys';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ContextCTAs } from '@/components/decision/ContextCTAs';
import { MasterProtocolCard } from '@/components/staking/MasterProtocolCard';
import { StakingCalculator } from '@/components/staking/StakingCalculator';
import { StakingTimingCard } from '@/components/staking/StakingTimingCard';
import { YieldPlannerCard } from '@/components/staking/YieldPlannerCard';
import { YieldRouteFinderCard } from '@/components/staking/YieldRouteFinderCard';
import { StakingLedgerCard } from '@/components/staking/StakingLedgerCard';
import { getPendingStake, clearPendingStake, getPendingLending, clearPendingLending } from '@/lib/pendingActions';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { overheatedWarning } from '@/lib/stakeAdvisor';
import { AlertTriangle } from 'lucide-react';
import { IdleStakeShortcuts } from '@/components/dashboard/IdleStakeShortcuts';
import { PortfolioProvider } from '@/contexts/PortfolioContext';

interface Props { lang: Lang; }

function getLiveApy(pos: StakingPosition, apys?: DefiApyData | null): number | null {
  if (!apys) return pos.apy ?? null;
  if (pos.protocol === 'Rocket Pool')        return apys.rocketPool;
  if (pos.protocol === 'ether.fi')           return apys.etherFi;
  if (pos.protocol === 'ether.fi → DeFi Saver') return apys.etherFi ?? pos.apy ?? null;
  if (pos.protocol === 'Aave V3')            return apys.aaveEth;
  if (pos.protocol === 'Marinade')           return apys.marinade;
  if (pos.protocol === 'Sanctum')            return apys.sanctumInf;
  if (pos.protocol === 'Kamino')             return apys.kaminoSol;
  // kept for compat (StakingTimingCard etc.)
  if (pos.label.includes('wstETH') && pos.type !== 'lending') return apys.lido;
  if (pos.protocol === 'Jito' || pos.protocol?.includes('jito')) return apys.jito;
  return pos.apy ?? null;
}

function typeIcon(type: StakingPosition['type']) {
  if (type === 'staking') return <TrendingUp className="w-3.5 h-3.5 text-gain" />;
  if (type === 'lending') return <Landmark className="w-3.5 h-3.5 text-accent" />;
  return <Lock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function typeLabel(type: StakingPosition['type'], lang: Lang) {
  const labels = {
    sk: { hold: 'HODL', staking: 'Staking', lending: 'Lending' },
    en: { hold: 'HODL', staking: 'Staking', lending: 'Lending' },
  };
  return labels[lang][type];
}

function yieldLabel(dir: StakingPosition['yieldDirection'], lang: Lang) {
  if (!dir || dir === 'none') return null;
  const labels = {
    sk: { btc: 'Výnos ide do BTC', restake: 'Re-stake', compound: 'Auto-compound' },
    en: { btc: 'Yield → BTC', restake: 'Re-stake', compound: 'Auto-compound' },
  };
  return labels[lang][dir];
}

export function StakingPage({ lang }: Props) {
  const { data: apys, isFetching: apyLoading } = useDefiApys();
  const [sending, setSending] = useState(false);
  const [pendingStake, setPendingStakeState] = useState(() => getPendingStake());
  const [pendingLending, setPendingLendingState] = useState(() => getPendingLending());
  useEffect(() => {
    const id = setInterval(() => {
      setPendingStakeState(getPendingStake());
      setPendingLendingState(getPendingLending());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Market-aware gate: when score > 55 we block any auto-prefill flow.
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });
  const overheated = (cycleResult?.score ?? 0) > 55;
  useEffect(() => {
    if (overheated && pendingStake) {
      clearPendingStake();
      setPendingStakeState(null);
    }
  }, [overheated, pendingStake]);

  const handleSendMaturityAlert = async () => {
    const chatId = localStorage.getItem('telegram_chat_id')?.trim();
    if (!chatId) {
      toast.error(lang === 'sk' ? 'Nastav Telegram Chat ID v nastaveniach' : 'Set Telegram Chat ID in settings');
      return;
    }

    setSending(true);
    try {
      // Collect all staking/lending positions with yield directions
      const maturityItems: Array<Record<string, unknown>> = [];
      for (const asset of STAKING_CONFIG) {
        for (const pos of asset.positions) {
          if (pos.type === 'hold') continue;
          const liveApy = getLiveApy(pos, apys);
          maturityItems.push({
            symbol: asset.symbol,
            protocol: pos.protocol || pos.label,
            type: pos.type,
            apy: liveApy,
            action: pos.yieldDirection === 'btc'
              ? `Konvertuj výnos do BTC (APY: ${liveApy?.toFixed(1) ?? '?'}%)`
              : pos.yieldDirection === 'compound'
              ? `Auto-compound aktívny (APY: ${liveApy?.toFixed(1) ?? '?'}%)`
              : `Skontroluj pozíciu (APY: ${liveApy?.toFixed(1) ?? '?'}%)`,
          });
        }
      }

      const { error } = await supabase.functions.invoke('telegram-staking-maturity', {
        body: { chatId, maturityItems },
      });

      if (error) throw error;
      toast.success(lang === 'sk' ? 'Staking alert odoslaný na Telegram ✓' : 'Staking alert sent to Telegram ✓');
    } catch (err) {
      console.error('Staking maturity alert error:', err);
      toast.error(lang === 'sk' ? 'Nepodarilo sa odoslať alert' : 'Failed to send alert');
    } finally {
      setSending(false);
    }
  };

  return (
    <PortfolioProvider>
    <div className="space-y-4">
      {/* Idle balances ready to stake — moved from Dashboard. Governs staking natively. */}
      <IdleStakeShortcuts lang={lang} marketScore={cycleResult?.score ?? 50} />

      {overheated && (
        <div className="rounded-lg border-2 border-loss/60 bg-loss/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-loss shrink-0 mt-0.5" />
          <p className="text-[11px] text-loss font-semibold leading-snug">
            {overheatedWarning(lang)}
          </p>
        </div>
      )}
      {pendingStake && !overheated && (
        <div className="rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <ArrowDown className="w-3.5 h-3.5" /> 💰 {lang === 'sk' ? 'PRIPRAVENÉ NA STAKE' : 'READY TO STAKE'}
            </p>
            <button
              onClick={() => { clearPendingStake(); setPendingStakeState(null); }}
              className="text-[10px] text-emerald-200/80 hover:text-emerald-100"
            >{lang === 'sk' ? 'Zrušiť' : 'Clear'}</button>
          </div>
          <p className="text-[11px] text-emerald-100 font-mono tabular-nums">
            {pendingStake.amount} {pendingStake.symbol} {lang === 'sk' ? 'z' : 'from'} {pendingStake.source.toUpperCase()}
          </p>
          <p className="text-[10px] text-emerald-200/80 leading-snug">
            {lang === 'sk'
              ? 'Použi master protokol nižšie (Babylon/Lido/Kamino). Každý deposit podpíš samostatne v hardware peňaženke.'
              : 'Use the master protocol below (Babylon/Lido/Kamino). Sign each deposit separately in your HW wallet.'}
          </p>
        </div>
      )}
      {pendingLending && (
        <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              🔄 {lang === 'sk' ? 'PRESUN DO LENDING / LIQUIDITY' : 'MOVE TO LENDING / LIQUIDITY'}
            </p>
            <button
              onClick={() => { clearPendingLending(); setPendingLendingState(null); }}
              className="text-[10px] text-amber-200/80 hover:text-amber-100"
            >{lang === 'sk' ? 'Zrušiť' : 'Clear'}</button>
          </div>
          <p className="text-[11px] text-amber-100 font-mono tabular-nums">
            {pendingLending.amount} {pendingLending.symbol} → {pendingLending.symbol === 'ETH' ? 'Aave V3 / Morpho Blue' : 'Kamino / Drift'}
          </p>
          {pendingLending.reason && (
            <p className="text-[10px] text-amber-200/80">{pendingLending.reason}</p>
          )}
          <p className="text-[10px] text-amber-200/80 leading-snug">
            {lang === 'sk'
              ? 'Otvor Yield Route Finder nižšie, vyber Lending stratégiu a podpíš v hardware peňaženke.'
              : 'Open the Yield Route Finder below, pick a Lending strategy and sign in your HW wallet.'}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          {lang === 'sk' ? 'Staking & Výnosy' : 'Staking & Yields'}
        </h1>
        <button
          onClick={handleSendMaturityAlert}
          disabled={sending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20 active:bg-primary/20 disabled:opacity-50"
        >
          <Send className={`w-3.5 h-3.5 ${sending ? 'animate-pulse' : ''}`} />
          {lang === 'sk' ? 'Test maturity alert' : 'Test maturity alert'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {lang === 'sk'
          ? 'Prehľad kde pracuje tvoj kapitál. Žiadne akcie – len informácie.'
          : 'Overview of where your capital works. No actions – information only.'}
      </p>
      <div className="flex items-center gap-1.5 text-[10px]">
        <Zap className="w-3 h-3 text-green-400" />
        <span className={apyLoading ? 'text-muted-foreground animate-pulse' : 'text-green-400'}>
          {apyLoading
            ? (lang === 'sk' ? 'Načítavam APY...' : 'Loading APY...')
            : (lang === 'sk' ? 'Live APY z DefiLlama' : 'Live APY from DefiLlama')}
        </span>
      </div>

      <ContextCTAs actions={['optimize_staking', 'move_to_yield']} />

      {/* Bi-directional manual staking ledger — source of truth for Portfolio liquid/staked split */}
      <StakingLedgerCard lang={lang} />

      <StakingTimingCard lang={lang} amountUsd={500} />

      {/* MODULE 1: Master Portfolio Yield Planner */}
      <YieldPlannerCard lang={lang} />

      {/* MODULE 2: Yield Route Finder & Scanner */}
      <YieldRouteFinderCard lang={lang} />

      <StakingCalculator lang={lang} />

      <MasterProtocolCard lang={lang} />

      {STAKING_CONFIG.map(asset => {
        const isDynamicSplit = asset.symbol !== 'BTC';
        const stakingPositions = asset.positions.filter(p => p.type !== 'hold');
        return (
          <div
            key={asset.symbol}
            style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '1.5rem', overflow: 'hidden' }}
          >
            {/* Colored accent line */}
            <div style={{ height: 2, background: `linear-gradient(90deg, ${asset.color}, transparent)` }} />

            {/* Header */}
            <div className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-2xl flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: asset.color + '18', color: asset.color, border: `1px solid ${asset.color}30` }}
                  >
                    {asset.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white text-sm tracking-tight">{asset.symbol}</p>
                      {isDynamicSplit && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                          style={{ background: `${asset.color}18`, color: asset.color, border: `1px solid ${asset.color}30` }}>
                          Dynamic Split
                        </span>
                      )}
                    </div>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.40)' }}>{asset.name}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-white tabular-nums">{asset.allocation}%</span>
              </div>
            </div>

            {/* Positions */}
            <div className="px-4 pb-4 space-y-2">
              {asset.positions.map((pos, i) => {
                const liveApy = getLiveApy(pos, apys);
                const yield_ = yieldLabel(pos.yieldDirection, lang);
                const isStaking = pos.type === 'staking';
                const isLending = pos.type === 'lending';
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-2xl px-3 py-2.5"
                    style={{
                      background: isStaking ? `${asset.color}0A` : isLending ? 'rgba(14,165,233,0.06)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isStaking ? asset.color + '25' : isLending ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    {typeIcon(pos.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{pos.label}</span>
                        <span className="text-xs font-bold text-white tabular-nums">{pos.percentage}%</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.50)' }}>
                          {typeLabel(pos.type, lang)}
                        </span>
                        {pos.protocol && (
                          <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{pos.protocol}</span>
                        )}
                        {liveApy != null && (
                          <span className="text-[10px] font-bold tabular-nums" style={{ color: '#14F195' }}>
                            {liveApy.toFixed(2)}% APY
                          </span>
                        )}
                      </div>
                      {yield_ && (
                        <p className="text-[9px] mt-1" style={{ color: '#0ea5e9' }}>→ {yield_}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Allocation bar */}
            <div className="mx-4 mb-4 flex h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {asset.positions.map((pos, i) => {
                const c = { hold: 'rgba(255,255,255,0.20)', staking: asset.color + 'CC', lending: '#0ea5e9CC' };
                return <div key={i} style={{ width: `${pos.percentage}%`, background: c[pos.type] }} />;
              })}
            </div>
          </div>
        );
      })}

      {/* Yield flow summary — Master Protokol 2026 */}
      <div className="glass-card p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground">
          {lang === 'sk' ? 'Tok výnosov (Master Protokol 2026)' : 'Yield Flow (Master Protocol 2026)'}
        </p>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            • <span className="text-foreground">BTC:</span> Babylon (compound) + LBTC v Morpho Blue → {lang === 'sk' ? 'späť do BTC' : 'back to BTC'}
          </p>
          <p className="text-xs text-muted-foreground">
            • <span className="text-foreground">ETH:</span> <span style={{ color: '#627EEA' }}>Dynamic Split</span> — Rocket Pool (rETH ~3.05%) + ether.fi (weETH ~4.38%) + weETH/DeFi Saver → {lang === 'sk' ? 'výnos do BTC' : 'yield → BTC'}
          </p>
          <p className="text-xs text-muted-foreground">
            • <span className="text-foreground">SOL:</span> <span style={{ color: '#9945FF' }}>Dynamic Split</span> — Marinade (mSOL ~7.37%) + Sanctum INF (~8.00%) → {lang === 'sk' ? 'výnos do BTC' : 'yield → BTC'}
          </p>
          <p className="text-xs text-muted-foreground">
            • {lang === 'sk' ? 'Cieľ: akumulovať 1 BTC cez všetky kanály.' : 'Goal: accumulate 1 BTC across all channels.'}
          </p>
        </div>
      </div>
    </div>
    </PortfolioProvider>
  );
}
