import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { DEFAULT_NETWORK, NETWORKS, type NetworkInfo } from './networks';

const bool = (v: string | undefined, def: boolean) => {
  if (v === undefined || v.trim() === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
};

const addr = z
  .string()
  .refine((v) => isAddress(v), 'invalid address')
  .transform((v) => getAddress(v) as Address);

export const AgentSpecSchema = z.object({
  /** lowercase id, used for the key env var name: AGENT_<ID>_PRIVATE_KEY */
  id: z.string().regex(/^[a-z0-9]{2,32}$/, 'id must be 2-32 chars a-z0-9'),
  name: z.string().max(64).optional(),
  enabled: z.boolean().default(true),
  strategy: z.enum(['dca', 'dca-brake-boost']).default('dca'),
  /** AgentSwapModule deployed for THIS agent (each agent has its own module = own on-chain limits). */
  module: addr,
  tokenIn: addr,
  tokenOut: addr,
  fee: z.number().int().refine((f) => [100, 500, 3000, 10000].includes(f), 'fee must be 100/500/3000/10000'),
  /** Base buy size per run in USD (before Brake/Boost multiplier). */
  amountUsd: z.number().positive().max(1_000_000),
  /** Off-chain extra cap per day (on-chain module limit still applies). */
  maxDailyUsd: z.number().positive().optional(),
  intervalMinutes: z.number().int().min(5).max(60 * 24 * 31).default(60 * 24 * 7),
  /** Must be <= module.maxSlippageBps (the runner uses the smaller one). */
  maxSlippageBps: z.number().int().min(1).max(500).default(50),
  /** dca-brake-boost: market data symbol (Binance) used only for the RSI / 200D MA signal. */
  indicatorSymbol: z.string().regex(/^[A-Z0-9]{3,20}$/).optional(),
  indicatorToken: z.string().optional(),
});
export type AgentSpec = z.infer<typeof AgentSpecSchema>;

export interface LoadedAgent extends AgentSpec {
  /** null for disabled agents or when no key is configured yet (agent idles). Never logged, never exposed via the status API. */
  privateKey: Hex | null;
}

export interface RunnerConfig {
  network: NetworkInfo;
  rpcUrl: string;
  safe: Address;
  expectedRouter?: Address;
  dryRun: boolean;
  killSwitch: boolean;
  killSwitchPauseOnchain: boolean;
  allowMainnet: boolean;
  stateDir: string;
  statusPort: number;
  statusToken?: string;
  tickSeconds: number;
  agents: LoadedAgent[];
}

export class ConfigError extends Error {}

const PK_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Returns null when no key is configured yet (agent stays idle, status API reports "missing key").
 * A key that IS set but malformed is a hard error.
 */
function readKey(env: NodeJS.ProcessEnv, id: string, readFile: (p: string) => string): Hex | null {
  const base = `AGENT_${id.toUpperCase()}_PRIVATE_KEY`;
  let raw = env[base]?.trim();
  const file = env[`${base}_FILE`]?.trim();
  if (!raw && file) {
    try {
      raw = readFile(file).trim();
    } catch {
      return null; // file not uploaded yet (e.g. Flux volume browser) - idle until restart
    }
  }
  if (!raw) return null;
  if (!raw.startsWith('0x')) raw = `0x${raw}`;
  if (!PK_RE.test(raw)) throw new ConfigError(`${base} is not a 32-byte hex private key`);
  return raw as Hex;
}

/**
 * Parses env. Fail-closed defaults: testnet, DRY_RUN=true, mainnet refused unless ALLOW_MAINNET=true.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  readFile: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): RunnerConfig {
  const networkKey = (env.NETWORK || DEFAULT_NETWORK).trim();
  const network = NETWORKS[networkKey];
  if (!network) throw new ConfigError(`unknown NETWORK "${networkKey}" (${Object.keys(NETWORKS).join(', ')})`);
  const allowMainnet = bool(env.ALLOW_MAINNET, false);
  if (!network.testnet && !allowMainnet) {
    throw new ConfigError(`NETWORK=${networkKey} is a MAINNET. Set ALLOW_MAINNET=true explicitly to trade real funds.`);
  }

  const rpcUrl = (env.RPC_URL || network.chain.rpcUrls.default.http[0] || '').trim();
  if (!/^https?:\/\//.test(rpcUrl)) throw new ConfigError('RPC_URL must be http(s)');

  if (!env.SAFE_ADDRESS || !isAddress(env.SAFE_ADDRESS)) throw new ConfigError('SAFE_ADDRESS missing/invalid');
  const safe = getAddress(env.SAFE_ADDRESS);
  const expectedRouter =
    env.EXPECTED_ROUTER && isAddress(env.EXPECTED_ROUTER) ? getAddress(env.EXPECTED_ROUTER) : undefined;

  let agentsJson = env.AGENTS?.trim();
  if (!agentsJson && env.AGENTS_FILE) agentsJson = readFile(env.AGENTS_FILE.trim());
  let parsed: unknown = [];
  try {
    parsed = agentsJson ? JSON.parse(agentsJson) : [];
  } catch {
    throw new ConfigError('AGENTS is not valid JSON');
  }
  const specs = z.array(AgentSpecSchema).max(20).safeParse(parsed);
  if (!specs.success) throw new ConfigError(`AGENTS invalid: ${specs.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const ids = new Set<string>();
  const agents: LoadedAgent[] = specs.data.map((s) => {
    if (ids.has(s.id)) throw new ConfigError(`duplicate agent id ${s.id}`);
    ids.add(s.id);
    if (s.strategy === 'dca-brake-boost' && !s.indicatorSymbol) {
      throw new ConfigError(`agent ${s.id}: dca-brake-boost needs indicatorSymbol (e.g. BTCUSDT)`);
    }
    return { ...s, privateKey: s.enabled ? readKey(env, s.id, readFile) : null };
  });

  const statusPort = Number(env.STATUS_PORT || 8090);
  const tickSeconds = Math.max(15, Number(env.TICK_SECONDS || 60));
  return {
    network,
    rpcUrl,
    safe,
    expectedRouter,
    dryRun: bool(env.DRY_RUN, true),
    killSwitch: bool(env.KILL_SWITCH, false),
    killSwitchPauseOnchain: bool(env.KILL_SWITCH_PAUSE_ONCHAIN, false),
    allowMainnet,
    stateDir: (env.STATE_DIR || '/appdata').trim(),
    statusPort: Number.isInteger(statusPort) && statusPort > 0 ? statusPort : 8090,
    statusToken: env.STATUS_TOKEN?.trim() || undefined,
    tickSeconds,
    agents,
  };
}
