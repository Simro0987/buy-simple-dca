// Decision Layer: derives actionable recommendations, risk changes,
// concentration warnings, exit signals, and yield opportunities from
// existing market/portfolio data. Pure functions, no side effects.
//
// Snapshots for change-detection are persisted in localStorage.

import { TOKENS, PriceData, AthData } from './crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import { DefiApyData } from '@/hooks/useDefiApys';

export type Priority = 'P0' | 'P1' | 'P2';
export type Horizon = 'short' | 'mid' | 'long';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface Recommendation {
  id: string;
  action: string;            // "Stake ETH", "Reduce BTC exposure"
  reason: string;            // krátky kontext
  why: string[];             // bullet body do PREČO sekcie
  priority: Priority;
  confidence: number;        // 0..100
  horizon: Horizon;
  risk: RiskLevel;
  cta?: { label: string; href: string }; // externý wallet / app
}

export interface RiskChange {
  key: string;
  label: string;             // "BTC riziko", "Funding rate", "Lido APY"
  delta: number;             // numerická zmena (signed)
  unit?: string;             // "%", "bps"
  direction: 'up' | 'down';
  tone: 'positive' | 'negative' | 'neutral';
}

export interface ConcentrationWarning {
  level: RiskLevel;
  title: string;
  message: string;
  recommendation: string;
}

export interface ExitSignal {
  trigger: string;           // "Funding rate extrém"
  detail: string;            // čo sa zmenilo
  verdict: 'reduce_exposure' | 'hold' | 'take_partial_profit';
  severity: RiskLevel;
}

export interface YieldOpportunity {
  protocol: string;
  asset: 'ETH' | 'SOL' | 'BTC';
  apy: number;
  apyDelta?: number;         // zmena APY (pp)
  risk: RiskLevel;
  riskAdjusted: number;      // APY / riskFactor
  recommendation: 'enter' | 'ignore' | 'reduce';
  href: string;              // deep link
}

// ---------- snapshots ----------
const SNAPSHOT_KEY = 'decision-snapshot-v1';

interface Snapshot {
  ts: number;
  prices?: Record<string, number>;
  funding?: number;
  btcDom?: number;
  apys?: Partial<DefiApyData>;
  cycleScore?: number;
}

function loadSnapshot(): Snapshot | null {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null'); }
  catch { return null; }
}

function saveSnapshot(s: Snapshot) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function recordSnapshot(input: {
  prices?: PriceData;
  advanced?: AdvancedMarketData | null;
  apys?: DefiApyData | null;
  cycle?: MarketCycleResult | null;
}) {
  const prev = loadSnapshot();
  // refresh at most once per 30 min to keep deltas meaningful
  if (prev && Date.now() - prev.ts < 30 * 60 * 1000) return;
  const snap: Snapshot = {
    ts: Date.now(),
    prices: input.prices
      ? Object.fromEntries(TOKENS.map(t => [t.id, input.prices![t.coingeckoId]?.usd ?? 0]))
      : undefined,
    funding: input.advanced?.tradingMetrics.fundingRate,
    btcDom: input.advanced?.btcDominance.dominance,
    apys: input.apys ?? undefined,
    cycleScore: input.cycle?.score,
  };
  saveSnapshot(snap);
}

// ---------- holdings ----------
export function loadHoldings(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}'); }
  catch { return {}; }
}

