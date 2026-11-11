/**
 * useAssetLayers — jediný zdroj pravdy pre vnorené stavy aktíva.
 *
 * Pre každý symbol vracia množstvá v tokenoch:
 *  - staked      (Lido, Helius, natívny staking …)
 *  - collateral  (dodané do DeFi — Morpho/Aave supply)
 *  - borrowUsd   (dlh v USD proti tomuto kolaterálu)
 *
 * Liquid sa dopočíta z hrubého zostatku: liquid = gross − staked − collateral.
 * Total = (liquid + staked + collateral) − borrow.
 *
 * Zdroje: cloud staking ledger + lokálny Active Staking store (zlúčené podľa
 * symbol|protokol, kind rozhoduje staked vs collateral) + Asset Debt store +
 * ETH WETH dlh (ethDebt).
 */
import { useEffect, useMemo, useState } from 'react';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { useActiveStakes, stakeId } from '@/stores/activeStakingStore';
import { useAssetDebts } from '@/stores/assetDebtStore';
import { loadEthDebt, ETH_DEBT_EVENT } from '@/lib/ethDebt';
import { useAssetLayerOverrides } from '@/stores/assetLayerOverrideStore';

export interface AssetLayerQty {
  staked: number;
  collateral: number;
  /** Dlh v USD (USDC borrow) */
  borrowUsd: number;
  /** Dlh denominovaný priamo v tokene (napr. WETH borrow) */
  borrowNative: number;
  /** Presný manuálny Liquid; pri null sa dopočíta z hrubého zostatku. */
  liquidOverride: number | null;
  manualOverride: boolean;
}

export type AssetLayerMap = Record<string, AssetLayerQty>;

const EMPTY: AssetLayerQty = {
  staked: 0, collateral: 0, borrowUsd: 0, borrowNative: 0,
  liquidOverride: null, manualOverride: false,
};

export function layerFor(map: AssetLayerMap | undefined, symbol: string): AssetLayerQty {
  return map?.[symbol.toUpperCase()] ?? EMPTY;
}

/**
 * Split hrubého zostatku do vrstiev.
 *
 * KRITICKÉ: staking nikdy nenavyšuje celkový zostatok. Stakované + kolaterálové
 * množstvo je vždy zastropované reálnym hrubým zostatkom (pri poškodenom stave
 * sa proporcionálne zmenší), takže platí:
 *   Total = Liquid + Staked + Collateral (− Borrow)
 */
export function splitLayers(gross: number, l: AssetLayerQty, price: number) {
  if (l.manualOverride && l.liquidOverride != null) {
    const liquid = Math.max(0, l.liquidOverride);
    const staked = Math.max(0, l.staked);
    const collateral = Math.max(0, l.collateral);
    const borrowQty = price > 0 ? Math.max(0, l.borrowUsd) / price : 0;
    const total = Math.max(0, liquid + staked + collateral - borrowQty);
    return { liquid, staked, collateral, borrowQty, gross: liquid + staked + collateral, total, manualOverride: true };
  }
  const grossAdj = Math.max(0, gross);
  const lockedRaw = l.staked + l.collateral;
  // Zastropovanie: nikdy nemôže byť stakované viac, než aktívum reálne drží.
  const scale = lockedRaw > grossAdj && lockedRaw > 0 ? grossAdj / lockedRaw : 1;
  const staked = l.staked * scale;
  const collateral = l.collateral * scale;
  const liquid = Math.max(0, grossAdj - staked - collateral);
  const borrowQty = l.borrowNative + (price > 0 ? l.borrowUsd / price : 0);
  const total = Math.max(0, liquid + staked + collateral - borrowQty);
  return { liquid, staked, collateral, borrowQty, gross: grossAdj, total, manualOverride: false };
}

function useEthDebt(): number {
  const [v, setV] = useState(() => loadEthDebt());
  useEffect(() => {
    const sync = () => setV(loadEthDebt());
    window.addEventListener(ETH_DEBT_EVENT, sync);
    return () => window.removeEventListener(ETH_DEBT_EVENT, sync);
  }, []);
  return v;
}

export function useAssetLayers(): AssetLayerMap {
  const { entries } = useStakingLedger();
  const { records } = useActiveStakes();
  const debts = useAssetDebts();
  const ethDebt = useEthDebt();
  const overrides = useAssetLayerOverrides();

  return useMemo(() => {
    // Merge ledger + local records by id (max of the two, kind from local record).
    const merged = new Map<string, { symbol: string; amount: number; kind: 'staked' | 'collateral' }>();
    for (const e of entries) {
      merged.set(stakeId(e.symbol, e.protocol), { symbol: e.symbol.toUpperCase(), amount: e.amount, kind: 'staked' });
    }
    for (const r of records) {
      const ex = merged.get(r.id);
      merged.set(r.id, {
        symbol: r.symbol.toUpperCase(),
        amount: ex ? Math.max(ex.amount, r.amount) : r.amount,
        kind: r.kind ?? 'staked',
      });
    }

    const out: AssetLayerMap = {};
    const get = (s: string) => (out[s] ??= { ...EMPTY });
    for (const m of merged.values()) {
      if (!(m.amount > 0)) continue;
      const l = get(m.symbol);
      if (m.kind === 'collateral') l.collateral += m.amount; else l.staked += m.amount;
    }
    for (const [s, usd] of Object.entries(debts)) {
      if (usd > 0) get(s.toUpperCase()).borrowUsd += usd;
    }
    if (ethDebt > 0) get('ETH').borrowNative += ethDebt;
    for (const [symbol, override] of Object.entries(overrides)) {
      out[symbol] = {
        staked: override.staked,
        collateral: override.collateral,
        borrowUsd: override.borrowUsd,
        borrowNative: 0,
        liquidOverride: override.liquid,
        manualOverride: true,
      };
    }
    return out;
  }, [entries, records, debts, ethDebt, overrides]);
}
