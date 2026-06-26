import { computeGasBuffer } from '@/lib/hcdActionPlanLogic';

/** Rough native ETH needed per on-chain step on Arbitrum (batch guard). */
export const BATCH_GAS_ETH_PER_TX = 0.002;

export type AtomicActionId = 'deposit' | 'borrow' | 'reserve' | 'yield' | 'growth';

export function atomicActionKey(planKey: string, actionId: AtomicActionId): string {
  return `${planKey}-${actionId}`;
}

export function hasEnoughGasForBatch(availableEthQty: number, txCount: number): boolean {
  const available = Math.max(0, availableEthQty ?? 0);
  const count = Math.max(0, txCount ?? 0);
  if (count <= 0) return true;
  return available >= BATCH_GAS_ETH_PER_TX * count;
}

export function countActiveBatchTransactions(input: {
  depositQty: number;
  borrowUsd: number;
  reserveUsd: number;
  yieldUsd: number;
  growthUsd: number;
}): number {
  let count = 0;
  if ((input.depositQty ?? 0) > 0) count += 1;
  if ((input.borrowUsd ?? 0) > 0) count += 1;
  if ((input.reserveUsd ?? 0) > 0) count += 1;
  if ((input.yieldUsd ?? 0) > 0) count += 1;
  if ((input.growthUsd ?? 0) > 0) count += 1;
  return count;
}

export function resolveGasAvailableEth(totalEthQty: number | null | undefined): number {
  return computeGasBuffer('ETH', totalEthQty).availableQty;
}

export function formatAtomicCopyText(
  tokenAmount: number,
  tokenSymbol: string,
  usdAmount: number,
  decimals: number,
): string {
  const qty = Number.isFinite(tokenAmount) ? tokenAmount.toFixed(decimals) : '0';
  const usd = Number.isFinite(usdAmount) ? usdAmount.toFixed(2) : '0.00';
  return `${qty} ${tokenSymbol} ($${usd})`;
}
