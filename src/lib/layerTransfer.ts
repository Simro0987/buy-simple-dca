/**
 * Manuálny prevod množstiev medzi vnorenými vrstvami aktíva
 * (Liquid · Staked · Collateral · Borrow).
 *
 * Vrstvy nie sú samostatné úložiská — Liquid sa dopočítava ako
 * `gross − staked − collateral`, takže prevod znamená pridanie/odobranie
 * v staking store (staked/collateral) alebo v debt store (borrow).
 * Celková fiat hodnota portfólia sa prevodom nemení (okrem borrow, ktorý je dlh).
 */
import {
  getActiveStakes,
  recordActiveStake,
  reduceActiveStake,
  type StakeKind,
} from '@/stores/activeStakingStore';
import { addAssetDebt, repayAssetDebt } from '@/stores/assetDebtStore';

export type AssetLayer = 'liquid' | 'staked' | 'collateral' | 'borrow';

export const LAYER_LABEL: Record<AssetLayer, string> = {
  liquid: 'Liquid (v peňaženke)',
  staked: 'Staked',
  collateral: 'Collateral (DeFi supply)',
  borrow: 'Borrow (dlh)',
};

export const MANUAL_PROTOCOL = 'Manuálna korekcia';

/** Odoberie `amount` tokenov z danej vrstvy (staked/collateral) cez existujúce záznamy. */
function reduceKind(symbol: string, kind: StakeKind, amount: number): number {
  const sym = symbol.toUpperCase();
  const records = getActiveStakes()
    .filter(r => r.symbol.toUpperCase() === sym && (r.kind ?? 'staked') === kind)
    .sort((a, b) => b.amount - a.amount);
  let left = amount;
  let taken = 0;
  for (const r of records) {
    if (left <= 1e-12) break;
    const t = reduceActiveStake(r.symbol, r.protocol, Math.min(left, r.amount));
    taken += t;
    left -= t;
  }
  return taken;
}

export interface TransferInput {
  symbol: string;
  from: AssetLayer;
  to: AssetLayer;
  /** Množstvo v tokenoch. */
  amount: number;
  /** Aktuálna cena tokenu — potrebná pre prevody do/z Borrow (USD dlh). */
  price: number;
  /** Aktuálne množstvá vo vrstvách — na validáciu. */
  available: Record<AssetLayer, number>;
  /** APY pre nový staked/collateral záznam. */
  apy?: number;
}

export interface TransferResult {
  ok: boolean;
  message: string;
}

export function transferAssetLayer(input: TransferInput): TransferResult {
  const { symbol, from, to, amount, price, available, apy } = input;
  if (!symbol) return { ok: false, message: 'Chýba symbol aktíva.' };
  if (from === to) return { ok: false, message: 'Zdrojová a cieľová vrstva sú rovnaké.' };
  if (!(amount > 0)) return { ok: false, message: 'Zadaj množstvo väčšie ako 0.' };
  if ((from === 'borrow' || to === 'borrow') && !(price > 0)) {
    return { ok: false, message: 'Pre prevod dlhu je potrebná aktuálna cena tokenu.' };
  }
  const have = available[from] ?? 0;
  if (amount > have + 1e-9) {
    return { ok: false, message: `Vo vrstve ${LAYER_LABEL[from]} je len ${have.toFixed(4)} ${symbol}.` };
  }

  // Odobranie zo zdroja
  if (from === 'staked' || from === 'collateral') {
    const taken = reduceKind(symbol, from, amount);
    if (taken <= 0) return { ok: false, message: 'Nenašiel sa záznam na odobranie.' };
  } else if (from === 'borrow') {
    repayAssetDebt(symbol, amount * price);
  }
  // z 'liquid' sa nič neodoberá — dopočítava sa zo zostatku

  // Pridanie do cieľa
  if (to === 'staked' || to === 'collateral') {
    recordActiveStake(symbol, MANUAL_PROTOCOL, amount, apy, to);
  } else if (to === 'borrow') {
    addAssetDebt(symbol, amount * price);
  }

  return {
    ok: true,
    message: `Prevedené ${amount} ${symbol.toUpperCase()}: ${LAYER_LABEL[from]} → ${LAYER_LABEL[to]}`,
  };
}
