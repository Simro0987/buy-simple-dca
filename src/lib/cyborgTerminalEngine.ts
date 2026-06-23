export type CyborgStateId = 1 | 2 | 3 | 4;

export type CyborgAction = 'DEPOSIT_BORROW' | 'HOLD' | 'REPAY_DEBT' | 'WITHDRAW';

export interface CyborgSliderDefaults {
  collateralPct: number;
  ltvPct: number;
}

export interface CyborgStateResult {
  state: CyborgStateId;
  action: CyborgAction;
  sliders: CyborgSliderDefaults;
  netYield: number;
  bannerSk: string;
  bannerEn: string;
  bannerClass: string;
}

export function computeNetYield(lbtcApy: number, usdcBorrowApy: number): number {
  return Math.round((lbtcApy - usdcBorrowApy) * 100) / 100;
}

/** 14-period RSI from close prices (weekly or daily). */
export function calcRsi14(closes: number[]): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  const slice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const delta = slice[i] - slice[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 99;
  return Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + avgGain / avgLoss))));
}

function state1Defaults(): CyborgSliderDefaults {
  return { collateralPct: 89, ltvPct: 40 };
}

function state2Defaults(): CyborgSliderDefaults {
  return { collateralPct: 50, ltvPct: 25 };
}

function state3Defaults(): CyborgSliderDefaults {
  return { collateralPct: 50, ltvPct: 0 };
}

function state4Defaults(): CyborgSliderDefaults {
  return { collateralPct: 0, ltvPct: 0 };
}

export function resolveCyborgState(
  fearGreed: number,
  btcRsi: number,
  netYield: number,
  manualLtv?: number,
): CyborgStateResult {
  const ltv = manualLtv ?? 0;

  if (fearGreed > 75 || btcRsi > 75) {
    return {
      state: 4,
      action: 'WITHDRAW',
      sliders: state4Defaults(),
      netYield,
      bannerClass: 'border-loss/60 bg-loss/10 text-loss',
      bannerSk: `🔴 EXTREME EUFÓRIA: Vysoké riziko korekcie. Net Yield je ${netYield.toFixed(2)}%. Splati 100 % dlhu a stiahni kolaterál.`,
      bannerEn: `🔴 EXTREME EUPHORIA: High correction risk. Net Yield is ${netYield.toFixed(2)}%. Repay 100% debt and withdraw collateral.`,
    };
  }

  if (netYield < 0 || ltv > 45) {
    return {
      state: 3,
      action: 'REPAY_DEBT',
      sliders: state3Defaults(),
      netYield: netYield,
      bannerClass: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
      bannerSk: `🟡 VAROVANIE: Borrow sadzby príliš vysoké / LTV kritické (${ltv > 45 ? `LTV ${ltv.toFixed(0)}%` : `Net Yield ${netYield.toFixed(2)}%`}). Splati USDC dlh okamžite.`,
      bannerEn: `🟡 WARNING: Borrow rates too high / LTV critical (${ltv > 45 ? `LTV ${ltv.toFixed(0)}%` : `Net Yield ${netYield.toFixed(2)}%`}). Repay USDC debt immediately.`,
    };
  }

  if (fearGreed < 40 && btcRsi < 45) {
    return {
      state: 1,
      action: 'DEPOSIT_BORROW',
      sliders: state1Defaults(),
      netYield: netYield,
      bannerClass: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200',
      bannerSk: `🟢 TRH V STRACHU (BUY SIGNAL): Net Yield je ${netYield.toFixed(2)}%. Nasadi max kolaterál a požičaj si USDC na nákup LBTC.`,
      bannerEn: `🟢 MARKET IN FEAR (BUY SIGNAL): Net Yield is ${netYield.toFixed(2)}%. Deploy max collateral and borrow USDC to buy LBTC.`,
    };
  }

  return {
    state: 2,
    action: 'HOLD',
    sliders: state2Defaults(),
    netYield: netYield,
    bannerClass: 'border-border/60 bg-muted/30 text-foreground',
    bannerSk: `⚪ TRH STABILNÝ: Net Yield je ${netYield.toFixed(2)}%. Nechaj výnos splácať dlh.`,
    bannerEn: `⚪ MARKET STABLE: Net Yield is ${netYield.toFixed(2)}%. Let the yield pay off the debt.`,
  };
}

export function computeMotorUsd(
  rEthQty: number,
  mSolQty: number,
  ethPrice: number,
  solPrice: number,
): number {
  return rEthQty * ethPrice + mSolQty * solPrice;
}

export function computeUsdcLoan(
  rEthQty: number,
  mSolQty: number,
  ethPrice: number,
  solPrice: number,
  collateralPct: number,
  ltvPct: number,
): number {
  const motorUsd = rEthQty * ethPrice + mSolQty * solPrice;
  const deployed = motorUsd * (collateralPct / 100);
  return deployed * (ltvPct / 100);
}
