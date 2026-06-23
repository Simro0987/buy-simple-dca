import { addStake } from '@/lib/stakingLedger';

const DEBT_KEY = 'cyborg-usdc-debt-v1';
const DEBT_EVT = 'cyborg-usdc-debt-changed';

export interface PortfolioBalanceUpdate {
  /** Additional rETH motor collateral recorded in ledger */
  rEthQty?: number;
  /** Additional mSOL motor collateral recorded in ledger */
  mSolQty?: number;
  /** LBTC purchased with borrowed USDC */
  lbtcQty?: number;
  /** USDC borrowed via Morpho */
  usdcBorrowed?: number;
}

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

export const CYBORG_DEBT_EVENT = DEBT_EVT;

export function applyPortfolioBalanceUpdate(update: PortfolioBalanceUpdate): void {
  if (update.rEthQty && update.rEthQty > 0) {
    addStake('ETH', 'Rocket Pool (rETH)', update.rEthQty);
  }
  if (update.mSolQty && update.mSolQty > 0) {
    addStake('SOL', 'Marinade Native (mSOL)', update.mSolQty);
  }
  if (update.lbtcQty && update.lbtcQty > 0) {
    addStake('BTC', 'Lombard LBTC', update.lbtcQty);
  }
  if (update.usdcBorrowed && update.usdcBorrowed > 0) {
    addCyborgUsdcDebt(update.usdcBorrowed);
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
