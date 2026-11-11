// Cloud-backed cyborg portfolio state (source of truth: public.defi_positions).
// - usdc_debt: number
// - confirmed_steps: JSON map of stepKey -> { update }
// Sync API surface backed by in-memory cache; hydrated by CloudSyncProvider.

import { supabase } from '@/integrations/supabase/client';
import { addStake, removeStake } from '@/lib/stakingLedger';
import { addEthDebt } from '@/lib/ethDebt';

const DEBT_EVT = 'cyborg-usdc-debt-changed';
const CONFIRMED_EVT = 'cyborg-confirmed-steps-changed';
export const CYBORG_DEBT_EVENT = DEBT_EVT;
export const CYBORG_CONFIRMED_EVENT = CONFIRMED_EVT;

export interface PortfolioBalanceUpdate {
  rEthQty?: number;
  mSolQty?: number;
  alchemixEthQty?: number;
  lbtcQty?: number;
  usdcBorrowed?: number;
}

export interface ConfirmedStepData {
  update: PortfolioBalanceUpdate;
}

let usdcDebtCache = 0;
let confirmedCache: Record<string, ConfirmedStepData> = {};
let currentUserId: string | null = null;

function emitDebt() { try { window.dispatchEvent(new CustomEvent(DEBT_EVT)); } catch { /* noop */ } }
function emitConfirmed() { try { window.dispatchEvent(new CustomEvent(CONFIRMED_EVT)); } catch { /* noop */ } }

export function setCyborgUser(userId: string | null): void { currentUserId = userId; }
export function setCyborgUsdcDebtCache(v: number): void {
  usdcDebtCache = Math.max(0, Number(v) || 0); emitDebt();
}
export function setCyborgConfirmedCache(v: Record<string, ConfirmedStepData>): void {
  confirmedCache = v ?? {}; emitConfirmed();
}

function persistDebt(): void {
  if (!currentUserId) return;
  void supabase.from('defi_positions').upsert(
    { user_id: currentUserId, usdc_debt: usdcDebtCache },
    { onConflict: 'user_id' },
  );
}
function persistConfirmed(): void {
  if (!currentUserId) return;
  void supabase.from('defi_positions').upsert(
    { user_id: currentUserId, confirmed_steps: confirmedCache as any },
    { onConflict: 'user_id' },
  );
}

// ---- Confirmed steps ----
export function loadConfirmedSteps(): Record<string, ConfirmedStepData> {
  return { ...confirmedCache };
}
export function markStepConfirmed(key: string, update: PortfolioBalanceUpdate): void {
  confirmedCache = { ...confirmedCache, [key]: { update } };
  emitConfirmed();
  persistConfirmed();
}
export function unmarkStepConfirmed(key: string): PortfolioBalanceUpdate | null {
  const record = confirmedCache[key];
  if (!record) return null;
  const next = { ...confirmedCache };
  delete next[key];
  confirmedCache = next;
  emitConfirmed();
  persistConfirmed();
  return record.update;
}
export function isStepConfirmed(key: string): boolean {
  return key in confirmedCache;
}

// ---- USDC debt ----
export function loadCyborgUsdcDebt(): number { return usdcDebtCache; }
export function addCyborgUsdcDebt(delta: number): number {
  usdcDebtCache = Math.max(0, usdcDebtCache + Math.max(0, delta));
  emitDebt(); persistDebt();
  return usdcDebtCache;
}
export function subtractCyborgUsdcDebt(delta: number): number {
  usdcDebtCache = Math.max(0, usdcDebtCache - Math.max(0, delta));
  emitDebt(); persistDebt();
  return usdcDebtCache;
}

// ---- Portfolio balance update helpers ----
export function applyPortfolioBalanceUpdate(update: PortfolioBalanceUpdate): void {
  if (update.rEthQty && update.rEthQty > 0) addStake('ETH', 'Rocket Pool (rETH)', update.rEthQty);
  if (update.mSolQty && update.mSolQty > 0) addStake('SOL', 'Marinade Native (mSOL)', update.mSolQty);
  if (update.alchemixEthQty && update.alchemixEthQty > 0) addStake('ETH', 'Alchemix Vault (ETH)', update.alchemixEthQty);
  if (update.lbtcQty && update.lbtcQty > 0) addStake('BTC', 'Lombard LBTC', update.lbtcQty);
  if (update.usdcBorrowed && update.usdcBorrowed > 0) addCyborgUsdcDebt(update.usdcBorrowed);
}

export function revertPortfolioBalanceUpdate(update: PortfolioBalanceUpdate): void {
  if (update.rEthQty && update.rEthQty > 0) removeStake('ETH', 'Rocket Pool (rETH)', update.rEthQty);
  if (update.mSolQty && update.mSolQty > 0) removeStake('SOL', 'Marinade Native (mSOL)', update.mSolQty);
  if (update.alchemixEthQty && update.alchemixEthQty > 0) removeStake('ETH', 'Alchemix Vault (ETH)', update.alchemixEthQty);
  if (update.lbtcQty && update.lbtcQty > 0) removeStake('BTC', 'Lombard LBTC', update.lbtcQty);
  if (update.usdcBorrowed && update.usdcBorrowed > 0) subtractCyborgUsdcDebt(update.usdcBorrowed);
}

export function applyAlchemixAutonomousRebalance(input: {
  withdrawAlchemixEth: number;
  coreEthQty: number;
  tacticalEthQty: number;
  usdcBorrowed: number;
}): void {
  if (input.withdrawAlchemixEth > 0) removeStake('ETH', 'Alchemix Vault (ETH)', input.withdrawAlchemixEth);
  if (input.coreEthQty > 0) addStake('ETH', 'Rocket Pool (rETH)', input.coreEthQty);
  if (input.tacticalEthQty > 0) addStake('ETH', 'Aave V3 Lending', input.tacticalEthQty);
  if (input.usdcBorrowed > 0) addCyborgUsdcDebt(input.usdcBorrowed);
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
  const motorUsd = input.rEthQty * input.ethPrice + input.mSolQty * input.solPrice;
  const deployedUsd = motorUsd * (input.collateralPct / 100);
  const usdcBorrowed = deployedUsd * (input.ltvPct / 100);
  const rEthShare = motorUsd > 0 ? (input.rEthQty * input.ethPrice) / motorUsd : 0.5;
  const mSolShare = 1 - rEthShare;
  const rEthQty = input.ethPrice > 0 ? (deployedUsd * rEthShare) / input.ethPrice : 0;
  const mSolQty = input.solPrice > 0 ? (deployedUsd * mSolShare) / input.solPrice : 0;
  const lbtcQty = input.btcPrice > 0 ? usdcBorrowed / input.btcPrice : 0;
  return { rEthQty, mSolQty, lbtcQty, usdcBorrowed };
}
// re-export to keep import surface stable if consumers pulled from here
export { addEthDebt };
