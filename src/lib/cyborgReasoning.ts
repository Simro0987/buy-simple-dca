import type { Lang } from '@/lib/i18n';
import type { MarketMode } from '@/lib/coreSatelliteEngine';

function safeNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

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

export function marketTrendFromScore(score: number): MarketTrend {
  const s = safeNum(score);
  if (s <= 40) return 'bear';
  if (s >= 65) return 'bull';
  return 'neutral';
}

function trendLabel(trend: MarketTrend, sk: boolean): string {
  if (trend === 'bear') return sk ? 'Medvedí trend' : 'Bear trend';
  if (trend === 'bull') return sk ? 'Býčí trend' : 'Bull trend';
  return sk ? 'Neutrálny trh' : 'Neutral market';
}

function modeHint(mode: MarketMode | 'UNKNOWN', sk: boolean): string {
  switch (mode) {
    case 'ACCUMULATION':
      return sk ? 'režim akumulácie' : 'accumulation mode';
    case 'CAUTIOUS_ACCUMULATION':
      return sk ? 'opatrná akumulácia' : 'cautious accumulation';
    case 'BALANCED':
      return sk ? 'vyvážený režim' : 'balanced mode';
    case 'DISTRIBUTION':
      return sk ? 'distribučný režim' : 'distribution mode';
    case 'DEFENSIVE':
      return sk ? 'defenzívny režim' : 'defensive mode';
    default:
      return sk ? 'neznámy režim' : 'unknown mode';
  }
}

function dcaActionKey(action: CyborgReasonAction): 'btc' | 'eth' | 'sol' | null {
  if (action === 'dca_buy_btc') return 'btc';
  if (action === 'dca_buy_eth') return 'eth';
  if (action === 'dca_buy_sol') return 'sol';
  return null;
}