// ---------- risk changes ----------
export function computeRiskChanges(input: {
  prices?: PriceData;
  advanced?: AdvancedMarketData | null;
  apys?: DefiApyData | null;
}): RiskChange[] {
  const out: RiskChange[] = [];
  const prev = loadSnapshot();
  if (!prev) return out;

  // Per-token 24h change as proxy for risk shift
  if (input.prices) {
    for (const t of TOKENS.slice(0, 3)) {
      const cur = input.prices[t.coingeckoId]?.usd ?? 0;
      const old = prev.prices?.[t.id] ?? 0;
      if (cur > 0 && old > 0) {
        const delta = ((cur - old) / old) * 100;
        if (Math.abs(delta) >= 1) {
          out.push({
            key: `risk_${t.id}`,
            label: `${t.symbol} riziko`,
            delta: -delta, // pokles ceny = vyššie riziko
            unit: '%',
            direction: delta < 0 ? 'up' : 'down',
            tone: delta < 0 ? 'negative' : 'positive',
          });
        }
      }
    }
  }

  // Funding rate change
  if (input.advanced && prev.funding != null) {
    const cur = input.advanced.tradingMetrics.fundingRate;
    const delta = (cur - prev.funding) * 10000; // bps
    if (Math.abs(delta) >= 1) {
      out.push({
        key: 'funding',
        label: 'Funding rate',
        delta,
        unit: 'bps',
        direction: delta > 0 ? 'up' : 'down',
        tone: delta > 0 ? 'negative' : 'positive',
      });
    }
  }

  // Staking yield zmeny (Lido + Jito)
  if (input.apys && prev.apys) {
    const pairs: Array<[keyof DefiApyData, string]> = [
      ['lido', 'Lido APY'],
      ['jito', 'Jito APY'],
      ['aaveEth', 'Aave APY'],
    ];
    for (const [key, label] of pairs) {
      const cur = input.apys[key];
      const old = prev.apys[key];
      if (cur != null && old != null) {
        const delta = cur - old;
        if (Math.abs(delta) >= 0.1) {
          out.push({
            key,
            label,
            delta,
            unit: 'pp',
            direction: delta > 0 ? 'up' : 'down',
            tone: delta > 0 ? 'positive' : 'negative',
          });
        }
      }
    }
  }

  // BTC dominance ako TVL/flow proxy
  if (input.advanced && prev.btcDom != null) {
    const cur = input.advanced.btcDominance.dominance;
    const delta = cur - prev.btcDom;
    if (Math.abs(delta) >= 0.3) {
      out.push({
        key: 'btc_dom',
        label: 'BTC dominancia',
        delta,
        unit: 'pp',
        direction: delta > 0 ? 'up' : 'down',
        tone: 'neutral',
      });
    }
  }

  return out.slice(0, 6);
}

// ---------- concentration warnings ----------
export function computeConcentrationWarnings(prices?: PriceData): ConcentrationWarning[] {
  if (!prices) return [];
  const holdings = loadHoldings();
  const tokens = TOKENS.map(t => ({
    t,
    val: (holdings[t.id] ?? 0) * (prices[t.coingeckoId]?.usd ?? 0),
  }));
  const total = tokens.reduce((s, x) => s + x.val, 0);
  if (total <= 0) return [];

  const out: ConcentrationWarning[] = [];

  for (const { t, val } of tokens) {
    const pct = (val / total) * 100;
    if (pct > 70) {
      out.push({
        level: 'high',
        title: `${t.symbol} > 70 %`,
        message: `Tvoja expozícia v ${t.symbol} je ${pct.toFixed(0)} % portfólia.`,
        recommendation: `Zváž odpredaj časti ${t.symbol} a diverzifikáciu do iných aktív.`,
      });
    } else if (pct > 50) {
      out.push({
        level: 'medium',
        title: `${t.symbol} > 50 %`,
        message: `${t.symbol} predstavuje ${pct.toFixed(0)} % portfólia.`,
        recommendation: `Skontroluj alokáciu — sleduj cieľovú váhu.`,
      });
    }
  }

  // Defi/staking expozícia (ETH + SOL spoločne ako proxy pre defi)
  const ethSol = tokens.filter(x => x.t.symbol === 'ETH' || x.t.symbol === 'SOL').reduce((s, x) => s + x.val, 0);
  const defiPct = (ethSol / total) * 100;
  if (defiPct > 60) {
    out.push({
      level: 'medium',
      title: 'Vysoká DeFi expozícia',
      message: `ETH + SOL tvoria ${defiPct.toFixed(0)} % — vyššie smart-contract riziko.`,
      recommendation: 'Zváž presun časti do BTC (cold storage).',
    });
  }

  // Chain dominance — ak jedna sieť > 80 %
  return out.slice(0, 4);
}

