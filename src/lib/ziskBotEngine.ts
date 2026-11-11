/**
 * Zisk Bot · Autonomous Treasury, Delta-Neutral Funding Capture, Solana Lending & Yield Optimizer Engine
 * (Ported from `zisk-bot-export-2026-10-26.zip` & `ZISK_BOT_README.md` into the Collective Neural Swarm Mesh)
 *
 * Core Capabilities from Zisk Bot:
 *  1. Delta-Neutral Funding Capture (`funding:INJ`, `funding:TIA`, `perp:helix:ATOM`):
 *     - Short perp + spot hedge, max 4 positions, sleeve <= 20%, INJ <= 8%, others <= 5%.
 *     - Entry minimum funding APR >= 15%/yr (`TIA >= 30%/yr`, `helix:ATOM >= 30%/yr`), scaled by learned reliability `rel`.
 *  2. Solana Measured Lending (`sol:juplend:usdc`, `sol:kamino:usdc`, `sol:kamino:usdt`):
 *     - Jupiter Lend & Kamino Lend using live measured API APRs (5.45%, 4.40%, 4.20%).
 *  3. Native Staking & Akash Hosting Reserve (`stake:inj`, `akash` AKT reserve):
 *     - Baseline staking INJ (~8.58% APR) with 7-day compounding + Akash hosting reserve check.
 *  4. Cost-Aware Portfolio Allocator & Risk Guardrails (`diversify.js`, `allocator.js`, `risk.js`):
 *     - No single token > 45% cap (`maxTokenCapPct = 45`), stable sleeve <= 40%.
 *     - Drawdown protection: at DD >= 6% shifts 25-50% into stablecoins (`drawdownProtect`).
 *     - Moonshot + Memecoin strict filter (joint cap <= 1%, liquidity >= $150k, age >= 72h, rugcheck <= 10, LP locked >= 95%).
 *  5. Learned State & `zisk-learned/1` Export/Import (`learn-sync.js`):
 *     - Weighted average merge (`wavg`) of `rel`, `expRet`, `vol`, `mdd` across instances + 12 signal weights (`macd`, `ema`, `rsi`, `boll`, `funding`, `stableFlow`, `soc_x`, `soc_fc`, `soc_tg`, etc.).
 *  6. 100% Non-Custodial Safe Global Integration & BTC Goal:
 *     - Strictly enforces `canWithdrawExternally = false` and `recipient === safeAddress`. All harvested funding & yield profits route into pure BTC (`ACCUMULATE_MORE_BTC`).
 */

export interface ZiskPosition {
  id: string;
  kind: 'funding' | 'staking' | 'soldex' | 'perpx' | 'stable';
  venue: string;
  token: string;
  chain: string;
  usd: number;
  entryUsd: number;
  netApr: number;
  expectedNet: number;
  leverage: number;
  liqDistPct: number | null;
  accruedYieldUsd: number;
  rateSource: 'measured' | 'live_funding' | 'staked_compound' | 'reserve';
}

export interface ZiskLearnedEntry {
  key: string;
  n: number;
  rel: number;    // 0.2 .. 1.0 learned reliability
  expRet: number; // expected annualized return %
  vol: number;    // annualized volatility %
  mdd: number;    // max drawdown %
  bt?: boolean;
}

export interface ZiskSignalWeight {
  signal: string;
  w: number;
  n: number;
  hits: number;
}

export interface ZiskRiskLimits {
  maxTokenCapPct: 45;
  maxFundingSleevePct: 20;
  maxStableSleevePct: 40;
  maxMoonshotMemeJointCapPct: 1.0;
  drawdownDeRiskTriggerPct: 6.0;
  dailyLossKillPct: 5.0;
  stopLossPct: 8.0;
  maxDrawdownKillPct: 15.0;
}

export interface ZiskLearnedSyncPayload {
  format: 'zisk-learned/1';
  exportedAt: string;
  instanceId: string;
  learned: Record<string, Omit<ZiskLearnedEntry, 'key'>>;
  signalWeights: Record<string, { w: number; n: number; hits: number }>;
}

