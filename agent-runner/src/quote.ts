import type { FeedPrice, TokenConfig } from './chain';

const BPS = 10_000n;

/** Chainlink answer -> 18-decimal USD price (mirrors AgentSwapModule._price). */
export function price18(f: FeedPrice): bigint {
  if (f.answer <= 0n || f.decimals > 18) throw new Error('invalid oracle answer');
  return f.answer * 10n ** BigInt(18 - f.decimals);
}

export function isStale(f: FeedPrice, nowSec: bigint, maxAge: bigint): boolean {
  return f.updatedAt === 0n || f.updatedAt > nowSec || nowSec - f.updatedAt > maxAge;
}

/** USD (18 dec) value of `amount` raw units of a token. Same math as the contract. */
export function usdValue(amount: bigint, tokenDecimals: number, p18: bigint): bigint {
  return (amount * p18) / 10n ** BigInt(tokenDecimals);
}

/** Raw token amount worth `usd18` USD. */
export function amountForUsd(usd18: bigint, tokenDecimals: number, p18: bigint): bigint {
  return (usd18 * 10n ** BigInt(tokenDecimals)) / p18;
}

/**
 * amountOutMinimum the runner sends. Uses the SMALLER of the agent's and the module's slippage,
 * so it always satisfies the module's on-chain requiredMin (`expectedOut * (1 - moduleBps)`).
 */
export function minAmountOut(
  amountIn: bigint,
  cin: TokenConfig,
  cout: TokenConfig,
  pIn18: bigint,
  pOut18: bigint,
  agentBps: number,
  moduleBps: bigint,
): bigint {
  const bps = BigInt(Math.min(agentBps, Number(moduleBps)));
  const usd = usdValue(amountIn, cin.tokenDecimals, pIn18);
  const expectedOut = (usd * 10n ** BigInt(cout.tokenDecimals)) / pOut18;
  return (expectedOut * (BPS - bps)) / BPS;
}

export const usd18 = (usd: number): bigint => BigInt(Math.round(usd * 100)) * 10n ** 16n;
export const fromUsd18 = (v: bigint): number => Number(v / 10n ** 14n) / 10_000;
