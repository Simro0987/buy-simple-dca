// ─────────────────────────────────────────────────────────────
// SAFETY ACTIVE BRAKE & BOOST ENGINE
// Aplikuje 5-stupňový multiplier VÝHRADNE na finálnu Market (MKT)
// alokáciu tokenu. Limit (LMT) hodnoty zostávajú nedotknuté.
// Capital Pipeline (macro) logika sa nemení — toto je post-processing.
// ─────────────────────────────────────────────────────────────

export type BrakeBoostMode = 'STOP' | 'REDUCE' | 'NORMAL' | 'BOOST' | 'DEEP_BOOST';

export const MODE_MULTIPLIER: Record<BrakeBoostMode, number> = {
  STOP: 0,
  REDUCE: 0.5,
  NORMAL: 1,
  BOOST: 1.5,
  DEEP_BOOST: 2,
};

export const MODE_LABEL: Record<BrakeBoostMode, string> = {
  STOP: 'STOP · nákup zastavený',
  REDUCE: 'REDUCE · znížený nákup',
  NORMAL: 'NORMAL · štandardný nákup',
  BOOST: 'BOOST · zvýšený nákup',
  DEEP_BOOST: 'DEEP BOOST · maximálny nákup',
};

/** Tokeny riadené týmto engine-om. */
export type BrakeBoostToken = 'btc' | 'eth' | 'sol' | 'link' | 'aave' | 'hype';

export interface TokenIndicators {
  /** RSI(14) na dennom timeframe. */
  rsi14: number;
  /** Spotová cena. */
  price: number;
  /** 200D MA (SMA200). */
  ma200: number;
}

export interface TokenRuleSet {
  stopRsi: number;        // STOP if RSI > stopRsi AND distPct > stopDistPct
  stopDistPct: number;
  reduceRsiLow: number;   // REDUCE if RSI in [reduceRsiLow, reduceRsiHigh] OR distPct > reduceDistPct
  reduceRsiHigh: number;
  reduceDistPct: number;
  boostRsi: number;       // BOOST if RSI < boostRsi AND price < ma200
  deepRsi: number;        // DEEP if RSI < deepRsi OR distPct < deepDrawdownPct
  deepDrawdownPct: number;
}

export const TOKEN_RULES: Record<BrakeBoostToken, TokenRuleSet> = {
  btc: { stopRsi: 80, stopDistPct: 40, reduceRsiLow: 70, reduceRsiHigh: 80, reduceDistPct: 25, boostRsi: 40, deepRsi: 30, deepDrawdownPct: -20 },
  eth: { stopRsi: 78, stopDistPct: 50, reduceRsiLow: 68, reduceRsiHigh: 78, reduceDistPct: 30, boostRsi: 38, deepRsi: 28, deepDrawdownPct: -25 },
  sol: { stopRsi: 78, stopDistPct: 60, reduceRsiLow: 68, reduceRsiHigh: 78, reduceDistPct: 35, boostRsi: 35, deepRsi: 25, deepDrawdownPct: -30 },
  link: { stopRsi: 75, stopDistPct: 45, reduceRsiLow: 65, reduceRsiHigh: 75, reduceDistPct: 25, boostRsi: 38, deepRsi: 28, deepDrawdownPct: -25 },
  aave: { stopRsi: 75, stopDistPct: 45, reduceRsiLow: 65, reduceRsiHigh: 75, reduceDistPct: 25, boostRsi: 38, deepRsi: 28, deepDrawdownPct: -25 },
  hype: { stopRsi: 75, stopDistPct: 60, reduceRsiLow: 65, reduceRsiHigh: 75, reduceDistPct: 35, boostRsi: 35, deepRsi: 25, deepDrawdownPct: -35 },
};

export interface BrakeBoostState {
  token: BrakeBoostToken | string;
  mode: BrakeBoostMode;
  multiplier: number;
  rsi14: number;
  /** Odchýlka ceny od 200D MA v % (kladné = nad MA). */
  ma200DistPct: number;
  /** Dáta boli dostupné a vyhodnotené. */
  evaluated: boolean;
  reason: string;
}

/** Percentuálna odchýlka ceny od 200D MA. */
export function ma200Distance(price: number, ma200: number): number {
  if (!(price > 0) || !(ma200 > 0)) return 0;
  return ((price - ma200) / ma200) * 100;
}

/**
 * Vyhodnotí režim tokenu. Priorita: DEEP_BOOST → BOOST → STOP → REDUCE → NORMAL,
 * pričom prehriate podmienky (STOP/REDUCE) sa testujú pred podchladenými len ak
 * RSI nie je v boost zóne — obidve sady sú vzájomne vylučujúce v praxi.
 */