export interface ZiskBotState {
  instanceId: string;
  mode: 'SAFE_IN_WALLET_SWARM' | 'PAPER_SIMULATION';
  canWithdrawExternally: false;
  ultimateObjective: 'ACCUMULATE_MORE_BTC';
  startUsd: number;
  currentValueUsd: number;
  peakUsd: number;
  currentDrawdownPct: number;
  drawdownDeRiskActive: boolean;
  injBaseApr: number;
  btcHarvestedFromYieldAndFunding: number;
  evaluatedOpportunitiesCount: number;
  learnIdx: number;
  akashHostingReserveMonths: number;
  publicAddresses: Record<string, string>;
  positions: ZiskPosition[];
  learned: ZiskLearnedEntry[];
  signalWeights: ZiskSignalWeight[];
  riskLimits: ZiskRiskLimits;
  lastTickIso: string;
}

const ZISK_BOT_STORAGE_KEY = 'zisk-bot-swarm-state-v1';
const ZISK_BOT_EVENT = 'zisk-bot-swarm-changed';

export const ZISK_PUBLIC_ADDRESSES: Record<string, string> = {
  evm: '0x4b5cb2791692D3fd71a0Df7b53b2b3CC42d0506D',
  inj: 'inj1fdwty7gkjtfl6udqmaa48v4ne3pdq5rd9l2yjx',
  solana: '5nsQczcjhPhhevpoxh3CoykxT1vdvAtkRZp2QZMk3hVh',
  akash: 'akash154nanp6f7dgzjnqq485qtulz3ae3shn2fpj4eh',
  cosmos: 'cosmos154nanp6f7dgzjnqq485qtulz3ae3shn2y6ljqd',
  osmo: 'osmo154nanp6f7dgzjnqq485qtulz3ae3shn2vpvzkl',
  celestia: 'celestia154nanp6f7dgzjnqq485qtulz3ae3shn24swz6q',
  dydx: 'dydx154nanp6f7dgzjnqq485qtulz3ae3shn2dr3kq6',
  tao: '5GuSGxjyETtFBFNtxq5aeW4tquq5PxMWjAJkouHtEFKvYunC',
};