// ---------- exit signals ----------
export function computeExitSignals(
  advanced?: AdvancedMarketData | null,
  athData?: AthData,
  prices?: PriceData,
): ExitSignal[] {
  const out: ExitSignal[] = [];
  if (!advanced) return out;

  // Funding rate extrém
  const fr = advanced.tradingMetrics.fundingRate;
  if (fr > 0.05) {
    out.push({
      trigger: 'Funding rate extrém',
      detail: `Funding ${(fr * 100).toFixed(3)} % — long preplnený, riziko long-squeeze.`,
      verdict: 'take_partial_profit',
      severity: 'high',
    });
  } else if (fr < -0.02) {
    out.push({
      trigger: 'Negatívny funding',
      detail: `Funding ${(fr * 100).toFixed(3)} % — short preplnený, kontrarian buy zóna.`,
      verdict: 'hold',
      severity: 'low',
    });
  }

  // MVRV proxy: BTC/ETH blízko ATH
  if (athData && prices) {
    const checks: Array<{ id: string; sym: string }> = [
      { id: 'bitcoin', sym: 'BTC' },
      { id: 'ethereum', sym: 'ETH' },
    ];
    for (const c of checks) {
      const ath = athData[c.id]?.ath;
      const cur = prices[c.id]?.usd;
      if (ath && cur) {
        const dist = ((ath - cur) / ath) * 100;
        if (dist < 5) {
          out.push({
            trigger: `${c.sym} pri ATH (MVRV proxy)`,
            detail: `${c.sym} je ${dist.toFixed(1)} % od ATH — historicky zóna distribúcie.`,
            verdict: 'take_partial_profit',
            severity: 'medium',
          });
        }
      }
    }
  }

  // Volatility / crowd signal
  if (advanced.tradingMetrics.crowdSignal === 'long_crowded') {
    out.push({
      trigger: 'Crowd long preplnený',
      detail: 'Open interest + funding ukazujú extrém na long strane.',
      verdict: 'reduce_exposure',
      severity: 'medium',
    });
  }

  // Liquidity risk: veľa long likvidácií tesne pod cenou
  const longClose = advanced.liquidationLevels.find(
    l => l.side === 'long' && l.intensity === 'high',
  );
  if (longClose) {
    out.push({
      trigger: 'Likvidačné pásmo (long)',
      detail: `Vysoká koncentrácia long likvidácií @ $${longClose.price.toFixed(0)}.`,
      verdict: 'reduce_exposure',
      severity: 'high',
    });
  }

  return out.slice(0, 4);
}

