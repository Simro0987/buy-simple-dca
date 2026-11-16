/**
 * Generates a Safe{Wallet} Transaction Builder batch (JSON) that the Safe OWNERS import and sign:
 *   1. Safe.enableModule(module)
 *   2. module.setToken(token, true, usdFeed)   for each token
 *   3. module.setPool(tokenIn, tokenOut, fee, true)  for each pool
 *
 * Usage:  npm run runner:safe-tx -- agent-runner/scripts/my-setup.json > safe-batch.json
 * Then:   app.safe.global -> Apps -> Transaction Builder -> drag & drop safe-batch.json -> review -> sign.
 * This script only PRINTS JSON. It does not sign or send anything.
 */
import { readFileSync } from 'node:fs';
import { encodeFunctionData, getAddress, isAddress, type Address } from 'viem';

const SAFE_ABI = [
  { type: 'function', name: 'enableModule', stateMutability: 'nonpayable', inputs: [{ name: 'module', type: 'address' }], outputs: [] },
] as const;
const MODULE_ADMIN_ABI = [
  {
    type: 'function', name: 'setToken', stateMutability: 'nonpayable', outputs: [],
    inputs: [{ name: 'token', type: 'address' }, { name: 'allowed', type: 'bool' }, { name: 'usdFeed', type: 'address' }],
  },
  {
    type: 'function', name: 'setPool', stateMutability: 'nonpayable', outputs: [],
    inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'allowed', type: 'bool' }],
  },
] as const;

interface SetupFile {
  chainId: number;
  safe: string;
  module: string;
  tokens: { token: string; usdFeed: string }[];
  pools: { tokenIn: string; tokenOut: string; fee: number }[];
}

const a = (v: string, what: string): Address => {
  if (!isAddress(v)) throw new Error(`${what}: invalid address ${v}`);
  return getAddress(v);
};

export function buildSafeBatch(cfg: SetupFile, createdAt = Date.now()) {
  const safe = a(cfg.safe, 'safe');
  const module = a(cfg.module, 'module');
  const tx = (to: Address, data: `0x${string}`) => ({ to, value: '0', data, contractMethod: null, contractInputsValues: null });
  const transactions = [
    tx(safe, encodeFunctionData({ abi: SAFE_ABI, functionName: 'enableModule', args: [module] })),
    ...cfg.tokens.map((t) =>
      tx(module, encodeFunctionData({ abi: MODULE_ADMIN_ABI, functionName: 'setToken', args: [a(t.token, 'token'), true, a(t.usdFeed, 'usdFeed')] })),
    ),
    ...cfg.pools.map((p) => {
      if (![100, 500, 3000, 10000].includes(p.fee)) throw new Error(`bad fee ${p.fee}`);
      return tx(module, encodeFunctionData({ abi: MODULE_ADMIN_ABI, functionName: 'setPool', args: [a(p.tokenIn, 'tokenIn'), a(p.tokenOut, 'tokenOut'), p.fee, true] }));
    }),
  ];
  return {
    version: '1.0',
    chainId: String(cfg.chainId),
    createdAt,
    meta: {
      name: 'Enable AgentSwapModule (swap-only agent)',
      description: `enableModule(${module}) + ${cfg.tokens.length} setToken + ${cfg.pools.length} setPool`,
      txBuilderVersion: '1.16.5',
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: '',
    },
    transactions,
  };
}

if (process.argv[1] && /safe-tx-builder/.test(process.argv[1])) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: npm run runner:safe-tx -- <setup.json>');
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(file, 'utf8')) as SetupFile;
  console.log(JSON.stringify(buildSafeBatch(cfg), null, 2));
}