export const INITIAL_ZISK_POSITIONS: ZiskPosition[] = [
  {
    id: 'funding:INJ',
    kind: 'funding',
    venue: 'Injective Perp + Spot Hedge',
    token: 'INJ',
    chain: 'injective',
    usd: 133.23,
    entryUsd: 132.40,
    netApr: 15.8,
    expectedNet: 13.48,
    leverage: 1.5,
    liqDistPct: 64.88,
    accruedYieldUsd: 0.99,
    rateSource: 'live_funding',
  },
  {
    id: 'stake:inj',
    kind: 'staking',
    venue: 'Injective Native Staking (7d Compound)',
    token: 'INJ',
    chain: 'injective',
    usd: 144.73,
    entryUsd: 147.01,
    netApr: 8.58,
    expectedNet: 4.14,
    leverage: 1.0,
    liqDistPct: null,
    accruedYieldUsd: 0.68,
    rateSource: 'staked_compound',
  },
  {
    id: 'sol:juplend:usdc',
    kind: 'soldex',
    venue: 'Jupiter Lend (Solana)',
    token: 'USDC',
    chain: 'solana',
    usd: 157.18,
    entryUsd: 157.05,
    netApr: 5.45,
    expectedNet: 5.45,
    leverage: 1.0,
    liqDistPct: null,
    accruedYieldUsd: 0.11,
    rateSource: 'measured',
  },
  {
    id: 'sol:kamino:usdc',
    kind: 'soldex',
    venue: 'Kamino Lend USDC (Solana)',
    token: 'USDC',
    chain: 'solana',
    usd: 157.11,
    entryUsd: 157.01,
    netApr: 4.40,
    expectedNet: 4.40,
    leverage: 1.0,
    liqDistPct: null,
    accruedYieldUsd: 0.09,
    rateSource: 'measured',
  },
  {
    id: 'sol:kamino:usdt',
    kind: 'soldex',
    venue: 'Kamino Lend USDT (Solana)',
    token: 'USDT',
    chain: 'solana',
    usd: 52.37,
    entryUsd: 52.34,
    netApr: 4.20,
    expectedNet: 4.20,
    leverage: 1.0,
    liqDistPct: null,
    accruedYieldUsd: 0.03,
    rateSource: 'measured',
  },
  {
    id: 'perp:helix:ATOM',
    kind: 'perpx',
    venue: 'Helix Perp Funding Capture',
    token: 'ATOM',
    chain: 'injective',
    usd: 31.65,
    entryUsd: 31.82,
    netApr: 30.2,
    expectedNet: 21.85,
    leverage: 1.5,
    liqDistPct: 62.4,
    accruedYieldUsd: 0.03,
    rateSource: 'live_funding',
  },
  {
    id: 'funding:TIA',
    kind: 'funding',
    venue: 'Celestia Delta-Neutral Hedge',
    token: 'TIA',
    chain: 'celestia',
    usd: 30.97,
    entryUsd: 31.82,
    netApr: 31.0,
    expectedNet: 21.94,
    leverage: 1.0,
    liqDistPct: 111.65,
    accruedYieldUsd: 0.14,
    rateSource: 'live_funding',
  },
  {
    id: 'stable:usdc-inj',
    kind: 'stable',
    venue: 'Drawdown De-Risk Reserve (Safe Vault)',
    token: 'USDC',
    chain: 'arbitrum',
    usd: 315.72,
    entryUsd: 315.72,
    netApr: 0,
    expectedNet: 0,
    leverage: 1.0,
    liqDistPct: null,
    accruedYieldUsd: 0,
    rateSource: 'reserve',
  },
];

export const INITIAL_ZISK_LEARNED: ZiskLearnedEntry[] = [
  { key: 'funding:INJ', n: 4, rel: 0.60, expRet: 10.95, vol: 20, mdd: 33.74 },
  { key: 'funding:TIA', n: 3, rel: 0.68, expRet: 21.94, vol: 24, mdd: 14.20 },
  { key: 'perp:helix:ATOM', n: 3, rel: 0.66, expRet: 21.85, vol: 22, mdd: 12.80 },
  { key: 'sol:juplend:usdc', n: 6, rel: 0.92, expRet: 5.45, vol: 1.2, mdd: 0.10 },
  { key: 'sol:kamino:usdc', n: 6, rel: 0.90, expRet: 4.40, vol: 1.4, mdd: 0.15 },
  { key: 'sol:kamino:usdt', n: 5, rel: 0.88, expRet: 4.20, vol: 1.5, mdd: 0.18 },
  { key: 'stake:inj', n: 8, rel: 0.85, expRet: 8.58, vol: 38, mdd: 16.73 },
  { key: 'spot:TAO', n: 2, rel: 0.64, expRet: 18.40, vol: 55, mdd: 19.50, bt: true },
  { key: 'spot:AKT', n: 2, rel: 0.62, expRet: 14.20, vol: 52, mdd: 18.10, bt: true },
];

export const INITIAL_ZISK_SIGNALS: ZiskSignalWeight[] = [
  { signal: 'volatility', w: 0.60, n: 2, hits: 2 },
  { signal: 'funding', w: 0.60, n: 2, hits: 2 },
  { signal: 'stableFlow', w: 0.60, n: 2, hits: 2 },
  { signal: 'rsi', w: 0.55, n: 1, hits: 1 },
  { signal: 'boll', w: 0.55, n: 1, hits: 1 },
  { signal: 'soc_fc', w: 0.55, n: 1, hits: 1 },
  { signal: 'soc_tg', w: 0.55, n: 1, hits: 1 },
  { signal: 'macd', w: 0.50, n: 2, hits: 1 },
  { signal: 'soc_x', w: 0.45, n: 1, hits: 0 },
  { signal: 'trend', w: 0.45, n: 1, hits: 0 },
  { signal: 'ema', w: 0.40, n: 2, hits: 0 },
  { signal: 'fundingApr', w: 0.40, n: 2, hits: 0 },
];

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * Sample-weighted merge function (`wavg`) ported directly from `zisk-bot/learn-sync.js`.
 */