// ---------- yield opportunities ----------
export function computeYieldOpportunities(apys?: DefiApyData | null): YieldOpportunity[] {
  if (!apys) return [];
  const prev = loadSnapshot()?.apys;
  const items: YieldOpportunity[] = [
    {
      protocol: 'Lido (wstETH)',
      asset: 'ETH',
      apy: apys.lido,
      apyDelta: prev?.lido != null ? apys.lido - prev.lido : undefined,
      risk: 'low',
      riskAdjusted: apys.lido / 1,
      recommendation: apys.lido >= 3 ? 'enter' : 'ignore',
      href: 'https://stake.lido.fi/',
    },
    {
      protocol: 'Rocket Pool (rETH)',
      asset: 'ETH',
      apy: apys.rocketPool,
      apyDelta: prev?.rocketPool != null ? apys.rocketPool - prev.rocketPool : undefined,
      risk: 'low',
      riskAdjusted: apys.rocketPool / 1,
      recommendation: apys.rocketPool >= 3 ? 'enter' : 'ignore',
      href: 'https://stake.rocketpool.net/',
    },
    {
      protocol: 'Jito (JitoSOL)',
      asset: 'SOL',
      apy: apys.jito,
      apyDelta: prev?.jito != null ? apys.jito - prev.jito : undefined,
      risk: 'medium',
      riskAdjusted: apys.jito / 1.5,
      recommendation: apys.jito >= 6 ? 'enter' : 'ignore',
      href: 'https://www.jito.network/',
    },
    {
      protocol: 'Aave V3 (ETH supply)',
      asset: 'ETH',
      apy: apys.aaveEth,
      apyDelta: prev?.aaveEth != null ? apys.aaveEth - prev.aaveEth : undefined,
      risk: 'medium',
      riskAdjusted: apys.aaveEth / 1.5,
      recommendation: apys.aaveEth >= 2.5 ? 'enter' : 'ignore',
      href: 'https://app.aave.com/',
    },
    {
      protocol: 'Kamino (SOL lending)',
      asset: 'SOL',
      apy: apys.kaminoSol,
      apyDelta: prev?.kaminoSol != null ? apys.kaminoSol - prev.kaminoSol : undefined,
      risk: 'medium',
      riskAdjusted: apys.kaminoSol / 1.5,
      recommendation: apys.kaminoSol >= 4 ? 'enter' : 'ignore',
      href: 'https://app.kamino.finance/',
    },
  ];

  return items.sort((a, b) => b.riskAdjusted - a.riskAdjusted).slice(0, 4);
}

