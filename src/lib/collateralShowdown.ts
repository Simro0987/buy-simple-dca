// ============================================================================
// Collateral Showdown — rETH vs wstETH pre Smart Leverage (DeFi Saver)
// Skóre = Net Carry (Yield − Borrow APY) − Depeg penalizácia − Likvidita penalizácia
// 100% free data: DefiLlama yields (borrow APY), on-chain vs market ratio (depeg).
// ============================================================================

export type CollateralSymbol = 'rETH' | 'wstETH';

export interface CollateralCandidate {
  symbol: CollateralSymbol;
  /** Staking APY tokenu (%) */
  yieldApy: number;
  /** Aave v3 WETH variable borrow APY (%) */
  borrowApy: number;
  /** Odchýlka trhovej ceny od on-chain kurzu v % (absolútna) */
  depegPct: number;
  /** Likviditná penalizácia v bodoch skóre (hlbšia likvidita = menšia) */
  liquidityPenalty: number;
  /** Net carry pri danom LTV (%) */
  netCarry: number;
  /** Výsledné skóre (vyššie = lepšie) */
  score: number;
}

export interface ShowdownResult {
  winner: CollateralCandidate;
  loser: CollateralCandidate;
  /** Cieľové LTV v % (28–37), hard cap 65 */
  targetLtv: number;
  /** Efektívne APY na vlastný kapitál pri cieľovom LTV */
  leveragedApy: number;
  reasons: string[];
}

export const LTV_MIN = 28;
export const LTV_MAX = 37;
export const LTV_HARD_CAP = 65;

const BORROW_FALLBACK = 2.6;
const AAVE_WETH_POOL = '825688c0-c694-4a6b-8497-177e425b7348';

/** Aave v3 WETH variable borrow APY (Ethereum) z DefiLlama. */
export async function fetchWethBorrowApy(): Promise<{ apy: number; source: 'live' | 'fallback' }> {
  try {
    const r = await Promise.race([
      fetch('https://yields.llama.fi/pools').then(x => x.json()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pools: any[] = (r as any)?.data ?? [];
    const p = pools.find(x => x.pool === AAVE_WETH_POOL);
    const apy = Number(p?.apyBaseBorrow);
    if (Number.isFinite(apy) && apy > 0) return { apy, source: 'live' };
  } catch { /* ignore */ }
  return { apy: BORROW_FALLBACK, source: 'fallback' };
}

/** Absolútna odchýlka trhového kurzu od on-chain kurzu (%). */
export function depegPct(marketRatio: number, onChainRatio: number): number {
  if (!Number.isFinite(marketRatio) || !Number.isFinite(onChainRatio) || onChainRatio <= 0 || marketRatio <= 0) return 0;
  return Math.abs(marketRatio / onChainRatio - 1) * 100;
}

/** Plynulé cieľové LTV: čím lepší net carry a nižší depeg, tým bližšie k LTV_MAX. */
function computeTargetLtv(netCarry: number, depeg: number): number {
  const carryFactor = Math.max(0, Math.min(1, netCarry / 1.5));      // 0 % → 0, 1.5 %+ → 1
  const depegFactor = Math.max(0, Math.min(1, 1 - depeg / 1.0));      // 0 % → 1, 1 %+ → 0
  const t = carryFactor * 0.65 + depegFactor * 0.35;
  const ltv = LTV_MIN + (LTV_MAX - LTV_MIN) * t;
  return Math.min(LTV_HARD_CAP, Math.max(LTV_MIN, ltv));
}

interface Input {
  rEthApy: number;
  wstEthApy: number;
  borrowApy: number;
  rEthDepegPct: number;
  wstEthDepegPct: number;
}

export function runCollateralShowdown(i: Input): ShowdownResult {
  const build = (
    symbol: CollateralSymbol, yieldApy: number, depeg: number, liquidityPenalty: number,
  ): CollateralCandidate => {
    const netCarry = yieldApy - i.borrowApy;
    const score = netCarry * 10 - depeg * 6 - liquidityPenalty;
    return { symbol, yieldApy, borrowApy: i.borrowApy, depegPct: depeg, liquidityPenalty, netCarry, score };
  };

  // wstETH má hlbšiu likviditu a vyššie Aave limity → menšia penalizácia.
  const wst = build('wstETH', i.wstEthApy, i.wstEthDepegPct, 0);
  const reth = build('rETH', i.rEthApy, i.rEthDepegPct, 1.5);

  const [winner, loser] = wst.score >= reth.score ? [wst, reth] : [reth, wst];
  const targetLtv = computeTargetLtv(winner.netCarry, winner.depegPct);
  const leveragedApy = winner.yieldApy + (winner.netCarry * targetLtv) / 100;

  const reasons = [
    `Net carry ${winner.symbol}: ${winner.yieldApy.toFixed(2)} % yield − ${i.borrowApy.toFixed(2)} % borrow = ${winner.netCarry >= 0 ? '+' : ''}${winner.netCarry.toFixed(2)} % (${loser.symbol}: ${loser.netCarry >= 0 ? '+' : ''}${loser.netCarry.toFixed(2)} %).`,
    `Depeg riziko: ${winner.symbol} ${winner.depegPct.toFixed(2)} % vs ${loser.symbol} ${loser.depegPct.toFixed(2)} % (penalizácia ×6 v skóre).`,
    winner.symbol === 'wstETH'
      ? 'Likvidita: wstETH má najhlbšie Aave/DeFi Saver trhy → nižšie sklzy pri unwinde.'
      : 'rETH vyhralo napriek nižšej likvidite (penalizácia −1.5 bodu) — carry rozdiel je dostatočný.',
    `Cieľové LTV ${targetLtv.toFixed(1)} % (rozsah ${LTV_MIN}–${LTV_MAX} %, hard cap ${LTV_HARD_CAP} %) → efektívne ${leveragedApy.toFixed(2)} % APY.`,
  ];

  return { winner, loser, targetLtv, leveragedApy, reasons };
}