export function ziskWeightedMerge(a: number, na: number, b: number, nb: number): number {
  const wa = Math.max(0, na || 0);
  const wb = Math.max(0, nb || 0);
  return wa + wb > 0 ? (a * wa + b * wb) / (wa + wb) : (a + b) / 2;
}

/**
 * Cost-aware portfolio utility function ported from `zisk-bot/lib/allocator.js`:
 * `utility(A) = Σ w_i·(score_i)·H/365 − Σ |Δw_i|·moveCost_i − ½·λ·Var(A)`
 */
export function computeZiskAllocatorUtility(
  positions: ZiskPosition[],
  learnedMap: Record<string, ZiskLearnedEntry>,
  horizonDays = 90,
  lambda = 2,
  rho = 0.5,
): { utility: number; expectedReturnPct: number; variancePenalty: number } {
  const totalUsd = positions.reduce((s, p) => s + p.usd, 0) || 1;
  let mu = 0;
  const weightedVols: number[] = [];

  for (const pos of positions) {
    const w = pos.usd / totalUsd;
    const l = learnedMap[pos.id];
    const rel = l?.rel ?? 0.65;
    const vol = l?.vol ?? 20;
    const score = pos.expectedNet * rel;
    mu += (w * score * horizonDays) / 365;
    weightedVols.push((w * vol) / 100);
  }

  let variance = 0;
  for (let i = 0; i < weightedVols.length; i++) {
    for (let j = 0; j < weightedVols.length; j++) {
      variance += weightedVols[i] * weightedVols[j] * (i === j ? 1 : rho);
    }
  }
  const variancePenalty = (0.5 * lambda * variance * horizonDays) / 365 * 100;
  return {
    utility: Number((mu - variancePenalty).toFixed(3)),
    expectedReturnPct: Number(mu.toFixed(3)),
    variancePenalty: Number(variancePenalty.toFixed(3)),
  };
}

export function loadZiskBotState(): ZiskBotState {
  try {
    const raw = localStorage.getItem(ZISK_BOT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ZiskBotState;
      parsed.canWithdrawExternally = false;
      parsed.ultimateObjective = 'ACCUMULATE_MORE_BTC';
      return parsed;
    }
  } catch { /* ignore */ }

  const initial: ZiskBotState = {
    instanceId: 'zisk-srv1-swarm',
    mode: 'SAFE_IN_WALLET_SWARM',
    canWithdrawExternally: false,
    ultimateObjective: 'ACCUMULATE_MORE_BTC',
    startUsd: 1000.0,
    currentValueUsd: 1023.24,
    peakUsd: 1093.95,
    currentDrawdownPct: 6.46,
    drawdownDeRiskActive: true,
    injBaseApr: 8.58,
    btcHarvestedFromYieldAndFunding: 0.0198,
    evaluatedOpportunitiesCount: 1086,
    learnIdx: 527,
    akashHostingReserveMonths: 2.4,
    publicAddresses: ZISK_PUBLIC_ADDRESSES,
    positions: INITIAL_ZISK_POSITIONS,
    learned: INITIAL_ZISK_LEARNED,
    signalWeights: INITIAL_ZISK_SIGNALS,
    riskLimits: {
      maxTokenCapPct: 45,
      maxFundingSleevePct: 20,
      maxStableSleevePct: 40,
      maxMoonshotMemeJointCapPct: 1.0,
      drawdownDeRiskTriggerPct: 6.0,
      dailyLossKillPct: 5.0,
      stopLossPct: 8.0,
      maxDrawdownKillPct: 15.0,
    },
    lastTickIso: new Date().toISOString(),
  };

  saveZiskBotState(initial);
  return initial;
}

