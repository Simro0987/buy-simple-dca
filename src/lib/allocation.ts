import { STAKING_CONFIG, AssetStakingConfig, StakingPosition } from './wallets';
import { PriceData, TOKENS } from './crypto';
import { Lang } from './i18n';
import { DefiApyData } from '@/hooks/useDefiApys';

export interface HoldingInput {
  btc: number;
  eth: number;
  sol: number;
  hype: number;
  stakedEth?: number;
  lentEth?: number;
  stakedSol?: number;
  lentSol?: number;
  stakedHype?: number;
}

export interface AllocationAction {
  type: 'hold' | 'stake' | 'lend' | 'skip';
  label: string;
  amount: number;
  symbol: string;
  protocol?: string;
  reason?: string;
  priority: number; // 1 = highest
}

export interface TokenAllocationResult {
  symbol: string;
  name: string;
  color: string;
  totalValueUsd: number;
  actions: AllocationAction[];
}

const MIN_ACTION_USD = 200;
const GAS_COSTS: Record<string, number> = {
  btc: 2,
  eth: 15,
  sol: 0.01,
  hype: 0.5,
};
const MAX_FEE_RATIO = 0.03; // skip if fees > 3% of action value

function getLabel(action: AllocationAction, lang: Lang): string {
  return action.label;
}

export function computeSmartAllocation(
  holdings: HoldingInput,
  prices: PriceData,
  lang: Lang,
  apys?: DefiApyData
): TokenAllocationResult[] {
  const amounts: Record<string, number> = {
    btc: holdings.btc,
    eth: holdings.eth,
    sol: holdings.sol,
    hype: holdings.hype,
  };

  const priceMap: Record<string, number> = {};
  for (const t of TOKENS) {
    priceMap[t.id] = prices[t.coingeckoId]?.usd ?? 0;
  }

  const results: TokenAllocationResult[] = [];

  // BTC — always hold
  const btcUsd = amounts.btc * priceMap.btc;
  results.push({
    symbol: 'BTC',
    name: 'Bitcoin',
    color: '#F7931A',
    totalValueUsd: btcUsd,
    actions: [{
      type: 'hold',
      label: lang === 'sk'
        ? 'Drž BTC na hardvérovej peňaženke (Trezor)'
        : 'Hold BTC on hardware wallet (Trezor)',
      amount: amounts.btc,
      symbol: 'BTC',
      priority: 1,
    }],
  });

  // ETH
  results.push(computeEthActions(amounts.eth, priceMap.eth, holdings, lang, apys));

  // SOL
  results.push(computeSolActions(amounts.sol, priceMap.sol, holdings, lang, apys));

  // HYPE
  results.push(computeHypeActions(amounts.hype, priceMap.hype, holdings, lang, apys));

  return results;
}

