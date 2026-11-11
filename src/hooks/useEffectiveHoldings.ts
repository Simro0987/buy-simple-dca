/**
 * useEffectiveHoldings — jediný zdroj pravdy pre PnL / Harvest modul.
 *
 * Automaticky syncuje:
 *  - Qty: manuálne zadané (override) → inak globálne zostatky (`useGlobalBalances`)
 *  - WACB: manuálne zadané → inak reálny cost basis (`useAvgBuyPrices`)
 *          → inak aktuálna živá cena (0 % nerealizované PnL baseline)
 */
import { useMemo } from 'react';
import { HARVEST_TOKENS, type HarvestToken } from '@/lib/harvestEngine';
import { useHoldings, type HoldingsState } from '@/lib/portfolioHoldings';
import { useGlobalBalances } from '@/hooks/useGlobalBalances';
import { useAvgBuyPrices } from '@/hooks/useAvgBuyPrices';
import { useAssetLayers, layerFor, splitLayers } from '@/hooks/useAssetLayers';
import { useExtraAssetsState } from '@/lib/extraAssets';

export function useEffectiveHoldings(
  prices: Partial<Record<HarvestToken, number>> = {},
): HoldingsState {
  const manual = useHoldings();
  const { data: balances } = useGlobalBalances();
  const { data: avg } = useAvgBuyPrices();
  // Vnorené stavy (Liquid / Staked / Collateral / Borrow) — stake je presun, nie predaj.
  const layers = useAssetLayers();
  // wBTC je 1:1 zabalený BTC — zlučuje sa priamo do BTC (žiadny samostatný riadok).
  const extras = useExtraAssetsState();

  const priceKey = HARVEST_TOKENS.map((t) => Number(prices[t]) || 0).join('|');

  return useMemo(() => {
    const out = {} as HoldingsState;
    for (const t of HARVEST_TOKENS) {
      const m = manual[t] ?? { qty: 0, wacb: 0 };
      const synced = Number(balances?.[t]) || 0;
      // Aktívne množstvo = manuálny základ + Σ BUY − Σ SELL z histórie.
      // Manuálny vstup je „počiatočný zostatok", história ho len upravuje.
      const ledger = avg?.[t];
      const manualBase = m.qty > 0 ? m.qty : 0;
      const base = ledger
        ? Math.max(0, manualBase + (Number(ledger.qty) || 0))
        : manualBase > 0 ? manualBase : synced;
      const live = Number(prices[t]) || 0;
      // Total = (Liquid + Staked + Collateral) − Borrow; stakovaná/kolaterálová
      // časť sa nikdy „nestratí“ z hodnoty portfólia.
      const layerSplit = splitLayers(base, layerFor(layers, t), live);
      const qty = layerSplit.total;

      // WACB = vážený priemer manuálneho základu a histórie (buy/deposit
      // vážený priemer, sell nemení priemer). Vložené = Qty × WACB, takže
      // predaj proporcionálne zníži aj vložený kapitál.
      const ledgerAvg = Number(avg?.[t]?.avgPrice) || 0;
      const ledgerQty = Math.max(0, Number(avg?.[t]?.qty) || 0);
      const wacb = ledgerQty > 0 && ledgerAvg > 0 && manualBase > 0 && m.wacb > 0
        ? (manualBase * m.wacb + ledgerQty * ledgerAvg) / (manualBase + ledgerQty)
        : ledgerQty > 0 && ledgerAvg > 0
          ? ledgerAvg
          : m.wacb > 0 ? m.wacb : live;

      if (t === 'BTC') {
        // BTC = natívny BTC + wBTC (množstvo aj vážený nákupný priemer).
        const wQty = layerSplit.manualOverride ? 0 : Number(extras.WBTC?.qty) || 0;
        const wWacb = Number(extras.WBTC?.wacb) || 0;
        const mergedQty = qty + wQty;
        const mergedWacb = mergedQty > 0 && wQty > 0 && wWacb > 0
          ? (qty * wacb + wQty * wWacb) / mergedQty
          : wacb;
        out[t] = { qty: mergedQty, wacb: mergedQty > 0 ? mergedWacb : m.wacb };
        continue;
      }

      out[t] = { qty, wacb: qty > 0 ? wacb : m.wacb };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, balances, avg, priceKey, layers, extras]);
}
