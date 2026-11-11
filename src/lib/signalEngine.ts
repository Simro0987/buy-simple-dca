// Signal Ranking Engine — agreguje všetky existujúce signálové vrstvy
// (market regime, risk, defi, wallet) do TOP 1–3 akčných signálov.
//
// Filosofia: NO NOISE. Žiadne duplicity, žiadne slabé signály (<70 score),
// žiadne fallbacky. Buď máme akčný signál, alebo NO SIGNAL.

import { TOKENS, PriceData, AthData } from './crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import { DefiApyData } from '@/hooks/useDefiApys';
import { loadHoldings } from './decisionEngine';

// ---------- typy ----------

export type MarketRegime = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' | 'DEFENSIVE';
export type SignalType = 'market' | 'portfolio' | 'defi';
export type Impact = 'low' | 'medium' | 'high';
export type Horizon = 'short' | 'mid' | 'long';

export interface RankedSignal {
  id: string;
  title: string;              // akcia
  type: SignalType;
  reason: string;             // 1–2 vety
  impact: Impact;
  confidence: number;         // 0..100
  horizon: Horizon;
  expectedEffect: string;     // čo to spraví s portfóliom
  score: number;              // výpočtové skóre 0..100+
}

export interface SignalEngineOutput {
  regime: MarketRegime;
  regimeReason: string;
  signals: RankedSignal[];    // 0..3
  threshold: number;
}

// ---------- raw signál pred prioritizáciou ----------

interface RawSignal {
  id: string;
  title: string;
  type: SignalType;
  reason: string;
  impact: number;             // 1..10
  confidence: number;         // 0..100
  urgency: number;            // 1..10
  riskPenalty: number;        // 1..5
  horizon: Horizon;
  expectedEffect: string;
  // Compatibility tag pre regime override
  bias: 'growth' | 'reduce' | 'rotate' | 'neutral';
}

const SCORE_THRESHOLD = 70;

// ---------- 1. Market Regime detection ----------

export function detectRegime(input: {
  cycle?: MarketCycleResult | null;
  advanced?: AdvancedMarketData | null;
}): { regime: MarketRegime; reason: string } {
  const { cycle, advanced } = input;

  if (!cycle) {
    return { regime: 'NEUTRAL', reason: 'Cycle data nedostupná.' };
  }

  const score = cycle.score;
  const fr = advanced?.tradingMetrics.fundingRate ?? 0;
  const crowd = advanced?.tradingMetrics.crowdSignal;

  // DEFENSIVE: extrémny long crowd + vysoký funding pri vysokom skóre
  if (score >= 75 && fr > 0.04 && crowd === 'long_crowded') {
    return {
      regime: 'DEFENSIVE',
      reason: `Cycle ${score.toFixed(0)}, funding ${(fr * 100).toFixed(2)} %, long preplnený — defenzívny mód.`,
    };
  }

  // RISK-OFF: eufória alebo distribučná zóna
  if (score >= 70) {
    return {
      regime: 'RISK_OFF',
      reason: `Cycle score ${score.toFixed(0)} — distribučná / euforická zóna.`,
    };
  }

  // RISK-ON: extrémny strach / akumulácia
  if (score <= 30) {
    return {
      regime: 'RISK_ON',
      reason: `Cycle score ${score.toFixed(0)} — akumulačná zóna.`,
    };
  }

  return {
    regime: 'NEUTRAL',
    reason: `Cycle score ${score.toFixed(0)} — bez vyhraneného režimu.`,
  };
}

// ---------- 2. Generátory raw signálov ----------

