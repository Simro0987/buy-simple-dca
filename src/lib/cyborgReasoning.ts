import type { Lang } from '@/lib/i18n';
import type { MarketMode } from '@/lib/coreSatelliteEngine';

function safeNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Coarse action families used by LogicPanel / getDynamicReason. */
export type CyborgActionType =
  | 'STAKE'
  | 'DCA'
  | 'COLLATERAL'
  | 'SWAP'
  | 'TAKE_PROFIT'
  | 'YIELD'
  | 'REBALANCE';

/** Granular action keys passed from execution components. */
export type CyborgReasonAction =
  | 'stake_eth'
  | 'stake_sol'
  | 'stake_btc'
  | 'stake_split'
  | 'dca_buy'
  | 'dca_buy_btc'
  | 'dca_buy_eth'
  | 'dca_buy_sol'
  | 'dca_limit'
  | 'collateral'
  | 'collateral_deposit'
  | 'collateral_borrow'
  | 'swap'
  | 'take_profit'
  | 'dca_sell'
  | 'yield_auto_stake'
  | 'yield_stable_swap'
  | 'yield_hold_cash'
  | 'rebalance';

export interface ReasoningContext {
  marketScore: number;
  fearGreed: number;
  regime: string;
  marketMode: MarketMode | 'UNKNOWN';
  stakedRatio: number;
  totalBalanceUsd: number;
  weightedApyPct: number;
}

export type MarketTrend = 'bear' | 'bull' | 'neutral';

export interface DynamicReasonOptions {
  lang?: Lang;
  symbol?: string;
  coin?: string;
  fearGreed?: number;
  marketMode?: MarketMode | 'UNKNOWN';
  weightedApyPct?: number;
  stakedRatio?: number;
}

export function marketTrendFromScore(score: number): MarketTrend {
  const s = safeNum(score);
  if (s <= 40) return 'bear';
  if (s >= 65) return 'bull';
  return 'neutral';
}

function trendTag(trend: MarketTrend): string {
  if (trend === 'bear') return 'BEAR';
  if (trend === 'bull') return 'BULL';
  return 'NEUTRAL';
}

export function resolveActionType(action: CyborgReasonAction): CyborgActionType {
  switch (action) {
    case 'stake_eth':
    case 'stake_sol':
    case 'stake_btc':
    case 'stake_split':
      return 'STAKE';
    case 'dca_buy':
    case 'dca_buy_btc':
    case 'dca_buy_eth':
    case 'dca_buy_sol':
    case 'dca_limit':
    case 'dca_sell':
      return 'DCA';
    case 'collateral':
    case 'collateral_deposit':
    case 'collateral_borrow':
      return 'COLLATERAL';
    case 'swap':
      return 'SWAP';
    case 'take_profit':
      return 'TAKE_PROFIT';
    case 'yield_auto_stake':
    case 'yield_stable_swap':
    case 'yield_hold_cash':
      return 'YIELD';
    case 'rebalance':
      return 'REBALANCE';
    default:
      return 'STAKE';
  }
}

export function resolveActionSymbol(action: CyborgReasonAction): string | undefined {
  switch (action) {
    case 'stake_eth':
      return 'ETH';
    case 'stake_sol':
      return 'SOL';
    case 'stake_btc':
      return 'BTC';
    case 'dca_buy_btc':
      return 'BTC';
    case 'dca_buy_eth':
      return 'ETH';
    case 'dca_buy_sol':
      return 'SOL';
    default:
      return undefined;
  }
}

function coinSuffix(coin: string | undefined, sk: boolean): string {
  if (!coin) return '';
  return sk ? ` ${coin}` : ` ${coin}`;
}

/**
 * Returns a unique, score-aware reason string for the given action family.
 * No static copy — every branch embeds live marketScore and trend context.
 */
