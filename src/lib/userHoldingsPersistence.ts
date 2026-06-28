import { useCyborgEngine } from '@/stores/cyborgEngine';
import {
  dispatchHoldingsUpdated,
  holdingsRecordFromUserHoldings,
  loadUserHoldings,
  saveUserHoldings,
  type UserHoldings,
} from '@/lib/portfolioRealHoldings';
import type { CoinKey, HoldingsState, HoldingsUpdateResult } from '@/lib/manualHoldingsAccumulator';
import { coinKeyToSymbol } from '@/lib/portfolioRealHoldings';

export function userHoldingsAsState(holdings: UserHoldings): HoldingsState {
  return {
    manual_holdings: {
      btc: holdings.BTC.tokenAmount,
      eth: holdings.ETH.tokenAmount,
      sol: holdings.SOL.tokenAmount,
    },
    initial_cost_basis: {
      btc: holdings.BTC.investedUsd,
      eth: holdings.ETH.investedUsd,
      sol: holdings.SOL.investedUsd,
    },
  };
}

export function applyHoldingsUpdateResult(
  holdings: UserHoldings,
  key: CoinKey,
  result: HoldingsUpdateResult,
): UserHoldings {
  const symbol = coinKeyToSymbol(key);
  return {
    ...holdings,
    [symbol]: {
      tokenAmount: result.manual_holdings[key],
      averageBuyPrice: result.newAvg,
      investedUsd: result.initial_cost_basis[key],
    },
  };
}

export function syncUserHoldingsToEngine(holdings?: UserHoldings): void {
  const record = holdingsRecordFromUserHoldings(holdings ?? loadUserHoldings());
  useCyborgEngine.getState().syncFromSources({ holdings: record });
  dispatchHoldingsUpdated();
}

export function persistHoldingsUpdate(
  key: CoinKey,
  result: HoldingsUpdateResult,
): UserHoldings {
  const next = applyHoldingsUpdateResult(loadUserHoldings(), key, result);
  saveUserHoldings(next);
  syncUserHoldingsToEngine(next);
  return next;
}

export function persistUserHoldings(holdings: UserHoldings): void {
  saveUserHoldings(holdings);
  syncUserHoldingsToEngine(holdings);
}