function buildMarketSignals(
  advanced: AdvancedMarketData | null | undefined,
  prices: PriceData | undefined,
  athData: AthData | undefined,
): RawSignal[] {
  const out: RawSignal[] = [];
  if (!advanced) return out;

  const fr = advanced.tradingMetrics.fundingRate;

  // Funding rate extrém → liquidity stress
  if (fr > 0.05) {
    out.push({
      id: 'mkt_funding_extreme',
      title: 'Realizovať časť ziskov pred long-squeezom',
      type: 'market',
      reason: `Funding rate ${(fr * 100).toFixed(3)} % — long strana je preplnená a hrozí kaskádová likvidácia.`,
      impact: 8,
      confidence: 80,
      urgency: 9,
      riskPenalty: 2,
      horizon: 'short',
      expectedEffect: 'Zníži drawdown pri korekcii o 5–15 %.',
      bias: 'reduce',
    });
  } else if (fr < -0.02) {
    out.push({
      id: 'mkt_funding_negative',
      title: 'Kontrarian akumulácia',
      type: 'market',
      reason: `Funding ${(fr * 100).toFixed(3)} % — short preplnený, historicky bullish setup.`,
      impact: 7,
      confidence: 70,
      urgency: 6,
      riskPenalty: 2,
      horizon: 'mid',
      expectedEffect: 'Vstup blízko lokálneho dna pri short-squeeze.',
      bias: 'growth',
    });
  }

  // Volatility expansion (proxy: liquidation high intensity blízko ceny)
  const highLong = advanced.liquidationLevels.find(
    (l) => l.side === 'long' && l.intensity === 'high',
  );
  if (highLong) {
    out.push({
      id: 'mkt_volatility',
      title: 'Pripraviť hedge / znížiť expozíciu',
      type: 'market',
      reason: `Hustá long-likvidačná zóna pri $${highLong.price.toFixed(0)} — volatilita môže expandovať.`,
      impact: 7,
      confidence: 65,
      urgency: 7,
      riskPenalty: 2,
      horizon: 'short',
      expectedEffect: 'Ochrana pred 8–12 % cascading dump.',
      bias: 'reduce',
    });
  }

  // MVRV proxy: BTC/ETH veľmi blízko ATH
  if (athData && prices) {
    for (const sym of ['bitcoin', 'ethereum'] as const) {
      const ath = athData[sym]?.ath;
      const cur = prices[sym]?.usd;
      if (ath && cur) {
        const dist = ((ath - cur) / ath) * 100;
        if (dist < 3) {
          out.push({
            id: `mkt_mvrv_${sym}`,
            title: `Postupný predaj ${sym === 'bitcoin' ? 'BTC' : 'ETH'} pri ATH`,
            type: 'market',
            reason: `${sym === 'bitcoin' ? 'BTC' : 'ETH'} je ${dist.toFixed(1)} % od ATH — historicky distribučná zóna.`,
            impact: 8,
            confidence: 75,
            urgency: 7,
            riskPenalty: 2,
            horizon: 'short',
            expectedEffect: 'Zamknutie ziskov v hornej časti cyklu.',
            bias: 'reduce',
          });
        }
      }
    }
  }

  // BTC dominancia → rotation signal
  if (advanced.btcDominance.trend === 'falling' && advanced.btcDominance.dominance < 55) {
    out.push({
      id: 'mkt_alt_rotation',
      title: 'Rotácia do ETH/SOL',
      type: 'market',
      reason: `BTC dominancia klesá na ${advanced.btcDominance.dominance.toFixed(1)} % — altcoin expanzia.`,
      impact: 6,
      confidence: 65,
      urgency: 5,
      riskPenalty: 2,
      horizon: 'mid',
      expectedEffect: 'Vyššia výkonnosť v alt-fáze cyklu.',
      bias: 'rotate',
    });
  }

  return out;
}