export function getDynamicReason(
  actionType: CyborgActionType,
  marketScore: number,
  opts: DynamicReasonOptions = {},
): string {
  const sk = (opts.lang ?? 'sk') === 'sk';
  const score = Math.round(safeNum(marketScore));
  const fg = Math.round(safeNum(opts.fearGreed ?? 50));
  const trend = marketTrendFromScore(score);
  const tag = trendTag(trend);
  const sym = opts.symbol ?? 'ETH';
  const coin = opts.coin ?? opts.symbol;
  const apy = safeNum(opts.weightedApyPct).toFixed(1);
  const stakedPct = Math.round(safeNum(opts.stakedRatio) * 100);
  const mode = opts.marketMode ?? 'UNKNOWN';

  switch (actionType) {
    case 'STAKE':
      if (trend === 'bear') {
        return sk
          ? `Staking ${sym} pri skóre ${score}/100: generovanie výnosu v aktuálnom ${tag} trende.`
          : `Staking ${sym} at score ${score}/100: generating yield in the current ${tag} trend.`;
      }
      if (trend === 'bull') {
        return sk
          ? `Staking ${sym} pri skóre ${score}/100: fixácia ziskov v ${tag} trende (portfólio ~${apy}% APY, ${stakedPct}% staked).`
          : `Staking ${sym} at score ${score}/100: locking gains in ${tag} trend (portfolio ~${apy}% APY, ${stakedPct}% staked).`;
      }
      return sk
        ? `Staking ${sym} pri skóre ${score}/100: vyváženie výnosu a volatility v ${tag} pásme (režim ${mode}).`
        : `Staking ${sym} at score ${score}/100: balancing yield and volatility in ${tag} band (mode ${mode}).`;

    case 'DCA':
      if (actionType === 'DCA' && score < 30) {
        return sk
          ? `DCA akumulácia${coinSuffix(coin, sk)}: Skóre ${score} je v zóne lacného nákupu (pod 30).`
          : `DCA accumulation${coinSuffix(coin, sk)}: Score ${score} is in the cheap-buy zone (below 30).`;
      }
      if (score >= 75) {
        return sk
          ? `DCA redukcia${coinSuffix(coin, sk)}: Skóre ${score}/100 signalizuje prehriaty trh — alokácia je utlmená.`
          : `DCA reduction${coinSuffix(coin, sk)}: Score ${score}/100 signals overheated market — allocation is dampened.`;
      }
      if (score >= 50) {
        return sk
          ? `DCA disciplína${coinSuffix(coin, sk)}: Skóre ${score}/100 v neutrálnom pásme — postupná akumulácia bez spěchu.`
          : `DCA discipline${coinSuffix(coin, sk)}: Score ${score}/100 in neutral band — gradual accumulation without rush.`;
      }
      return sk
        ? `DCA akumulácia${coinSuffix(coin, sk)}: Skóre ${score}/100 pod priemerom — výhodné pásmo pre týždenný nákup.`
        : `DCA accumulation${coinSuffix(coin, sk)}: Score ${score}/100 below average — favorable band for weekly buying.`;

    case 'COLLATERAL':
      if (trend === 'bear') {
        return sk
          ? `Optimalizácia kolaterálu pri skóre ${score}/100: zabezpečenie likvidity pre riadenie dlhu v ${tag} trende (F&G ${fg}).`
          : `Collateral optimization at score ${score}/100: securing liquidity for debt management in ${tag} trend (F&G ${fg}).`;
      }
      if (trend === 'bull') {
        return sk
          ? `Optimalizácia kolaterálu: Skóre ${score}/100 v ${tag} trende — LTV buffer pred expanziou borrow.`
          : `Collateral optimization: Score ${score}/100 in ${tag} trend — LTV buffer before borrow expansion.`;
      }
      return sk
        ? `Optimalizácia kolaterálu: Zabezpečenie likvidity pre riadenie dlhu pri skóre ${score}/100.`
        : `Collateral optimization: Securing liquidity for debt management at score ${score}/100.`;

    case 'SWAP':
      return sk
        ? `Swap pri skóre ${score}/100 (${tag}): rebalans tokenov bez trhového prehnania.`
        : `Swap at score ${score}/100 (${tag}): rebalancing tokens without market overexposure.`;

    case 'TAKE_PROFIT':
      return sk
        ? `Take profit pri skóre ${score}/100: realizácia zisku do USDC pred ${tag} reverziou.`
        : `Take profit at score ${score}/100: realizing gains into USDC before ${tag} reversal.`;

    case 'YIELD':
      if (score <= 35) {
        return sk
          ? `Yield deploy pri skóre ${score}/100: maximalizácia pasívneho príjmu v ${tag} akumulačnom pásme.`
          : `Yield deploy at score ${score}/100: maximizing passive income in ${tag} accumulation band.`;
      }
      return sk
        ? `Yield deploy pri skóre ${score}/100: USDC → vyšší APY pri zachovaní ${stakedPct}% staked podielu.`
        : `Yield deploy at score ${score}/100: USDC → higher APY while keeping ${stakedPct}% staked ratio.`;

    case 'REBALANCE':
      return sk
        ? `Rebalans pri skóre ${score}/100: návrat k cieľovej alokácii v ${tag} režime ${mode}.`
        : `Rebalance at score ${score}/100: returning to target allocation in ${tag} mode ${mode}.`;

    default:
      return sk
        ? `Cyborg optimalizuje túto pozíciu pre maximálnu efektivitu portfólia (skóre ${score}/100, ${tag}).`
        : `Cyborg optimizes this position for maximum portfolio efficiency (score ${score}/100, ${tag}).`;
  }
}

/** Resolves granular action + live context into a dynamic reason string. */
export function buildCyborgReason(
  action: CyborgReasonAction,
  ctx: ReasoningContext,
  lang: Lang = 'sk',
): string {
  const actionType = resolveActionType(action);
  const symbol = resolveActionSymbol(action);
  return getDynamicReason(actionType, ctx.marketScore, {
    lang,
    symbol,
    coin: symbol,
    fearGreed: ctx.fearGreed,
    marketMode: ctx.marketMode,
    weightedApyPct: ctx.weightedApyPct,
    stakedRatio: ctx.stakedRatio,
  });
}
