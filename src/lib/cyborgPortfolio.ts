import { addStake, removeStake } from '@/lib/stakingLedger';

const DEBT_KEY = 'cyborg-usdc-debt-v1';
const DEBT_EVT = 'cyborg-usdc-debt-changed';
const WALLET_KEY = 'cyborg-usdc-wallet-v1';
const WALLET_EVT = 'cyborg-usdc-wallet-changed';
const CONFIRMED_KEY = 'cyborg-confirmed-steps-v1';
const CONFIRMED_EVT = 'cyborg-confirmed-steps-changed';

export interface PortfolioBalanceUpdate {
  rEthQty?: number;
  mSolQty?: number;
  alchemixEthQty?: number;
  lbtcQty?: number;
  usdcBorrowed?: number;
  usdcWalletDelta?: number;
}

export interface ConfirmedStepData {
  update: PortfolioBalanceUpdate;
  ethProtocol?: string;
  solProtocol?: string;
}

export function loadConfirmedSteps(): Record<string, ConfirmedStepData> {
  try {
    const raw = localStorage.getItem(CONFIRMED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed) return {};
    const out: Record<string, ConfirmedStepData> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val === true) {
        out[key] = { update: {} };
      } else if (val && typeof val === 'object' && 'update' in val) {
        out[key] = val as ConfirmedStepData;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistConfirmedSteps(steps: Record<string, ConfirmedStepData>): void {
  try {
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify(steps));
    window.dispatchEvent(new CustomEvent(CONFIRMED_EVT));
  } catch { /* ignore */ }
}

export function markStepConfirmed(
  key: string,
  update: PortfolioBalanceUpdate,
  protocols?: { ethProtocol?: string; solProtocol?: string },
): void {
  const next = {
    ...loadConfirmedSteps(),
    [key]: { update, ethProtocol: protocols?.ethProtocol, solProtocol: protocols?.solProtocol },
  };
  persistConfirmedSteps(next);
}

export function unmarkStepConfirmed(key: string): ConfirmedStepData | null {
  const steps = loadConfirmedSteps();
  const record = steps[key];
  if (!record) return null;
  const next = { ...steps };
  delete next[key];
  persistConfirmedSteps(next);
  return record;
}

export function isStepConfirmed(key: string): boolean {
  return key in loadConfirmedSteps();
}

export const CYBORG_CONFIRMED_EVENT = CONFIRMED_EVT;

export function loadCyborgUsdcDebt(): number {
  try {
    const n = Number(localStorage.getItem(DEBT_KEY) || '0');
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function persistCyborgUsdcDebt(amount: number): void {
  try {
    localStorage.setItem(DEBT_KEY, String(amount));
    window.dispatchEvent(new CustomEvent(DEBT_EVT));
  } catch { /* ignore */ }
}

export function addCyborgUsdcDebt(delta: number): number {
  const next = loadCyborgUsdcDebt() + Math.max(0, delta);
  persistCyborgUsdcDebt(next);
  return next;
}

export function subtractCyborgUsdcDebt(delta: number): number {
  const next = Math.max(0, loadCyborgUsdcDebt() - Math.max(0, delta));
  persistCyborgUsdcDebt(next);
  return next;
}

export const CYBORG_DEBT_EVENT = DEBT_EVT;

export function loadCyborgUsdcWallet(): number {
  try {
    const n = Number(localStorage.getItem(WALLET_KEY) || '0');
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function persistCyborgUsdcWallet(amount: number): void {
  try {
    localStorage.setItem(WALLET_KEY, String(amount));
    window.dispatchEvent(new CustomEvent(WALLET_EVT));
  } catch { /* ignore */ }
}

export function addCyborgUsdcWallet(delta: number): number {
  const next = loadCyborgUsdcWallet() + Math.max(0, delta);
  persistCyborgUsdcWallet(next);
  return next;
}

export function subtractCyborgUsdcWallet(delta: number): number {
  const next = Math.max(0, loadCyborgUsdcWallet() - Math.max(0, delta));
  persistCyborgUsdcWallet(next);
  return next;
}

export const CYBORG_WALLET_EVENT = WALLET_EVT;

export function applyPortfolioBalanceUpdate(update: PortfolioBalanceUpdate): void {
  if (update.rEthQty && update.rEthQty > 0) {
    addStake('ETH', 'Rocket Pool (rETH)', update.rEthQty);
  }
  if (update.mSolQty && update.mSolQty > 0) {
    addStake('SOL', 'Marinade Native (mSOL)', update.mSolQty);
  }
  if (update.alchemixEthQty && update.alchemixEthQty > 0) {
    addStake('ETH', 'Alchemix Vault (ETH)', update.alchemixEthQty);
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

export function revertPortfolioBalanceUpdate(update: PortfolioBalanceUpdate): void {
  if (update.rEthQty && update.rEthQty > 0) {
    removeStake('ETH', 'Rocket Pool (rETH)', update.rEthQty);
  }
  if (update.mSolQty && update.mSolQty > 0) {
    removeStake('SOL', 'Marinade Native (mSOL)', update.mSolQty);
  }
  if (update.alchemixEthQty && update.alchemixEthQty > 0) {
    removeStake('ETH', 'Alchemix Vault (ETH)', update.alchemixEthQty);
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

export function applyAlchemixAutonomousRebalance(input: {
  withdrawAlchemixEth: number;
  coreEthQty: number;
  tacticalEthQty: number;
  usdcBorrowed: number;
}): void {
  if (input.withdrawAlchemixEth > 0) {
    removeStake('ETH', 'Alchemix Vault (ETH)', input.withdrawAlchemixEth);
  }
  if (input.coreEthQty > 0) {
    addStake('ETH', 'Rocket Pool (rETH)', input.coreEthQty);
  }
  if (input.tacticalEthQty > 0) {
    addStake('ETH', 'Aave V3 Lending', input.tacticalEthQty);
  }
  if (input.usdcBorrowed > 0) {
    addCyborgUsdcDebt(input.usdcBorrowed);
  }
}

export function buildCyborgExecutionUpdate(input: {
  rEthQty: number;
  mSolQty: number;
  collateralPct: number;
  ltvPct: number;
  ethPrice: number;
  solPrice: number;
  btcPrice: number;
}): PortfolioBalanceUpdate {
  const motorUsd =
    input.rEthQty * input.ethPrice + input.mSolQty * input.solPrice;
  const deployedUsd = motorUsd * (input.collateralPct / 100);
  const usdcBorrowed = deployedUsd * (input.ltvPct / 100);

  const rEthShare = motorUsd > 0 ? (input.rEthQty * input.ethPrice) / motorUsd : 0.5;
  const mSolShare = 1 - rEthShare;

  const rEthQty = input.ethPrice > 0
    ? (deployedUsd * rEthShare) / input.ethPrice
    : 0;
  const mSolQty = input.solPrice > 0
    ? (deployedUsd * mSolShare) / input.solPrice
    : 0;
  const lbtcQty = input.btcPrice > 0 ? usdcBorrowed / input.btcPrice : 0;

  return {
    rEthQty,
    mSolQty,
    lbtcQty,
    usdcBorrowed,
  };
}
