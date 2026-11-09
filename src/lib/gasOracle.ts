/**
 * gasOracle — live per-chain gas cost estimates in USD.
 *
 * Ethereum mainnet: eth_gasPrice × 21 000 (simple transfer) × ETH price.
 * L2s: Etherscan v2 gasoracle (fast tier) with an eth_gasPrice fallback.
 * Used for net-profit route scoring, Auto-Repay priority gas and the
 * refinancing alert. Failed chains simply drop out of the map.
 */
import { createPublicClient, http, fallback } from 'viem';
import { RPCS } from './multiProtocolBtc';

export type GasMap = Record<string, number>; // chain -> USD cost of a basic tx

const ETH_V2 = 'https://api.etherscan.io/v2/api';
const L2_CHAIN_IDS: Record<string, number> = { Arbitrum: 42161, Base: 8453, Optimism: 10, Gnosis: 100 };

async function rpcGasPriceWei(chain: string): Promise<bigint> {
  const r = RPCS[chain];
  if (!r) throw new Error(`unknown chain ${chain}`);
  const c = createPublicClient({ chain: r.chain, transport: fallback(r.urls.map(u => http(u))) });
  return c.getGasPrice();
}

async function l2GasPriceWei(chain: string): Promise<bigint> {
  try {
    const res = await fetch(`${ETH_V2}?chainid=${L2_CHAIN_IDS[chain]}&module=gastracker&action=gasoracle`);
    const j = await res.json();
    const gwei = Number(j?.result?.FastGasPrice);
    if (Number.isFinite(gwei) && gwei > 0) return BigInt(Math.round(gwei * 1e9));
  } catch { /* fall through to RPC */ }
  return rpcGasPriceWei(chain);
}

/** Live gas cost of one basic transaction per chain, in USD. */
export async function fetchGasMap(ethUsd: number): Promise<GasMap> {
  const out: GasMap = {};
  const jobs: [string, () => Promise<bigint>][] = [
    ['Ethereum', () => rpcGasPriceWei('Ethereum')],
    ...Object.keys(L2_CHAIN_IDS).map((c): [string, () => Promise<bigint>] => [c, () => l2GasPriceWei(c)]),
  ];
  const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !ethUsd) return;
    out[jobs[i][0]] = (Number(r.value) / 1e18) * 21_000 * ethUsd;
  });
  return out;
}

/** Gas with a premium multiplier (Auto-Repay uses 1.5× priority gas). */
export const priorityGasUsd = (gasUsd: number | undefined, multiplier = 1.5) =>
  gasUsd == null ? undefined : gasUsd * multiplier;

/**
 * Net-profit route scoring: 1-year expected yield (USD) minus gas cost.
 * The route with the highest net positive number wins — expensive L1 routes
 * lose on micro-transactions but can still win when gas is cheap.
 */
export function netProfitUsd(valueUsd: number, apyPct: number, gasUsd: number | undefined): number {
  return valueUsd * (apyPct / 100) - (gasUsd ?? 0);
}