function computeEthActions(total: number, price: number, holdings: HoldingInput, lang: Lang): TokenAllocationResult {
  const totalUsd = total * price;
  const actions: AllocationAction[] = [];
  const sk = lang === 'sk';

  const alreadyStaked = holdings.stakedEth ?? 0;
  const alreadyLent = holdings.lentEth ?? 0;
  const available = Math.max(0, total - alreadyStaked - alreadyLent);

  // Target: 23% staking, 53% wstETH, 16% lending, 8% hold
  const targetStake = total * 0.23;
  const targetWsteth = total * 0.53;
  const targetLend = total * 0.16;

  const needStake = Math.max(0, targetStake - alreadyStaked);
  const needLend = Math.max(0, targetLend - alreadyLent);

  // Priority 1: Staking (Rocket Pool)
  if (needStake > 0) {
    const stakeUsd = needStake * price;
    if (stakeUsd >= MIN_ACTION_USD && GAS_COSTS.eth / stakeUsd <= MAX_FEE_RATIO) {
      actions.push({
        type: 'stake',
        label: sk
          ? `Stake ${needStake.toFixed(4)} ETH cez Rocket Pool (rETH)`
          : `Stake ${needStake.toFixed(4)} ETH via Rocket Pool (rETH)`,
        amount: needStake,
        symbol: 'ETH',
        protocol: 'Rocket Pool',
        priority: 1,
      });
    } else {
      actions.push({
        type: 'skip',
        label: sk
          ? `Rocket Pool staking sa neoplatí (${stakeUsd < MIN_ACTION_USD ? 'nízka suma' : 'vysoké poplatky'})`
          : `Rocket Pool staking not worth it (${stakeUsd < MIN_ACTION_USD ? 'low amount' : 'high fees'})`,
        amount: needStake,
        symbol: 'ETH',
        priority: 3,
      });
    }
  }

  // wstETH hold suggestion
  if (targetWsteth > 0) {
    const wstUsd = targetWsteth * price;
    if (wstUsd >= MIN_ACTION_USD) {
      actions.push({
        type: 'hold',
        label: sk
          ? `Drž ~${targetWsteth.toFixed(4)} ETH ako wstETH`
          : `Hold ~${targetWsteth.toFixed(4)} ETH as wstETH`,
        amount: targetWsteth,
        symbol: 'wstETH',
        priority: 2,
      });
    }
  }

  // Priority 2: Lending (Aave)
  if (needLend > 0) {
    const lendUsd = needLend * price;
    if (lendUsd >= MIN_ACTION_USD && GAS_COSTS.eth / lendUsd <= MAX_FEE_RATIO) {
      actions.push({
        type: 'lend',
        label: sk
          ? `Lend ${needLend.toFixed(4)} wstETH cez Aave V3`
          : `Lend ${needLend.toFixed(4)} wstETH via Aave V3`,
        amount: needLend,
        symbol: 'wstETH',
        protocol: 'Aave V3',
        priority: 2,
      });
    } else {
      actions.push({
        type: 'skip',
        label: sk
          ? `Aave lending sa neoplatí (${lendUsd < MIN_ACTION_USD ? 'nízka suma' : 'vysoké poplatky'})`
          : `Aave lending not worth it (${lendUsd < MIN_ACTION_USD ? 'low amount' : 'high fees'})`,
        amount: needLend,
        symbol: 'ETH',
        priority: 3,
      });
    }
  }

  // If no meaningful actions
  if (actions.length === 0 || actions.every(a => a.type === 'skip')) {
    actions.unshift({
      type: 'hold',
      label: sk ? 'Zvyšok nechaj bez zmeny' : 'Keep the rest unchanged',
      amount: available,
      symbol: 'ETH',
      priority: 3,
    });
  }

  return { symbol: 'ETH', name: 'Ethereum', color: '#627EEA', totalValueUsd: totalUsd, actions: actions.sort((a, b) => a.priority - b.priority).slice(0, 3) };
}