// ---------- recommendations (TOP 3) ----------
export function computeRecommendations(input: {
  prices?: PriceData;
  athData?: AthData;
  cycle?: MarketCycleResult | null;
  advanced?: AdvancedMarketData | null;
  apys?: DefiApyData | null;
}): Recommendation[] {
  const all: Recommendation[] = [];
  const { prices, athData, cycle, advanced, apys } = input;
  const holdings = loadHoldings();

  // 1) Reduce BTC exposure pri ATH + extrémny funding
  if (advanced && athData && prices) {
    const btcAth = athData['bitcoin']?.ath;
    const btcPrice = prices['bitcoin']?.usd;
    const fr = advanced.tradingMetrics.fundingRate;
    if (btcAth && btcPrice) {
      const dist = ((btcAth - btcPrice) / btcAth) * 100;
      if (dist < 5 && fr > 0.03) {
        all.push({
          id: 'reduce_btc',
          action: 'Znížiť BTC expozíciu',
          reason: `BTC ${dist.toFixed(1)} % od ATH a funding ${(fr * 100).toFixed(2)} %.`,
          why: [
            `BTC cena je ${dist.toFixed(1)} % od ATH — historicky distribučná zóna.`,
            `Funding rate ${(fr * 100).toFixed(3)} % indikuje preplnený long.`,
            'Riziko long-squeeze a krátkodobej korekcie je zvýšené.',
          ],
          priority: 'P0',
          confidence: 78,
          horizon: 'short',
          risk: 'medium',
          cta: { label: 'Otvoriť burzu', href: 'https://www.binance.com/en/trade/BTC_USDT' },
        });
      }
    }
  }

  // 2) Stake ETH ak nie je staked a APY > 3 %
  if (apys && holdings['ethereum'] != null && holdings['ethereum'] > 0.05) {
    const apy = Math.max(apys.lido, apys.rocketPool);
    if (apy >= 3) {
      all.push({
        id: 'stake_eth',
        action: 'Stake ETH cez Lido',
        reason: `Lido APY ${apy.toFixed(2)} % — voľný ETH negeneruje výnos.`,
        why: [
          `Aktuálne Lido APY je ${apys.lido.toFixed(2)} %, Rocket Pool ${apys.rocketPool.toFixed(2)} %.`,
          `Držíš ${holdings['ethereum'].toFixed(3)} ETH — staking by pridal ~${(holdings['ethereum'] * (prices?.['ethereum']?.usd ?? 0) * apy / 100).toFixed(0)} USD/rok.`,
          'wstETH je kompozovateľné v DeFi (lending, collateral).',
        ],
        priority: 'P1',
        confidence: 82,
        horizon: 'long',
        risk: 'low',
        cta: { label: 'Otvoriť Lido', href: 'https://stake.lido.fi/' },
      });
    }
  }

  // 3) Cycle-based DCA / akumulácia
  if (cycle && cycle.zone === 'extreme_fear') {
    all.push({
      id: 'dca_fear',
      action: 'Zrýchliť DCA nákupy',
      reason: `Cycle score ${cycle.score.toFixed(0)} — extrémny strach.`,
      why: [
        `Market cycle score je ${cycle.score.toFixed(0)} (extrémny strach).`,
        'Historicky najlepšie DCA okno z hľadiska risk/reward.',
        cycle.guidance,
      ],
      priority: 'P0',
      confidence: 85,
      horizon: 'mid',
      risk: 'low',
    });
  }

  // 4) Take partial profit pri eufórii
  if (cycle && cycle.zone === 'euphoria') {
    all.push({
      id: 'partial_profit',
      action: 'Realizovať čiastočný zisk',
      reason: `Cycle score ${cycle.score.toFixed(0)} — eufória.`,
      why: [
        `Cycle score ${cycle.score.toFixed(0)} indikuje eufóriu.`,
        'Postupný predaj 10–20 % alt pozícií podľa profit-taking levelov.',
        '70 % do BTC, 30 % do stablecoin podľa stratégie.',
      ],
      priority: 'P0',
      confidence: 80,
      horizon: 'short',
      risk: 'medium',
    });
  }

  // 5) Stake SOL ak APY výhodná
  if (apys && holdings['solana'] != null && holdings['solana'] > 1 && apys.jito >= 6) {
    all.push({
      id: 'stake_sol',
      action: 'Stake SOL cez Jito',
      reason: `Jito APY ${apys.jito.toFixed(2)} % — silný liquid staking.`,
      why: [
        `JitoSOL APY ${apys.jito.toFixed(2)} % vrátane MEV.`,
        `Držíš ${holdings['solana'].toFixed(2)} SOL — pasívny výnos.`,
        'JitoSOL je likvidný a obchodovateľný.',
      ],
      priority: 'P1',
      confidence: 75,
      horizon: 'long',
      risk: 'low',
      cta: { label: 'Otvoriť Jito', href: 'https://www.jito.network/' },
    });
  }

  // 6) Rebalance ak významná deviácia
  if (prices) {
    const tokens = TOKENS.map(t => ({
      t,
      val: (holdings[t.id] ?? 0) * (prices[t.coingeckoId]?.usd ?? 0),
    }));
    const total = tokens.reduce((s, x) => s + x.val, 0);
    if (total > 0) {
      for (const { t, val } of tokens) {
        const pct = (val / total) * 100;
        const target = t.allocation * 100;
        if (Math.abs(pct - target) > 8) {
          all.push({
            id: `rebalance_${t.id}`,
            action: `Rebalansovať ${t.symbol}`,
            reason: `${t.symbol} ${pct.toFixed(0)} % vs. cieľ ${target.toFixed(0)} %.`,
            why: [
              `Aktuálna alokácia ${t.symbol}: ${pct.toFixed(1)} %.`,
              `Cieľová alokácia: ${target.toFixed(1)} %.`,
              `Deviácia ${(pct - target).toFixed(1)} pp prekračuje 8 % prah.`,
            ],
            priority: 'P2',
            confidence: 70,
            horizon: 'mid',
            risk: pct > target ? 'medium' : 'low',
          });
          break; // jedno rebalance odporúčanie stačí
        }
      }
    }
  }

  // Sort: P0 > P1 > P2, then confidence
  const order: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };
  all.sort((a, b) => order[a.priority] - order[b.priority] || b.confidence - a.confidence);
  return all.slice(0, 3);
}