function buildPortfolioSignals(prices: PriceData | undefined): RawSignal[] {
  const out: RawSignal[] = [];
  if (!prices) return out;

  const holdings = loadHoldings();
  const tokens = TOKENS.map((t) => ({
    t,
    val: (holdings[t.id] ?? 0) * (prices[t.coingeckoId]?.usd ?? 0),
  }));
  const total = tokens.reduce((s, x) => s + x.val, 0);
  if (total <= 0) return out;

  // Overconcentration > 70 %
  for (const { t, val } of tokens) {
    const pct = (val / total) * 100;
    if (pct > 70) {
      out.push({
        id: `pf_overconc_${t.id}`,
        title: `Diverzifikovať z ${t.symbol}`,
        type: 'portfolio',
        reason: `${t.symbol} tvorí ${pct.toFixed(0)} % portfólia — vysoké koncentračné riziko.`,
        impact: 8,
        confidence: 90,
        urgency: 7,
        riskPenalty: 2,
        horizon: 'mid',
        expectedEffect: 'Zníži single-asset drawdown o ~30–40 %.',
        bias: 'reduce',
      });
      break;
    } else if (pct > 55) {
      out.push({
        id: `pf_conc_${t.id}`,
        title: `Sledovať expozíciu ${t.symbol}`,
        type: 'portfolio',
        reason: `${t.symbol} ${pct.toFixed(0)} % — nad cieľovou váhou.`,
        impact: 5,
        confidence: 80,
        urgency: 4,
        riskPenalty: 2,
        horizon: 'mid',
        expectedEffect: 'Vyrovnanie alokácie k cieľu.',
        bias: 'reduce',
      });
      break;
    }
  }

  // Idle capital: ETH/SOL bez staking-friendly veľkosti (proxy: > $200 a nestaked nemáme údaj)
  // Použijeme prah na minimálne držanie kde má staking význam.
  const ethVal = tokens.find((x) => x.t.id === 'ethereum')?.val ?? 0;
  const solVal = tokens.find((x) => x.t.id === 'solana')?.val ?? 0;
  if (ethVal > 500) {
    out.push({
      id: 'pf_idle_eth',
      title: 'Aktivovať voľný ETH do staking',
      type: 'portfolio',
      reason: `~$${ethVal.toFixed(0)} v ETH bez automaticky detekovaného yield — kapitál nepracuje.`,
      impact: 6,
      confidence: 70,
      urgency: 5,
      riskPenalty: 2,
      horizon: 'long',
      expectedEffect: 'Pasívny výnos ~3 % ročne.',
      bias: 'growth',
    });
  }
  if (solVal > 500) {
    out.push({
      id: 'pf_idle_sol',
      title: 'Aktivovať voľný SOL do staking',
      type: 'portfolio',
      reason: `~$${solVal.toFixed(0)} v SOL bez automaticky detekovaného yield.`,
      impact: 6,
      confidence: 70,
      urgency: 5,
      riskPenalty: 2,
      horizon: 'long',
      expectedEffect: 'Pasívny výnos ~6–7 % ročne (Jito).',
      bias: 'growth',
    });
  }

  return out;
}

function buildDefiSignals(apys: DefiApyData | null | undefined): RawSignal[] {
  const out: RawSignal[] = [];
  if (!apys) return out;

  // Yield improvement: ak je Rocket Pool výrazne nad Lido (alebo naopak)
  const lidoVsRp = apys.rocketPool - apys.lido;
  if (Math.abs(lidoVsRp) >= 0.4) {
    const better = lidoVsRp > 0 ? 'Rocket Pool' : 'Lido';
    out.push({
      id: 'defi_eth_switch',
      title: `Presun ETH staking → ${better}`,
      type: 'defi',
      reason: `${better} APY ${(lidoVsRp > 0 ? apys.rocketPool : apys.lido).toFixed(2)} % vs. konkurencia ${(lidoVsRp > 0 ? apys.lido : apys.rocketPool).toFixed(2)} %.`,
      impact: 5,
      confidence: 70,
      urgency: 4,
      riskPenalty: 2,
      horizon: 'long',
      expectedEffect: `+${Math.abs(lidoVsRp).toFixed(2)} pp APY na ETH alokácii.`,
      bias: 'rotate',
    });
  }

  // Risk-adjusted yield: Jito > 7 % je atraktívny
  if (apys.jito >= 7) {
    out.push({
      id: 'defi_jito_high',
      title: 'Maximalizovať SOL výnos cez Jito',
      type: 'defi',
      reason: `JitoSOL APY ${apys.jito.toFixed(2)} % — silný risk-adjusted výnos.`,
      impact: 6,
      confidence: 75,
      urgency: 5,
      riskPenalty: 2,
      horizon: 'long',
      expectedEffect: `+${(apys.jito - 0).toFixed(1)} pp ročne na SOL pozícii.`,
      bias: 'growth',
    });
  }

  // Aave nízky → exit
  if (apys.aaveEth < 1.5) {
    out.push({
      id: 'defi_aave_exit',
      title: 'Stiahnuť ETH z Aave',
      type: 'defi',
      reason: `Aave V3 ETH supply APY ${apys.aaveEth.toFixed(2)} % — nezaplatí ani opportunity cost staking.`,
      impact: 5,
      confidence: 75,
      urgency: 4,
      riskPenalty: 2,
      horizon: 'mid',
      expectedEffect: 'Presun do staking +1.5–2 pp APY.',
      bias: 'rotate',
    });
  }

  return out;
}

