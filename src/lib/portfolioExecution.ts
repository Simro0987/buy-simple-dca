import {
  addCyborgUsdcDebt,
  addCyborgUsdcWallet,
  subtractCyborgUsdcDebt,
  subtractCyborgUsdcWallet,
  type PortfolioBalanceUpdate,
} from '@/lib/cyborgPortfolio';
import { addStake, removeStake } from '@/lib/stakingLedger';

export type ExecutionLayer =
  | 'core-stake'
  | 'tactical-supply'
  | 'tactical-borrow'
  | 'alchemix-supply'
  | 'yield-hold';

export type ExecutionActionType = 'stake' | 'supply-collateral' | 'borrow' | 'hold-cash';

export interface ExecuteActionInput {
  layer: ExecutionLayer;
  actionType: ExecutionActionType;
  amount: number;
  symbol: 'ETH' | 'SOL';
}

export interface ExecutionPayload {
  update: PortfolioBalanceUpdate;
  ethProtocol?: string;
  solProtocol?: string;
}

function safeAmount(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

const CORE_ETH_PROTOCOL = 'Rocket Pool (rETH)';
const CORE_SOL_PROTOCOL = 'Marinade Native (mSOL)';
const TACTICAL_ETH_PROTOCOL = 'Aave V3 Lending';
const TACTICAL_SOL_PROTOCOL = 'Kamino Autopilot';
const ALCHEMIX_PROTOCOL = 'Alchemix Vault (ETH)';

export function buildExecutionPayload(input: ExecuteActionInput): ExecutionPayload {
  const amount = safeAmount(input.amount);
  const symbol = input.symbol ?? 'ETH';

  if (input.actionType === 'borrow' || input.layer === 'tactical-borrow') {
    return {
      update: { usdcBorrowed: amount, usdcWalletDelta: amount },
    };
  }

  if (input.actionType === 'hold-cash' || input.layer === 'yield-hold') {
    return { update: {} };
  }

  if (input.layer === 'alchemix-supply') {
    return {
      update: { alchemixEthQty: amount },
      ethProtocol: ALCHEMIX_PROTOCOL,
    };
  }

  if (input.layer === 'tactical-supply') {
    return symbol === 'ETH'
      ? { update: { rEthQty: amount }, ethProtocol: TACTICAL_ETH_PROTOCOL }
      : { update: { mSolQty: amount }, solProtocol: TACTICAL_SOL_PROTOCOL };
  }

  // core-stake
  return symbol === 'ETH'
    ? { update: { rEthQty: amount }, ethProtocol: CORE_ETH_PROTOCOL }
    : { update: { mSolQty: amount }, solProtocol: CORE_SOL_PROTOCOL };
}

export function applyExecutionPayload(payload: ExecutionPayload): void {
  const update = payload.update ?? {};

  if (update.rEthQty && update.rEthQty > 0) {
    addStake('ETH', payload.ethProtocol ?? CORE_ETH_PROTOCOL, update.rEthQty);
  }
  if (update.mSolQty && update.mSolQty > 0) {
    addStake('SOL', payload.solProtocol ?? CORE_SOL_PROTOCOL, update.mSolQty);
  }
  if (update.alchemixEthQty && update.alchemixEthQty > 0) {
    addStake('ETH', ALCHEMIX_PROTOCOL, update.alchemixEthQty);
  }
  if (update.lbtcQty && update.lbtcQty > 0) {
    addStake('BTC', 'Lombard LBTC', update.lbtcQty);
  }
  if (update.usdcBorrowed && update.usdcBorrowed > 0) {
    addCyborgUsdcDebt(update.usdcBorrowed);
  }
  if (update.usdcWalletDelta && update.usdcWalletDelta > 0) {
    addCyborgUsdcWallet(update.usdcWalletDelta);
  }
}

export function revertExecutionPayload(payload: ExecutionPayload): void {
  const update = payload.update ?? {};

  if (update.rEthQty && update.rEthQty > 0) {
    removeStake('ETH', payload.ethProtocol ?? CORE_ETH_PROTOCOL, update.rEthQty);
  }
  if (update.mSolQty && update.mSolQty > 0) {
    removeStake('SOL', payload.solProtocol ?? CORE_SOL_PROTOCOL, update.mSolQty);
  }
  if (update.alchemixEthQty && update.alchemixEthQty > 0) {
    removeStake('ETH', ALCHEMIX_PROTOCOL, update.alchemixEthQty);
  }
  if (update.lbtcQty && update.lbtcQty > 0) {
    removeStake('BTC', 'Lombard LBTC', update.lbtcQty);
  }
  if (update.usdcBorrowed && update.usdcBorrowed > 0) {
    subtractCyborgUsdcDebt(update.usdcBorrowed);
  }
  if (update.usdcWalletDelta && update.usdcWalletDelta > 0) {
    subtractCyborgUsdcWallet(update.usdcWalletDelta);
  }
}

export function executeAction(
  key: string,
  input: ExecuteActionInput,
  hooks: {
    markConfirmed: (key: string, update: PortfolioBalanceUpdate, meta?: unknown) => void;
    meta?: unknown;
  },
): ExecutionPayload {
  const payload = buildExecutionPayload(input);
  applyExecutionPayload(payload);
  hooks.markConfirmed(key, payload.update, hooks.meta);
  return payload;
}