function computeSolActions(total: number, price: number, holdings: HoldingInput, lang: Lang): TokenAllocationResult {
  const totalUsd = total * price;
  const actions: AllocationAction[] = [];
  const sk = lang === 'sk';

  const alreadyStaked = holdings.stakedSol ?? 0;
  const alreadyLent = holdings.lentSol ?? 0;

  const targetStake = total * 0.44;
  const targetJitoHold = total * 0.27;
  const targetLend = total * 0.19;

  const needStake = Math.max(0, targetStake - alreadyStaked);
  const needLend = Math.max(0, targetLend - alreadyLent);

  // Priority 1: Jito staking
  if (needStake > 0) {
    const stakeUsd = needStake * price;
    if (stakeUsd >= MIN_ACTION_USD && GAS_COSTS.sol / stakeUsd <= MAX_FEE_RATIO) {
      actions.push({
        type: 'stake',
        label: sk
          ? `Stake ${needStake.toFixed(2)} SOL cez Jito`
          : `Stake ${needStake.toFixed(2)} SOL via Jito`,
        amount: needStake,
        symbol: 'SOL',
        protocol: 'Jito',
        priority: 1,
      });
    } else {
      actions.push({
        type: 'skip',
        label: sk
          ? `Jito staking sa neoplatí (${stakeUsd < MIN_ACTION_USD ? 'nízka suma' : 'vysoké poplatky'})`
          : `Jito staking not worth it (${stakeUsd < MIN_ACTION_USD ? 'low amount' : 'high fees'})`,
        amount: needStake,
        symbol: 'SOL',
        priority: 3,
      });
    }
  }

  // JitoSOL hold
  if (targetJitoHold > 0 && targetJitoHold * price >= MIN_ACTION_USD) {
    actions.push({
      type: 'hold',
      label: sk
        ? `Drž ~${targetJitoHold.toFixed(2)} SOL ako JitoSOL`
        : `Hold ~${targetJitoHold.toFixed(2)} SOL as JitoSOL`,
      amount: targetJitoHold,
      symbol: 'JitoSOL',
      priority: 2,
    });
  }

  // Priority 2: Kamino lending
  if (needLend > 0) {
    const lendUsd = needLend * price;
    if (lendUsd >= MIN_ACTION_USD && GAS_COSTS.sol / lendUsd <= MAX_FEE_RATIO) {
      actions.push({
        type: 'lend',
        label: sk
          ? `Lend ${needLend.toFixed(2)} JitoSOL cez Kamino`
          : `Lend ${needLend.toFixed(2)} JitoSOL via Kamino`,
        amount: needLend,
        symbol: 'JitoSOL',
        protocol: 'Kamino',
        priority: 2,
      });
    } else {
      actions.push({
        type: 'skip',
        label: sk
          ? `Kamino sa neoplatí (${lendUsd < MIN_ACTION_USD ? 'nízka suma' : 'vysoké poplatky'})`
          : `Kamino not worth it (${lendUsd < MIN_ACTION_USD ? 'low amount' : 'high fees'})`,
        amount: needLend,
        symbol: 'SOL',
        priority: 3,
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      type: 'hold',
      label: sk ? 'Nechaj bez zmeny' : 'Keep unchanged',
      amount: total,
      symbol: 'SOL',
      priority: 3,
    });
  }

  return { symbol: 'SOL', name: 'Solana', color: '#9945FF', totalValueUsd: totalUsd, actions: actions.sort((a, b) => a.priority - b.priority).slice(0, 3) };
}

function computeHypeActions(total: number, price: number, holdings: HoldingInput, lang: Lang): TokenAllocationResult {
  const totalUsd = total * price;
  const actions: AllocationAction[] = [];
  const sk = lang === 'sk';

  const alreadyStaked = holdings.stakedHype ?? 0;
  const targetStake = total * 0.80;
  const needStake = Math.max(0, targetStake - alreadyStaked);

  if (needStake > 0) {
    const stakeUsd = needStake * price;
    if (stakeUsd >= MIN_ACTION_USD) {
      actions.push({
        type: 'stake',
        label: sk
          ? `Stake ${needStake.toFixed(2)} HYPE`
          : `Stake ${needStake.toFixed(2)} HYPE`,
        amount: needStake,
        symbol: 'HYPE',
        protocol: 'Native',
        priority: 1,
      });
    } else {
      actions.push({
        type: 'skip',
        label: sk
          ? `HYPE staking sa neoplatí (nízka suma)`
          : `HYPE staking not worth it (low amount)`,
        amount: needStake,
        symbol: 'HYPE',
        priority: 3,
      });
    }
  }

  // Always hold 20%
  const holdAmount = total * 0.20;
  if (holdAmount > 0) {
    actions.push({
      type: 'hold',
      label: sk
        ? `Drž ${holdAmount.toFixed(2)} HYPE pre exit likviditu`
        : `Hold ${holdAmount.toFixed(2)} HYPE for exit liquidity`,
      amount: holdAmount,
      symbol: 'HYPE',
      priority: 2,
    });
  }

  if (actions.length === 0) {
    actions.push({
      type: 'hold',
      label: sk ? 'Nechaj bez zmeny' : 'Keep unchanged',
      amount: total,
      symbol: 'HYPE',
      priority: 3,
    });
  }

  return { symbol: 'HYPE', name: 'Hyperliquid', color: '#00D4AA', totalValueUsd: totalUsd, actions: actions.sort((a, b) => a.priority - b.priority).slice(0, 2) };
}
