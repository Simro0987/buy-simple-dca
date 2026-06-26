import type { Lang } from '@/lib/i18n';
import type { MarketMode } from '@/lib/coreSatelliteEngine';
import type { CyborgMarketData } from '@/lib/cyborgMarketDataFeed';

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
  coin?: string;
  fearGreed?: number;
  marketMode?: MarketMode | 'UNKNOWN';
  weightedApyPct?: number;
  stakedRatio?: number;
  marketData?: CyborgMarketData | null;
}

export function normalizeTokenSymbol(value: string | undefined | null): string {
  const sym = String(value ?? '').trim().toUpperCase();
  if (sym === 'BTC' || sym === 'ETH' || sym === 'SOL') return sym;
  if (/^W?ETH|RETH|STETH/i.test(sym)) return 'ETH';
  if (/^MSOL|SOL/i.test(sym)) return 'SOL';
  if (/^LBTC|BTC/i.test(sym)) return 'BTC';
  return sym || 'ASSET';
}

export function resolveTokenPrice(tokenSymbol: string, marketData?: CyborgMarketData | null): number {
  const sym = normalizeTokenSymbol(tokenSymbol);
  const md = marketData ?? null;
  if (sym === 'BTC') return safeNum(md?.btcPrice);
  if (sym === 'SOL') return safeNum(md?.solPrice);
  if (sym === 'ETH') return safeNum(md?.ethPrice);
  return safeNum(md?.ethPrice) || safeNum(md?.solPrice) || safeNum(md?.btcPrice);
}

function formatUsdPrice(value: number): string {
  const n = safeNum(value);
  if (n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

function fearGreedMood(fg: number, sk: boolean): string {
  if (fg <= 25) return sk ? 'extrémny strach' : 'extreme fear';
  if (fg <= 45) return sk ? 'strach' : 'fear';
  if (fg <= 55) return sk ? 'neutrál' : 'neutral';
  if (fg <= 75) return sk ? 'chamtivosť' : 'greed';
  return sk ? 'extrémna chamtivosť' : 'extreme greed';
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
  tokenSymbol: string,
  opts: DynamicReasonOptions = {},
): string {
  const sk = (opts.lang ?? 'sk') === 'sk';
  const score = Math.round(safeNum(marketScore));
  const fg = Math.round(safeNum(opts.fearGreed ?? 50));
  const trend = marketTrendFromScore(score);
  const tag = trendTag(trend);
  const sym = normalizeTokenSymbol(tokenSymbol);
  const coin = normalizeTokenSymbol(opts.coin ?? tokenSymbol);
  const apy = safeNum(opts.weightedApyPct).toFixed(1);
  const stakedPct = Math.round(safeNum(opts.stakedRatio) * 100);
  const mode = opts.marketMode ?? 'UNKNOWN';
  const md = opts.marketData ?? null;
  const liveFg = Math.round(safeNum(md?.fearGreedIndex ?? fg));
  const liveApy = safeNum(md?.protocolAPY ?? Number(apy));
  const tokenPrice = resolveTokenPrice(sym, md);
  const apy12m = safeNum(md?.protocolAPY12mAvg) || 3.2;
  const apyAboveAvg = liveApy > apy12m;

  switch (actionType) {
    case 'STAKE':
      if (liveApy > 0 && tokenPrice > 0) {
        return sk
          ? `Staking ${sym}: Aktuálne APY ${liveApy.toFixed(1)}% ${apyAboveAvg ? 'je nad' : 'je pri'} 12-mesačným priemerom (${apy12m.toFixed(1)}%) pri cene ${sym} $${formatUsdPrice(tokenPrice)}.`
          : `Staking ${sym}: Current APY ${liveApy.toFixed(1)}% is ${apyAboveAvg ? 'above' : 'near'} the 12-month average (${apy12m.toFixed(1)}%) with ${sym} at $${formatUsdPrice(tokenPrice)}.`;
      }
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
      if (liveFg <= 45) {
        return sk
          ? `DCA Nákup ${sym}: Fear&Greed Index je ${liveFg} (${fearGreedMood(liveFg, sk)}), čo je historicky výhodná zóna na akumuláciu.`
          : `DCA Buy ${sym}: Fear & Greed Index is ${liveFg} (${fearGreedMood(liveFg, sk)}) — a historically favorable accumulation zone.`;
      }
      if (safeNum(md?.btcPrice) > 0 && coin === 'BTC') {
        return sk
          ? `DCA BTC: ${sym} $${formatUsdPrice(md!.btcPrice)} pri F&G ${liveFg} — skóre ${score}/100 podporuje týždennú akumuláciu.`
          : `DCA BTC: ${sym} $${formatUsdPrice(md!.btcPrice)} at F&G ${liveFg} — score ${score}/100 supports weekly accumulation.`;
      }
      if (tokenPrice > 0 && coin !== 'BTC') {
        return sk
          ? `DCA Nákup ${sym}: ${sym} $${formatUsdPrice(tokenPrice)} pri F&G ${liveFg} (${fearGreedMood(liveFg, sk)}) — výhodná akumulačná zóna.`
          : `DCA Buy ${sym}: ${sym} $${formatUsdPrice(tokenPrice)} at F&G ${liveFg} (${fearGreedMood(liveFg, sk)}) — favorable accumulation zone.`;
      }
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
      if (liveApy > 0 && tokenPrice > 0) {
        return sk
          ? `Optimalizácia kolaterálu: ${sym} $${formatUsdPrice(tokenPrice)}, borrow spread vs protokol APY ${liveApy.toFixed(1)}% pri F&G ${liveFg}.`
          : `Collateral optimization: ${sym} $${formatUsdPrice(tokenPrice)}, borrow spread vs protocol APY ${liveApy.toFixed(1)}% at F&G ${liveFg}.`;
      }
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
      if (liveApy > 0) {
        return sk
          ? `Yield deploy: Protokolové APY ${liveApy.toFixed(1)}% ${apyAboveAvg ? 'prekračuje' : 'kopíruje'} 12M priemer pri skóre ${score}/100.`
          : `Yield deploy: Protocol APY ${liveApy.toFixed(1)}% ${apyAboveAvg ? 'exceeds' : 'tracks'} 12M average at score ${score}/100.`;
      }
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
  marketData?: CyborgMarketData | null,
  tokenSymbol?: string,
): string {
  const actionType = resolveActionType(action);
  const symbol = normalizeTokenSymbol(tokenSymbol ?? resolveActionSymbol(action));
  return getDynamicReason(actionType, ctx.marketScore, symbol, {
    lang,
    coin: symbol,
    fearGreed: ctx.fearGreed,
    marketMode: ctx.marketMode,
    weightedApyPct: ctx.weightedApyPct,
    stakedRatio: ctx.stakedRatio,
    marketData,
  });
}
