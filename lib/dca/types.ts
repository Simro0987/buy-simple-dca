export type DcaSymbol =
  | "BTC"
  | "ETH"
  | "SOL"
  | "LINK"
  | "AAVE"
  | "UNI"
  | "HYPE"
  | "ZEC"
  | "INJ";

export type DcaCategory = "CORE" | "SATELLITE" | "HIGH_BETA";
export type TokenSubTag = "YIELD" | "DEFI";
export type ExecutionStatus = "REDUCE" | "NORMAL" | "DEEP_BOOST";
export type BrakeBoostMode = "REDUCE" | "BOOST" | "DEEP_BOOST" | "NORMAL";
export type AllocationMode = "ALL" | "BTC_ONLY";
export type RegimeKind = "PANIC" | "BEAR" | "SIDEWAYS" | "BULL" | "EUPHORIA";
export type ConfidenceLevel = "Nízka" | "Stredná" | "Vysoká";
export type RegimeFactorId =
  | "valuation"
  | "trend"
  | "sentiment"
  | "momentum"
  | "risk";
export type FactorSource = "live" | "mock";
export type WaterfallMode = "none" | "partial" | "full";
export type LimitLeg = "lmt1" | "lmt2";

export interface DcaTokenMeta {
  symbol: DcaSymbol;
  name: string;
  binance: string;
  category: DcaCategory;
  subTags: TokenSubTag[];
}

export interface OhlcvCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenIndicators {
  sma200: number;
  ema200: number;
  ema50: number;
  rsi: number;
  atr: number;
  high14: number;
  low14: number;
  s1: number;
  r1: number;
  sma200DevPct: number;
  ema50DevPct: number;
}

export interface TokenYield {
  apy: number;
  project: string;
}

export interface TokenMarketSnapshot {
  symbol: DcaSymbol;
  price: number;
  change24h: number;
  volume24h: number;
  indicators: TokenIndicators | null;
  yieldApy: number | null;
  yieldProject: string | null;
  dailyCandles: OhlcvCandle[];
  weeklyCandles: OhlcvCandle[];
  upcomingUnlock: boolean;
}

export interface HighBetaCheckItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface HighBetaChecklist {
  step0: {
    passed: boolean;
    label: string;
    items: HighBetaCheckItem[];
  };
  step1: {
    passed: boolean;
    label: string;
    items: HighBetaCheckItem[];
  };
  step2: {
    passed: boolean;
    label: string;
    score: number;
    items: HighBetaCheckItem[];
  };
}

export interface HighBetaEvaluation {
  approved: boolean;
  reason: string;
  stepFailed: number | null;
  score: number;
  checklist: HighBetaChecklist;
}

export interface HighBetaTokenData {
  symbol: DcaSymbol | string;
  price: number;
  volume24h: number;
  dailyCandles: OhlcvCandle[];
  weeklyCandles: OhlcvCandle[];
  upcomingUnlock: boolean;
}

export interface HighBetaBtcData {
  price: number;
  dailyCandles: OhlcvCandle[];
  weeklyCandles: OhlcvCandle[];
}

export interface SatelliteTokenData {
  symbol: DcaSymbol | string;
  price: number;
  dailyCandles: OhlcvCandle[];
  weeklyCandles: OhlcvCandle[];
}

export interface SatelliteChecklist {
  step0: {
    passed: boolean;
    label: string;
    items: HighBetaCheckItem[];
  };
  step1: {
    passed: boolean;
    skipped: boolean;
    label: string;
    items: HighBetaCheckItem[];
  };
}

export interface SatelliteEvaluation {
  approved: boolean;
  reason: string;
  stepFailed: number | null;
  checklist: SatelliteChecklist;
}

export interface FactorBreakdown {
  id: RegimeFactorId;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  formula: string;
  note: string;
  source: FactorSource;
}

export interface RegimeBlendShare {
  kind: RegimeKind;
  label: string;
  percent: number;
}

export interface BasketMix {
  corePercent: number;
  satellitePercent: number;
  highBetaPercent: number;
}

export interface RegimeMetrics {
  fearGreed: number | null;
  fearGreedLabel: string | null;
  stablecoinMcapUsd: number | null;
  stablecoinChange30d: number | null;
  cbbi: number | null;
  cbbiMock: boolean;
  fetchedAt: string | null;
}

export interface MarketRegime {
  kind: RegimeKind;
  label: string;
  description: string;
  finalScore: number;
  allocationPercent: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  factors: FactorBreakdown[];
  blend: RegimeBlendShare[];
  basket: BasketMix;
  safeHaven: boolean;
}

export interface TokenExecutionPlan {
  symbol: DcaSymbol;
  name: string;
  category: DcaCategory;
  subTags: TokenSubTag[];
  weightPercent: number;
  totalUsd: number;
  marketUsd: number;
  originalMarketUsd: number;
  limitUsd: number;
  limit1Usd: number;
  limit2Usd: number;
  limit2Skipped: boolean;
  limit2SkipReason: string;
  lmt2Share: number;
  limit1AtrMult: number;
  limit2AtrMult: number;
  executionUsd: number;
  emaDistancePercent: number;
  brakeBoostMode: BrakeBoostMode;
  brakeBoostFactor: number;
  brakeBoostReserveDelta: number;
  brakeBoostBadge: string;
  brakeBoostMatrix: string;
  marketShare: number;
  limitShare: number;
  limitPrice: number;
  limit1Price: number;
  limit2Price: number;
  discountPct: number;
  limitFallbackActive: boolean;
  limit1FallbackActive: boolean;
  limit2FallbackActive: boolean;
  limitTargetLabel: string;
  limit1TargetLabel: string;
  limit2TargetLabel: string;
  limitBaseTarget: number;
  qty: number;
  marketQty: number;
  limitQty: number;
  limit1Qty: number;
  limit2Qty: number;
  score: number;
  status: ExecutionStatus;
  rsi: number;
  price: number;
  atr: number;
  ema50: number;
  sma200: number;
  ema200: number;
  sma200DevPct: number;
  ema50DevPct: number;
  s1: number;
  r1: number;
  atrBand: number;
  yieldApy: number | null;
  yieldProject: string | null;
  ilRr: string;
  bullMarket: boolean;
  stopped: boolean;
  highBeta: HighBetaEvaluation | null;
  highBetaRedirectedUsd: number;
  satellite: SatelliteEvaluation | null;
  satelliteRedirectedUsd: number;
  waterfallDestination: string;
}

export interface WeeklyDcaPlan {
  regime: MarketRegime;
  deployedUsd: number;
  reserveUsd: number;
  brakeBoostReserveDelta: number;
  weeklyAmount: number;
  coreUsd: number;
  altUsd: number;
  corePercent: number;
  altPercent: number;
  btcFloorSatisfied: boolean;
  stoppedSymbols: DcaSymbol[];
  highBetaRejectedSymbols: DcaSymbol[];
  highBetaRedirectedUsd: number;
  satellitePausedSymbols: DcaSymbol[];
  satelliteRedirectedUsd: number;
  targetCorePercent: number;
  targetSatellitePercent: number;
  targetHighBetaPercent: number;
  satelliteBasketUsd: number;
  highBetaBasketUsd: number;
  satelliteWaterfallMode: WaterfallMode;
  highBetaWaterfallMode: WaterfallMode;
  satelliteWaterfallNote: string;
  highBetaWaterfallNote: string;
  plans: TokenExecutionPlan[];
  narrative: string[];
  allocationLabel: string;
  allocationSubtitle: string;
}
