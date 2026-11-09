/**
 * dynamicTargets — univerzálny výpočet cieľov pre vrstvy (Stake / Collateral).
 *
 * Základ pre VŠETKY percentá je Grand Total = Liquid + Staked + Collateral
 * (dlh sa neodpočítava, ide o reálne držané množstvo tokenu).
 *
 * Cieľ vrstvy sa vždy počíta ako ZVYŠOK, ktorý ešte treba doalokovať:
 *   Remaining = Grand Total * targetPct − alreadyAllocated
 * a navrhnutá suma nikdy nesmie prekročiť aktuálny Liquid zostatok.
 */

export interface LayerTarget {
  /** Celkový cieľ vrstvy v tokenoch. */
  target: number;
  /** Už alokované množstvo v tejto vrstve. */
  allocated: number;
  /** Zvyšok do cieľa (môže byť ≤ 0 keď je vrstva plne alokovaná). */
  remaining: number;
  /** Navrhnutá suma na exekúciu = min(remaining, liquid), nikdy < 0. */
  suggested: number;
  /** true keď už nie je čo alokovať. */
  fullyAllocated: boolean;
  /** true keď zvyšok existuje, ale Liquid zostatok naň nestačí. */
  liquidLimited: boolean;
}

const EPS = 1e-9;

export function grandTotalOf(layers: { liquid: number; staked: number; collateral: number }): number {
  return Math.max(0, layers.liquid + layers.staked + layers.collateral);
}

export function layerTarget(opts: {
  grandTotal: number;
  liquid: number;
  allocated: number;
  targetPct: number;
  /** Voliteľný strop na jednu exekúciu (napr. týždenná DCA tranža). */
  perActionCap?: number;
}): LayerTarget {
  const grandTotal = Math.max(0, opts.grandTotal);
  const liquid = Math.max(0, opts.liquid);
  const allocated = Math.max(0, opts.allocated);
  const target = grandTotal * (opts.targetPct / 100);
  const remaining = target - allocated;
  const capped = opts.perActionCap != null ? Math.min(remaining, Math.max(0, opts.perActionCap)) : remaining;
  const suggested = Math.max(0, Math.min(capped, liquid));
  return {
    target,
    allocated,
    remaining,
    suggested,
    fullyAllocated: remaining <= EPS,
    liquidLimited: remaining > EPS && liquid + EPS < Math.min(remaining, capped),
  };
}