export function evaluateBrakeBoost(
  token: BrakeBoostToken | string,
  ind: TokenIndicators | null | undefined,
): BrakeBoostState {
  // Dynamicky pridané satelity (z Portfólia) nemajú vlastný ruleset →
  // použijú sa konzervatívne pravidlá ako pre AAVE.
  const r = TOKEN_RULES[token as BrakeBoostToken] ?? TOKEN_RULES.aave;
  if (!ind || !(ind.price > 0) || !(ind.ma200 > 0) || !Number.isFinite(ind.rsi14)) {
    return {
      token, mode: 'NORMAL', multiplier: 1, rsi14: ind?.rsi14 ?? 0,
      ma200DistPct: 0, evaluated: false,
      reason: 'Chýbajú indikátory (RSI/200D MA) → NORMAL 100 %.',
    };
  }

  const rsi = ind.rsi14;
  const dist = ma200Distance(ind.price, ind.ma200);
  const belowMa = ind.price < ind.ma200;

  const mk = (mode: BrakeBoostMode, reason: string): BrakeBoostState => ({
    token, mode, multiplier: MODE_MULTIPLIER[mode], rsi14: rsi,
    ma200DistPct: dist, evaluated: true, reason,
  });

  // Prehriatie
  if (rsi > r.stopRsi && dist > r.stopDistPct) {
    return mk('STOP', `RSI ${rsi.toFixed(0)} > ${r.stopRsi} a cena ${dist.toFixed(1)} % nad 200D MA (> ${r.stopDistPct} %) → MKT 0 %.`);
  }
  if ((rsi >= r.reduceRsiLow && rsi <= r.reduceRsiHigh) || dist > r.reduceDistPct) {
    return mk('REDUCE', `RSI ${rsi.toFixed(0)} v zóne ${r.reduceRsiLow}–${r.reduceRsiHigh} alebo cena ${dist.toFixed(1)} % nad 200D MA (> ${r.reduceDistPct} %) → MKT 50 %.`);
  }

  // Podchladenie
  if (rsi < r.deepRsi || dist < r.deepDrawdownPct) {
    return mk('DEEP_BOOST', `RSI ${rsi.toFixed(0)} < ${r.deepRsi} alebo drawdown ${dist.toFixed(1)} % pod 200D MA (< ${r.deepDrawdownPct} %) → MKT 200 %.`);
  }
  if (rsi < r.boostRsi && belowMa) {
    return mk('BOOST', `RSI ${rsi.toFixed(0)} < ${r.boostRsi} a cena pod 200D MA (${dist.toFixed(1)} %) → MKT 150 %.`);
  }

  return mk('NORMAL', `RSI ${rsi.toFixed(0)} · ${dist.toFixed(1)} % voči 200D MA → MKT 100 %.`);
}

// ─────────────────────────────────────────────────────────────
// APLIKÁCIA NA ALOKÁCIE + CAPITAL FLOW
// ─────────────────────────────────────────────────────────────

export interface TokenAllocationInput {
  token: BrakeBoostToken;
  /** USD suma určená na Market nákup z Capital Pipeline. */
  marketUsd: number;
  /** USD suma určená na Limit nákup — NIKDY sa nemení. */
  limitUsd: number;
  indicators?: TokenIndicators | null;
}

export interface TokenAllocationResult extends BrakeBoostState {
  /** Pôvodná MKT suma z pipeline. */
  baseMarketUsd: number;
  /** MKT suma po multiplieri a capital-flow presune. */
  marketUsd: number;
  /** Nedotknutá LMT suma. */
  limitUsd: number;
  /** Suma uvolnená STOP/REDUCE a presunutá do BTC MKT (len alty). */
  redirectedOutUsd: number;
  /** Suma prijatá z altov (len BTC). */
  redirectedInUsd: number;
}