export function buildCyborgReason(
  action: CyborgReasonAction,
  ctx: ReasoningContext,
  lang: Lang = 'sk',
): string {
  const sk = lang === 'sk';
  const score = Math.round(safeNum(ctx.marketScore));
  const fg = Math.round(safeNum(ctx.fearGreed));
  const trend = marketTrendFromScore(score);
  const trendText = trendLabel(trend, sk);
  const modeText = modeHint(ctx.marketMode ?? 'UNKNOWN', sk);
  const stakedPct = Math.round(safeNum(ctx.stakedRatio) * 100);
  const apy = safeNum(ctx.weightedApyPct).toFixed(1);
  const prefix = sk ? 'Prečo:' : 'Why:';

  switch (action) {
    case 'stake_eth':
      if (trend === 'bear') {
        return `${prefix} ${trendText} (${score}/100) – staking ETH generuje pasívny príjem (~${apy}% APY) a znižuje volatilitu portfólia.`;
      }
      if (trend === 'bull') {
        return `${prefix} ${trendText} (${score}/100) – časť ETH do stakingu chráni zisky a udržiava ${stakedPct}% staked podiel.`;
      }
      return `${prefix} ${trendText} (${score}/100) – staking ETH vyrovnáva riziko pri ${modeText} a posilňuje výnos portfólia.`;

    case 'stake_sol':
      if (trend === 'bear') {
        return `${prefix} ${trendText} (${score}/100) – SOL staking prináša yield pri nízkom sentimente (F&G ${fg}).`;
      }
      return `${prefix} ${trendText} (${score}/100) – Marinade/Kamino yield dopĺňa satelitnú alokáciu pri ${modeText}.`;

    case 'stake_btc':
      return `${prefix} ${trendText} (${score}/100) – BTC core pozícia cez LBTC/rETH znižuje drawdown pri ${modeText}.`;

    case 'stake_split':
      return `${prefix} ${trendText} (${score}/100) – dynamický split rozkladá riziko medzi protokoly podľa aktuálneho skóre.`;

    case 'dca_buy':
    case 'dca_buy_btc':
    case 'dca_buy_eth':
    case 'dca_buy_sol': {
      const coin = dcaActionKey(action);
      const coinLabel = coin ? coin.toUpperCase() : 'BTC/ETH/SOL';
      if (score <= 35) {
        return sk
          ? `${prefix} Aktuálne skóre ${score}/100 naznačuje prepredaný trh, ideálny čas na akumuláciu ${coinLabel}.`
          : `${prefix} Current score ${score}/100 suggests an oversold market — ideal time to accumulate ${coinLabel}.`;
      }
      if (score >= 70) {
        return sk
          ? `${prefix} Skóre ${score}/100 signalizuje drahší trh — DCA ${coinLabel} je znížené podľa ${modeText}.`
          : `${prefix} Score ${score}/100 signals an expensive market — DCA ${coinLabel} is reduced per ${modeText}.`;
      }
      return sk
        ? `${prefix} Skóre ${score}/100 a ${modeText} podporujú disciplinovanú akumuláciu ${coinLabel}.`
        : `${prefix} Score ${score}/100 and ${modeText} support disciplined ${coinLabel} accumulation.`;
    }

    case 'dca_limit':
      return sk
        ? `${prefix} Limit objednávka pri skóre ${score}/100 využíva discount pásmo bez trhového spěchu.`
        : `${prefix} Limit order at score ${score}/100 uses the discount band without market urgency.`;

    case 'collateral':
    case 'collateral_deposit':
      return sk
        ? `${prefix} Zabezpečenie likvidity na Arbitrum s nízkym rizikom pri aktuálnom sentimente (F&G ${fg}, ${score}/100).`
        : `${prefix} Securing liquidity on Arbitrum with low risk at current sentiment (F&G ${fg}, ${score}/100).`;

    case 'collateral_borrow':
      return sk
        ? `${prefix} Borrow USDC pri LTV limite a ${trendText.toLowerCase()} (${score}/100) — len ak yield > borrow cost.`
        : `${prefix} Borrow USDC at LTV cap and ${trendText.toLowerCase()} (${score}/100) — only if yield > borrow cost.`;

    case 'swap':
      return sk
        ? `${prefix} Swap optimalizuje alokáciu pri skóre ${score}/100 bez zbytočného trhového rizika.`
        : `${prefix} Swap optimizes allocation at score ${score}/100 without unnecessary market risk.`;

    case 'take_profit':
      return sk
        ? `${prefix} Take profit pri ${trendText.toLowerCase()} (${score}/100) — realizácia zisku do USDC pred ďalšou volatilitou.`
        : `${prefix} Take profit in ${trendText.toLowerCase()} (${score}/100) — realize gains into USDC before further volatility.`;

    case 'dca_sell':
      return sk
        ? `${prefix} Odpredaj pri skóre ${score}/100 presúva kapitál do Profit Reservoir pred prehriatím trhu.`
        : `${prefix} Sell at score ${score}/100 moves capital to Profit Reservoir before market overheating.`;

    case 'yield_auto_stake':
      return sk
        ? `${prefix} Auto-staking USDC yield pri ${modeText} maximalizuje pasívny príjem bez manuálnej exekúcie.`
        : `${prefix} Auto-staking USDC yield in ${modeText} maximizes passive income without manual execution.`;

    case 'yield_stable_swap':
      return sk
        ? `${prefix} Stable swap do vyššieho APY pri skóre ${score}/100 — nízke riziko, stabilný carry.`
        : `${prefix} Stable swap to higher APY at score ${score}/100 — low risk, stable carry.`;

    case 'yield_hold_cash':
      return sk
        ? `${prefix} Držanie hotovosti pri ${trendText.toLowerCase()} (${score}/100) chráni kapitál pred negatívnym carry.`
        : `${prefix} Holding cash in ${trendText.toLowerCase()} (${score}/100) protects capital from negative carry.`;

    case 'rebalance':
      return sk
        ? `${prefix} Rebalans pri skóre ${score}/100 udržiava cieľovú alokáciu a ${stakedPct}% staked pomer.`
        : `${prefix} Rebalance at score ${score}/100 maintains target allocation and ${stakedPct}% staked ratio.`;

    default:
      return sk
        ? `${prefix} Cyborg engine odporúča akciu podľa skóre ${score}/100 a ${modeText}.`
        : `${prefix} Cyborg engine recommends this action based on score ${score}/100 and ${modeText}.`;
  }
}
