// On-chain data layer for Ethereum DeFi Mozog.
// Uses viem + public RPC (Cloudflare). All calls guarded by 3s timeout.

import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';

export const ETH_ADDRESSES = {
  ETH_SENTINEL: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const,
  WETH:  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const,
  stETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as const,
  wstETH:'0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0' as const,
  rETH:  '0xae78736Cd615f374D3085123A210448E74Fc6393' as const,
};

const RPCS = [
  'https://cloudflare-eth.com',
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
];

let clientIdx = 0;
export function ethClient() {
  return createPublicClient({ chain: mainnet, transport: http(RPCS[clientIdx % RPCS.length]) });
}
function rotateClient() { clientIdx = (clientIdx + 1) % RPCS.length; }

const WSTETH_ABI = parseAbi([
  'function getStETHByWstETH(uint256) view returns (uint256)',
]);
const RETH_ABI = parseAbi([
  'function getExchangeRate() view returns (uint256)',
]);

async function withTimeout<T>(p: Promise<T>, ms = 3000): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

export interface EthOnChainRates {
  wstEthPerEth: number;   // 1 ETH → wstETH (staking amount)
  stEthPerEth:  number;   // 1:1 by protocol design
  rEthPerEth:   number;   // 1 ETH → rETH
  updatedAt: number;
  source: 'onchain' | 'fallback';
}

const RATES_FALLBACK: EthOnChainRates = {
  wstEthPerEth: 0.855,
  stEthPerEth: 1.0,
  rEthPerEth: 0.905,
  updatedAt: 0,
  source: 'fallback',
};

export async function fetchOnChainRates(): Promise<EthOnChainRates> {
  for (let i = 0; i < RPCS.length; i++) {
    try {
      const c = ethClient();
      const one = 10n ** 18n;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [stPerWst, rEthRate] = await withTimeout(Promise.all([
        (c as any).readContract({ address: ETH_ADDRESSES.wstETH, abi: WSTETH_ABI, functionName: 'getStETHByWstETH', args: [one] }),
        (c as any).readContract({ address: ETH_ADDRESSES.rETH,   abi: RETH_ABI,   functionName: 'getExchangeRate' }),
      ])) as [bigint, bigint];
      const stPerWstNum = Number(formatUnits(stPerWst, 18)); // ~1.17 stETH per wstETH
      const rEthRateNum = Number(formatUnits(rEthRate, 18)); // ETH per rETH ~1.10
      const wstEthPerEth = stPerWstNum > 0 ? 1 / stPerWstNum : RATES_FALLBACK.wstEthPerEth;
      const rEthPerEth   = rEthRateNum > 0 ? 1 / rEthRateNum : RATES_FALLBACK.rEthPerEth;
      return { wstEthPerEth, stEthPerEth: 1.0, rEthPerEth, updatedAt: Date.now(), source: 'onchain' };
    } catch {
      rotateClient();
    }
  }
  return RATES_FALLBACK;
}

export interface GasFeeData {
  baseFeeGwei: number;
  priorityGwei: number;
  fastGwei: number;      // baseFee + priority
  ethPriceUsd: number;
  source: 'live' | 'fallback';
  updatedAt: number;
}

export async function fetchGasFeeData(ethPriceUsd: number): Promise<GasFeeData> {
  for (let i = 0; i < RPCS.length; i++) {
    try {
      const c = ethClient();
      const fd = await withTimeout(c.estimateFeesPerGas());
      const base = Number(fd.maxFeePerGas ?? 0n) / 1e9;
      const prio = Number(fd.maxPriorityFeePerGas ?? 0n) / 1e9;
      return {
        baseFeeGwei: Math.max(0, base - prio),
        priorityGwei: prio,
        fastGwei: base > 0 ? base : (prio + 1),
        ethPriceUsd,
        source: 'live',
        updatedAt: Date.now(),
      };
    } catch { rotateClient(); }
  }
  return { baseFeeGwei: 14, priorityGwei: 1, fastGwei: 15, ethPriceUsd, source: 'fallback', updatedAt: 0 };
}

export async function fetchEthPriceUsd(): Promise<number> {
  // Delegated to the never-fail cascade (Mobula → Binance → CoinGecko → hard 3000).
  const { fetchTokenPrice } = await import('./apiManager');
  try { return await fetchTokenPrice('ETH'); } catch { return 3000; }
}

// Gas limits (units) per action.
export const GAS_LIMITS = {
  nativeMintLido: 85_000n,   // ETH → stETH (Lido submit)
  nativeMintRp:   85_000n,   // ETH → rETH  (Rocket Pool deposit)
  wrapStEth:      55_000n,   // stETH → wstETH wrap (extra tx)
  dexSwap:        180_000n,  // generic router swap
  earnDeposit:    120_000n,  // Lido EarnETH vault deposit
} as const;

export function gasCostUsd(gasLimit: bigint, gweiFast: number, ethPriceUsd: number): number {
  return (Number(gasLimit) * gweiFast) / 1e9 * ethPriceUsd;
}
