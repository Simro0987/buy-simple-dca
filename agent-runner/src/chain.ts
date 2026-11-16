import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AGENT_MODULE_ABI, ERC20_READ_ABI, FEED_ABI, SAFE_READ_ABI } from './abi';
import type { NetworkInfo } from './networks';

export interface ModuleState {
  safe: Address;
  router: Address;
  agent: Address;
  paused: boolean;
  perSwapLimitUsd: bigint; // 18 decimals
  dailyLimitUsd: bigint;
  cooldownSeconds: bigint;
  maxSlippageBps: bigint;
  maxOracleAge: bigint;
  lastSwapAt: bigint;
  currentDay: bigint;
  spentTodayUsd: bigint;
}

export interface TokenConfig {
  allowed: boolean;
  tokenDecimals: number;
  usdFeed: Address;
}

export interface FeedPrice {
  answer: bigint;
  decimals: number;
  updatedAt: bigint;
}

export interface SwapArgs {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  amountIn: bigint;
  amountOutMinimum: bigint;
}

/** Read side: anything. */
export interface ChainReader {
  now(): Promise<bigint>;
  moduleState(module: Address): Promise<ModuleState>;
  tokenConfig(module: Address, token: Address): Promise<TokenConfig>;
  poolAllowed(module: Address, tokenIn: Address, tokenOut: Address, fee: number): Promise<boolean>;
  feed(feed: Address): Promise<FeedPrice>;
  balanceOf(token: Address, owner: Address): Promise<bigint>;
  safeOwners(safe: Address): Promise<Address[]>;
  isModuleEnabled(safe: Address, module: Address): Promise<boolean>;
}

/**
 * Write side for ONE agent key bound to ONE module address. It exposes exactly two actions:
 * swap (via the module) and pause (the module's emergency stop). There is no method that can
 * send a transaction to any other address or with any other calldata.
 */
export interface AgentExecutor {
  readonly agentAddress: Address;
  readonly module: Address;
  simulateSwap(args: SwapArgs): Promise<bigint>;
  sendSwap(args: SwapArgs): Promise<Hex>;
  pauseModule(): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<{ status: 'success' | 'reverted'; blockNumber: bigint }>;
}

export function createViemReader(network: NetworkInfo, rpcUrl: string): ChainReader & { client: PublicClient } {
  const client = createPublicClient({ chain: network.chain, transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
  const read = <T>(address: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []) =>
    client.readContract({ address, abi: abi as never, functionName: functionName as never, args: args as never }) as Promise<T>;

  return {
    client,
    async now() {
      const b = await client.getBlock({ blockTag: 'latest' });
      return b.timestamp;
    },
    async moduleState(m) {
      const names = [
        'safe', 'router', 'agent', 'paused', 'perSwapLimitUsd', 'dailyLimitUsd', 'cooldownSeconds',
        'maxSlippageBps', 'maxOracleAge', 'lastSwapAt', 'currentDay', 'spentTodayUsd',
      ] as const;
      const values = await Promise.all(names.map((n) => read<unknown>(m, AGENT_MODULE_ABI, n)));
      return Object.fromEntries(names.map((n, i) => [n, values[i]])) as unknown as ModuleState;
    },
    async tokenConfig(m, token) {
      const [allowed, tokenDecimals, usdFeed] = await read<[boolean, number, Address]>(m, AGENT_MODULE_ABI, 'tokens', [token]);
      return { allowed, tokenDecimals: Number(tokenDecimals), usdFeed };
    },
    async poolAllowed(m, tokenIn, tokenOut, fee) {
      const key = await read<Hex>(m, AGENT_MODULE_ABI, 'poolKey', [tokenIn, tokenOut, fee]);
      return read<boolean>(m, AGENT_MODULE_ABI, 'allowedPools', [key]);
    },
    async feed(f) {
      const [decimals, round] = await Promise.all([
        read<number>(f, FEED_ABI, 'decimals'),
        read<[bigint, bigint, bigint, bigint, bigint]>(f, FEED_ABI, 'latestRoundData'),
      ]);
      return { answer: round[1], decimals: Number(decimals), updatedAt: round[3] };
    },
    balanceOf: (token, owner) => read<bigint>(token, ERC20_READ_ABI, 'balanceOf', [owner]),
    safeOwners: (safe) => read<Address[]>(safe, SAFE_READ_ABI, 'getOwners'),
    isModuleEnabled: (safe, module) => read<boolean>(safe, SAFE_READ_ABI, 'isModuleEnabled', [module]),
  };
}

export function createViemExecutor(
  network: NetworkInfo,
  rpcUrl: string,
  privateKey: Hex,
  module: Address,
  publicClient: PublicClient,
): AgentExecutor {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: network.chain, transport: http(rpcUrl, { timeout: 30_000 }) });
  const swapCall = (a: SwapArgs) =>
    ({
      address: module, // fixed at construction - the ONLY contract this key ever calls
      abi: AGENT_MODULE_ABI,
      functionName: 'swapExactInputSingle',
      args: [a.tokenIn, a.tokenOut, a.fee, a.amountIn, a.amountOutMinimum],
      account,
    }) as const;

  return {
    agentAddress: account.address,
    module,
    async simulateSwap(a) {
      const { result } = await publicClient.simulateContract(swapCall(a));
      return result as bigint;
    },
    async sendSwap(a) {
      const { request } = await publicClient.simulateContract(swapCall(a));
      return wallet.writeContract(request);
    },
    async pauseModule() {
      const { request } = await publicClient.simulateContract({
        address: module,
        abi: AGENT_MODULE_ABI,
        functionName: 'pause',
        account,
      });
      return wallet.writeContract(request);
    },
    async waitForReceipt(hash) {
      const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
      return { status: r.status, blockNumber: r.blockNumber };
    },
  };
}