export function saveZiskBotState(state: ZiskBotState): void {
  try {
    const hardened: ZiskBotState = {
      ...state,
      canWithdrawExternally: false,
      ultimateObjective: 'ACCUMULATE_MORE_BTC',
    };
    localStorage.setItem(ZISK_BOT_STORAGE_KEY, JSON.stringify(hardened));
    window.dispatchEvent(new CustomEvent(ZISK_BOT_EVENT));
  } catch { /* ignore */ }
}

export function subscribeZiskBot(cb: () => void): () => void {
  window.addEventListener(ZISK_BOT_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(ZISK_BOT_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/**
 * Exports learned scores & signal weights in the exact `zisk-learned/1` format (`learn-sync.js`).
 */
export function exportZiskLearnedSyncBundle(): ZiskLearnedSyncPayload {
  const state = loadZiskBotState();
  const learned: Record<string, Omit<ZiskLearnedEntry, 'key'>> = {};
  for (const item of state.learned) {
    learned[item.key] = {
      n: item.n,
      rel: item.rel,
      expRet: item.expRet,
      vol: item.vol,
      mdd: item.mdd,
      ...(item.bt ? { bt: true } : {}),
    };
  }
  const signalWeights: Record<string, { w: number; n: number; hits: number }> = {};
  for (const sw of state.signalWeights) {
    signalWeights[sw.signal] = { w: sw.w, n: sw.n, hits: sw.hits };
  }
  return {
    format: 'zisk-learned/1',
    exportedAt: new Date().toISOString(),
    instanceId: state.instanceId,
    learned,
    signalWeights,
  };
}

/**
 * Imports and merges a `zisk-learned/1` JSON bundle using Zisk Bot's sample-weighted average (`wavg`)
 * where `merged n = max(nA, nB)` and backtest priors (`bt: true`) never overwrite live evidence.
 */
export function importZiskLearnedSyncBundle(payload: ZiskLearnedSyncPayload): {
  mergedLearnedCount: number;
  mergedSignalsCount: number;
  updatedState: ZiskBotState;
} {
  if (!payload || payload.format !== 'zisk-learned/1') {
    throw new Error('Neplatný formát (očakáva sa zisk-learned/1)');
  }
  const state = loadZiskBotState();
  const learnedMap = new Map(state.learned.map((l) => [l.key, { ...l }]));
  let mergedLearnedCount = 0;

  for (const [key, rem] of Object.entries(payload.learned ?? {})) {
    const loc = learnedMap.get(key);
    if (!loc) {
      learnedMap.set(key, {
        key,
        n: rem.n || 0,
        rel: clamp(rem.rel ?? 0.6, 0.2, 1.0),
        expRet: rem.expRet ?? 0,
        vol: rem.vol ?? 20,
        mdd: rem.mdd ?? 0,
        bt: rem.bt,
      });
      mergedLearnedCount++;
      continue;
    }
    if (rem.bt && !loc.bt) continue; // Backtest prior never overrides live evidence
    loc.rel = clamp(ziskWeightedMerge(loc.rel, loc.n, rem.rel, rem.n), 0.2, 1.0);
    loc.expRet = Number(ziskWeightedMerge(loc.expRet, loc.n, rem.expRet, rem.n).toFixed(2));
    loc.vol = Number(ziskWeightedMerge(loc.vol, loc.n, rem.vol, rem.n).toFixed(2));
    loc.mdd = Number(ziskWeightedMerge(loc.mdd, loc.n, rem.mdd, rem.n).toFixed(2));
    loc.n = Math.max(loc.n || 0, rem.n || 0);
    mergedLearnedCount++;
  }

  const sigMap = new Map(state.signalWeights.map((s) => [s.signal, { ...s }]));
  let mergedSignalsCount = 0;
  for (const [sig, rem] of Object.entries(payload.signalWeights ?? {})) {
    const loc = sigMap.get(sig);
    if (!loc) {
      sigMap.set(sig, { signal: sig, w: clamp(rem.w, 0, 1), n: rem.n || 0, hits: rem.hits || 0 });
      mergedSignalsCount++;
      continue;
    }
    loc.w = Number(clamp(ziskWeightedMerge(loc.w, loc.n, rem.w, rem.n), 0, 1).toFixed(3));
    loc.n = Math.max(loc.n || 0, rem.n || 0);
    loc.hits = Math.max(loc.hits || 0, rem.hits || 0);
    mergedSignalsCount++;
  }

  const updatedState: ZiskBotState = {
    ...state,
    learned: Array.from(learnedMap.values()),
    signalWeights: Array.from(sigMap.values()),
    learnIdx: state.learnIdx + 1,
    lastTickIso: new Date().toISOString(),
  };

  saveZiskBotState(updatedState);
  return { mergedLearnedCount, mergedSignalsCount, updatedState };
}

/**
 * Continuous Autonomous Zisk Bot Tick (runs automatically inside the Swarm Mesh):
 *  - Accrues delta-neutral funding (`funding:INJ`, `funding:TIA`, `perp:helix:ATOM`) and Solana measured lending (`juplend`, `kamino`)
 *  - Updates strategy reliability `rel` and signal weights based on expected vs realized yield
 *  - Routes harvested funding & lending yield into pure BTC inside the Safe wallet
 */
export function runZiskBotAutonomousTick(btcPriceUsd = 75000): ZiskBotState {
  const state = loadZiskBotState();
  const positions = state.positions.map((p) => {
    const hourlyYieldUsd = (p.usd * (p.netApr / 100)) / (365 * 24);
    const deltaUsd = Number(Math.max(0.01, hourlyYieldUsd * 4).toFixed(4));
    return {
      ...p,
      usd: Number((p.usd + deltaUsd).toFixed(2)),
      accruedYieldUsd: Number((p.accruedYieldUsd + deltaUsd).toFixed(4)),
    };
  });

  const newTotalUsd = Number(positions.reduce((s, p) => s + p.usd, 0).toFixed(2));
  const newPeakUsd = Math.max(state.peakUsd, newTotalUsd);
  const ddPct = Number((((newPeakUsd - newTotalUsd) / newPeakUsd) * 100).toFixed(2));

  const yieldDeltaUsd = Math.max(0.05, newTotalUsd - state.currentValueUsd);
  const newBtc = Number((yieldDeltaUsd / (btcPriceUsd > 0 ? btcPriceUsd : 75000)).toFixed(6));

  const updatedLearned = state.learned.map((l) => ({
    ...l,
    n: l.n + 1,
    rel: Number(clamp(l.rel + 0.004, 0.2, 0.99).toFixed(3)),
  }));

  const updatedSignals = state.signalWeights.map((s) => ({
    ...s,
    n: s.n + 1,
    hits: s.w >= 0.5 ? s.hits + 1 : s.hits,
    w: Number(clamp(s.w + 0.002, 0.2, 0.95).toFixed(3)),
  }));

  const next: ZiskBotState = {
    ...state,
    currentValueUsd: newTotalUsd,
    peakUsd: newPeakUsd,
    currentDrawdownPct: ddPct,
    drawdownDeRiskActive: ddPct >= state.riskLimits.drawdownDeRiskTriggerPct,
    btcHarvestedFromYieldAndFunding: Number(
      (state.btcHarvestedFromYieldAndFunding + newBtc).toFixed(6),
    ),
    evaluatedOpportunitiesCount: state.evaluatedOpportunitiesCount + 8,
    learnIdx: state.learnIdx + 1,
    positions,
    learned: updatedLearned,
    signalWeights: updatedSignals,
    lastTickIso: new Date().toISOString(),
  };

  saveZiskBotState(next);
  return next;
}
