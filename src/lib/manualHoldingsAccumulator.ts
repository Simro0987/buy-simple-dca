export type CoinKey = 'btc' | 'eth' | 'sol';
export type InputMode = 'asset' | 'usd';

export const TOKEN_PRICE_ID: Record<CoinKey, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
};

export const COIN_LABEL: Record<CoinKey, string> = {
  btc: 'BTC',
  eth: 'ETH',
  sol: 'SOL',
};

export interface HoldingsState {
  manual_holdings?: Partial<Record<CoinKey, number>> | null;
  initial_cost_basis?: Partial<Record<CoinKey, number>> | null;
}

export interface HoldingsUpdateResult {
  manual_holdings: Record<CoinKey, number>;
  initial_cost_basis: Record<CoinKey, number>;
  deltaQty: number;
  deltaUsd: number;
  execPrice: number;
  newAvg: number;
}

function qtyFromInput(raw: number, mode: InputMode, execPrice: number): number {
  return mode === 'asset' ? raw : raw / execPrice;
}

function usdFromInput(raw: number, mode: InputMode, execPrice: number): number {
  return mode === 'asset' ? raw * execPrice : raw;
}

export function computeAddHoldingsUpdate(
  key: CoinKey,
  raw: number,
  mode: InputMode,
  execPrice: number,
  state: HoldingsState,
): HoldingsUpdateResult | { error: string } {
  if (!raw || raw <= 0) return { error: 'Zadaj kladnú hodnotu' };
  if (execPrice <= 0) return { error: 'Zadaj platnú cenu (USD)' };

  const newQty = qtyFromInput(raw, mode, execPrice);
  const newUsd = usdFromInput(raw, mode, execPrice);

  const oldQty = Number(state.manual_holdings?.[key] ?? 0);
  const oldUsd = Number(state.initial_cost_basis?.[key] ?? 0);
  const totalQty = oldQty + newQty;
  const totalUsd = oldUsd + newUsd;

  return {
    manual_holdings: { ...(state.manual_holdings ?? {}), [key]: totalQty } as Record<CoinKey, number>,
    initial_cost_basis: { ...(state.initial_cost_basis ?? {}), [key]: totalUsd } as Record<CoinKey, number>,
    deltaQty: newQty,
    deltaUsd: newUsd,
    execPrice,
    newAvg: totalQty > 0 ? totalUsd / totalQty : 0,
  };
}

export function computeRemoveHoldingsUpdate(
  key: CoinKey,
  raw: number,
  mode: InputMode,
  execPrice: number,
  state: HoldingsState,
): HoldingsUpdateResult | { error: string } {
  if (!raw || raw <= 0) return { error: 'Zadaj kladnú hodnotu' };
  if (execPrice <= 0) return { error: 'Zadaj platnú cenu (USD)' };

  const removeQty = qtyFromInput(raw, mode, execPrice);
  const saleUsd = usdFromInput(raw, mode, execPrice);

  const oldQty = Number(state.manual_holdings?.[key] ?? 0);
  const oldUsd = Number(state.initial_cost_basis?.[key] ?? 0);

  if (oldQty <= 0) return { error: 'Žiadne držby na odobratie' };
  if (removeQty > oldQty + 1e-12) {
    return { error: `Nedostatok ${COIN_LABEL[key]} — máš ${oldQty.toFixed(8)}` };
  }

  const avgCost = oldUsd / oldQty;
  const costRemoved = removeQty * avgCost;
  const totalQty = oldQty - removeQty;
  const totalUsd = Math.max(0, oldUsd - costRemoved);

  return {
    manual_holdings: { ...(state.manual_holdings ?? {}), [key]: totalQty } as Record<CoinKey, number>,
    initial_cost_basis: { ...(state.initial_cost_basis ?? {}), [key]: totalUsd } as Record<CoinKey, number>,
    deltaQty: removeQty,
    deltaUsd: saleUsd,
    execPrice,
    newAvg: totalQty > 0 ? totalUsd / totalQty : 0,
  };
}