export interface BrakeBoostResult {
  tokens: Record<string, TokenAllocationResult>;
  list: TokenAllocationResult[];
  /** Celková MKT suma z pipeline pred engine-om. */
  basePipelineMarketUsd: number;
  /** Celková MKT suma po engine-e (môže byť > base pri BOOST). */
  totalMarketUsd: number;
  /** Suma presmerovaná z altov do BTC. */
  totalRedirectedUsd: number;
  /** Interný vyrovnávací fond: uvoľnené REDUCE/STOP prostriedky mínus extra potrebné pre BOOST/DEEP_BOOST. */
  bonusPoolUsd: number;
  /** Deficit bonus_poolu dočerpaný z Hotovostnej rezervy (kladné číslo; 0 = žiadny deficit). */
  cashReserveDrawUsd: number;
  /** MSTR príjem do poolu (REDUCE / zamietnutie). */
  proxyFreedUsd: number;
  /** MSTR DEEP BOOST krytý z bonus_poolu. */
  proxyBoostFromPoolUsd: number;
  /** MSTR DEEP BOOST krytý z Hotovostnej rezervy. */
  proxyBoostFromReserveUsd: number;
  /** Dodatočná suma pridaná do BTC, aby BTC ≥ 50 % aktívnej pipeline. */
  btcFloorTopUpUsd: number;
  /** Podiel BTC na celkovej MKT sume (0..1). */
  btcSharePct: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aplikuje multipliery na MKT alokácie, presmeruje nevyužitý alt kapitál do BTC MKT
 * a zaručí, že BTC MKT ≥ 50 % aktívnej pipeline sumy.
 *
 * Limit (LMT) hodnoty prechádzajú bez zmeny.
 */
export interface ProxyPoolInput {
  /** MSTR REDUCE (50 %) alebo zamietnutý rozpočet → príjem do bonus_poolu. */
  freedUsd: number;
  /** MSTR DEEP BOOST (150 %) extra fiat → čerpanie z bonus_poolu, deficit z rezervy. */
  boostUsd: number;
}

export function applyBrakeBoost(inputs: TokenAllocationInput[], proxy?: ProxyPoolInput): BrakeBoostResult {
  const basePipelineMarketUsd = inputs.reduce((s, i) => s + Math.max(0, i.marketUsd || 0), 0);

  const results: TokenAllocationResult[] = inputs.map(i => {
    const state = evaluateBrakeBoost(i.token, i.indicators);
    const base = Math.max(0, i.marketUsd || 0);
    const scaled = base * state.multiplier;
    // Presmerovanie sa robí len pri znížení (STOP/REDUCE) a len pre alty.
    const freed = i.token === 'btc' ? 0 : Math.max(0, base - scaled);
    return {
      ...state,
      baseMarketUsd: round2(base),
      marketUsd: round2(scaled),
      limitUsd: i.limitUsd,
      redirectedOutUsd: round2(freed),
      redirectedInUsd: 0,
    };
  });

  const btc = results.find(r => r.token === 'btc');
  const totalRedirectedUsd = round2(results.reduce((s, r) => s + r.redirectedOutUsd, 0));

  // ── BONUS POOL (interné vyváženie) ─────────────────────────
  // 1) REDUCE/STOP uvoľní kapitál do bonus_poolu.
  // 2) BOOST/DEEP_BOOST si z poolu berie extra fiat potrebný na navýšenie MKT.
  // 3) Prebytok (pool > 0) ide do CORE (BTC).
  // 4) Deficit (pool < 0) sa kryje z Hotovostnej rezervy — boost sumy ostávajú zachované.
  const boostExtraUsd = round2(results.reduce((s, r) => {
    const extra = Math.max(0, r.marketUsd - r.baseMarketUsd);
    return r.token === 'btc' ? s : s + extra;
  }, 0));
  const proxyFreed = Math.max(0, proxy?.freedUsd ?? 0);
  const proxyBoost = Math.max(0, proxy?.boostUsd ?? 0);
  const poolBeforeProxyBoost = totalRedirectedUsd + proxyFreed - boostExtraUsd;
  const proxyBoostFromPoolUsd = round2(Math.min(proxyBoost, Math.max(0, poolBeforeProxyBoost)));
  const proxyBoostFromReserveUsd = round2(proxyBoost - proxyBoostFromPoolUsd);
  const bonusPoolUsd = round2(poolBeforeProxyBoost - proxyBoost);
  const cashReserveDrawUsd = bonusPoolUsd < 0 ? round2(-bonusPoolUsd) : 0;
  const poolSurplusUsd = bonusPoolUsd > 0 ? bonusPoolUsd : 0;

  let btcFloorTopUpUsd = 0;
  if (btc) {
    // 1) prijmi len PREBYTOK bonus poolu (deficit kryje rezerva, nie BTC)
    btc.redirectedInUsd = poolSurplusUsd;
    btc.marketUsd = round2(btc.marketUsd + poolSurplusUsd);

    // 2) BTC floor — vždy ≥ 50 % aktívnej pipeline sumy
    const activePipeline = Math.max(basePipelineMarketUsd, results.reduce((s, r) => s + r.marketUsd, 0));
    const floor = activePipeline * 0.5;
    if (btc.marketUsd < floor) {
      btcFloorTopUpUsd = round2(floor - btc.marketUsd);
      btc.marketUsd = round2(floor);
    }
  }

  const totalMarketUsd = round2(results.reduce((s, r) => s + r.marketUsd, 0));
  const tokens: Record<string, TokenAllocationResult> = {};
  for (const r of results) tokens[r.token] = r;

  return {
    tokens,
    list: results,
    basePipelineMarketUsd: round2(basePipelineMarketUsd),
    totalMarketUsd,
    totalRedirectedUsd,
    bonusPoolUsd,
    cashReserveDrawUsd,
    btcFloorTopUpUsd,
    proxyFreedUsd: round2(proxyFreed),
    proxyBoostFromPoolUsd,
    proxyBoostFromReserveUsd,
    btcSharePct: totalMarketUsd > 0 ? (btc?.marketUsd ?? 0) / totalMarketUsd : 0,
  };
}