// ---------- 3. Scoring ----------

function score(s: RawSignal): number {
  const base = (s.impact * s.confidence * s.urgency) / s.riskPenalty;
  // Normalizácia: max teoretické (10*100*10/1)=10000 → /100
  return Math.round(base / 100);
}

// ---------- 4. Regime override ----------

function regimeAllows(regime: MarketRegime, bias: RawSignal['bias']): boolean {
  switch (regime) {
    case 'DEFENSIVE':
      return bias === 'reduce';
    case 'RISK_OFF':
      return bias === 'reduce' || bias === 'rotate';
    case 'RISK_ON':
      return bias !== 'reduce' || true; // dovolíme všetko, ale rozhodne sa cez score
    case 'NEUTRAL':
      return true;
  }
}

function regimeMaxSignals(regime: MarketRegime): number {
  return regime === 'NEUTRAL' ? 1 : 3;
}

function dedupe(signals: RawSignal[]): RawSignal[] {
  // Jeden signál na (type + bias) — vyberá najsilnejší.
  const map = new Map<string, RawSignal>();
  for (const s of signals) {
    const key = `${s.type}_${s.bias}`;
    const ex = map.get(key);
    if (!ex || score(s) > score(ex)) map.set(key, s);
  }
  return [...map.values()];
}

// ---------- 5. Public API ----------

export function rankSignals(input: {
  prices?: PriceData;
  athData?: AthData;
  cycle?: MarketCycleResult | null;
  advanced?: AdvancedMarketData | null;
  apys?: DefiApyData | null;
}): SignalEngineOutput {
  const { regime, reason: regimeReason } = detectRegime({
    cycle: input.cycle,
    advanced: input.advanced,
  });

  const raw: RawSignal[] = [
    ...buildMarketSignals(input.advanced, input.prices, input.athData),
    ...buildPortfolioSignals(input.prices),
    ...buildDefiSignals(input.apys),
  ];

  // Regime filter
  const filtered = raw.filter((s) => regimeAllows(regime, s.bias));

  // Dedupe + score
  const deduped = dedupe(filtered);
  const scored = deduped
    .map((s) => ({ raw: s, sc: score(s) }))
    .filter((x) => x.sc >= SCORE_THRESHOLD)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, regimeMaxSignals(regime));

  const signals: RankedSignal[] = scored.map(({ raw: s, sc }) => ({
    id: s.id,
    title: s.title,
    type: s.type,
    reason: s.reason,
    impact: s.impact >= 7 ? 'high' : s.impact >= 4 ? 'medium' : 'low',
    confidence: s.confidence,
    horizon: s.horizon,
    expectedEffect: s.expectedEffect,
    score: sc,
  }));

  return { regime, regimeReason, signals, threshold: SCORE_THRESHOLD };
}
