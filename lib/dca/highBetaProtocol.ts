import {
  computeBollingerBands,
  computeEma,
  computeRsi,
  computeSma,
  computeVolumeSma,
} from "@/lib/dca/indicators";
import type {
  HighBetaBtcData,
  HighBetaCheckItem,
  HighBetaChecklist,
  HighBetaEvaluation,
  HighBetaTokenData,
  OhlcvCandle,
} from "@/lib/dca/types";

export const HIGH_BETA_STEP0_REASON = "Makro Brána BTC zlyhala";

export async function checkUpcomingUnlocks(tokenSymbol: string): Promise<boolean> {
  // TODO: Connect to TokenUnlocks / Dropstab API for massive unlock detection
  void tokenSymbol;
  return false;
}

function pctChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return Number.NaN;
  }
  return ((current - previous) / previous) * 100;
}

function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "n/a";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}%`;
}

function touchedSupport(candle: OhlcvCandle, level: number): boolean {
  if (level <= 0) return false;
  const tolerance = level * 0.025;
  return candle.low <= level + tolerance && candle.high >= level - tolerance;
}

function bouncingFromSupports(
  daily: OhlcvCandle[],
  supports: number[],
): boolean {
  const recent = daily.slice(-8);
  if (recent.length === 0) return false;
  return recent.some((candle) =>
    supports.some(
      (level) =>
        touchedSupport(candle, level) && candle.close >= level * 0.985,
    ),
  );
}

function failEvaluation(
  reason: string,
  stepFailed: number,
  score: number,
  checklist: HighBetaChecklist,
): HighBetaEvaluation {
  return {
    approved: false,
    reason,
    stepFailed,
    score,
    checklist,
  };
}

function evaluateBtcMacro(btcData: HighBetaBtcData): {
  passed: boolean;
  items: HighBetaCheckItem[];
} {
  const price = btcData.price;
  const dailyCloses = btcData.dailyCandles.map((candle) => candle.close);
  const weeklyCloses = btcData.weeklyCandles.map((candle) => candle.close);
  const sma200w = computeSma(weeklyCloses, 200);
  const ema50d = computeEma(dailyCloses, 50);
  const rsi1w = computeRsi(weeklyCloses, 14);
  const close7d = btcData.dailyCandles[btcData.dailyCandles.length - 8]?.close ?? 0;
  const change7dPct = pctChange(price, close7d);

  const aOk = price > 0 && sma200w > 0 && price > sma200w;
  const aboveEma50 = price > 0 && ema50d > 0 && price > ema50d;
  const softPullback =
    Number.isFinite(change7dPct) && change7dPct >= -10 && rsi1w > 40;
  const bOk = aboveEma50 || softPullback;

  return {
    passed: aOk && bOk,
    items: [
      {
        id: "btc-sma200w",
        label: "BTC nad 200W SMA",
        passed: aOk,
        detail:
          sma200w <= 0
            ? "200W SMA nie je dostupná (potrebných 200 týždňov)"
            : `Cena ${price.toFixed(0)}$ vs SMA ${sma200w.toFixed(0)}$`,
      },
      {
        id: "btc-gate-b",
        label: "BTC nad 50D EMA alebo mäkký pullback",
        passed: bOk,
        detail: `EMA50 ${ema50d > 0 ? ema50d.toFixed(0) + "$" : "n/a"} · 7d ${formatPct(change7dPct)} · RSI 1W ${rsi1w > 0 ? rsi1w.toFixed(1) : "n/a"}`,
      },
    ],
  };
}

function evaluateAntiFomo(tokenData: HighBetaTokenData): {
  passed: boolean;
  reason: string;
  items: HighBetaCheckItem[];
} {
  const { price, dailyCandles, upcomingUnlock } = tokenData;
  const close30d = dailyCandles[dailyCandles.length - 31]?.close ?? 0;
  const change30dPct = pctChange(price, close30d);
  const hasChangeData = Number.isFinite(change30dPct);
  const notParabolic = hasChangeData && change30dPct <= 80;
  const noUnlock = upcomingUnlock === false;

  const items: HighBetaCheckItem[] = [
    {
      id: "fast-growth",
      label: "Rýchlosť rastu (Max +80% za 30 dní)",
      passed: notParabolic,
      detail: !hasChangeData
        ? "Chýba close pred 30 dňami"
        : `Zmena ${formatPct(change30dPct)} (limit ≤ +80%)`,
    },
    {
      id: "unlocks",
      label: "Tokenomika (Žiadne masívne unlocky)",
      passed: noUnlock,
      detail: noUnlock
        ? "Žiadny masívny unlock"
        : "Detekovaný nadchádzajúci veľký unlock",
    },
  ];

  let reason = "";
  if (!notParabolic) {
    reason = hasChangeData
      ? "Anti-FOMO: Príliš rýchly rast"
      : "Anti-FOMO: Nedostatok denných dát";
  } else if (!noUnlock) {
    reason = "Anti-FOMO: Nadchádzajúci veľký unlock";
  }

  return {
    passed: notParabolic && noUnlock,
    reason,
    items,
  };
}

function evaluateTechnicalScore(tokenData: HighBetaTokenData): {
  score: number;
  items: HighBetaCheckItem[];
} {
  const daily = tokenData.dailyCandles;
  const weekly = tokenData.weeklyCandles;
  const dailyCloses = daily.map((candle) => candle.close);
  const weeklyCloses = weekly.map((candle) => candle.close);
  const volumes = daily.map((candle) => candle.volume);
  const price = tokenData.price;

  const ema50 = computeEma(dailyCloses, 50);
  const sma200 = computeSma(dailyCloses, 200);
  const bands = computeBollingerBands(dailyCloses, 20, 2);
  const volumeSma20 = computeVolumeSma(volumes, 20);
  const rsi1d = computeRsi(dailyCloses, 14);
  const rsi1w = computeRsi(weeklyCloses, 14);
  const volume24h =
    tokenData.volume24h > 0
      ? tokenData.volume24h
      : (daily[daily.length - 1]?.volume ?? 0);

  const supports = [bands?.lower ?? 0, sma200, ema50].filter((level) => level > 0);
  const bounced = bouncingFromSupports(daily, supports);
  const aboveEmaFloor = ema50 > 0 && price > 0.95 * ema50;
  const point1 = bounced && aboveEmaFloor;

  const point2 = volumeSma20 > 0 && volume24h >= 1.3 * volumeSma20;

  let point3 = false;
  if (rsi1d > 65) {
    point3 = false;
  } else {
    point3 = rsi1d >= 35 && rsi1d <= 55 && rsi1w > 0 && rsi1w < 60;
  }

  const volumeRatio = volumeSma20 > 0 ? volume24h / volumeSma20 : 0;

  const items: HighBetaCheckItem[] = [
    {
      id: "trend-support",
      label: "Trend a support (odraz)",
      passed: point1,
      detail: `Odraz od BB/SMA200/EMA50: ${bounced ? "áno" : "nie"} · cena vs 0.95×EMA50: ${aboveEmaFloor ? "OK" : "pod"}`,
    },
    {
      id: "bounce-volume",
      label: "Objem pri odraze",
      passed: point2,
      detail:
        volumeSma20 <= 0
          ? "20D SMA objemu nie je dostupné"
          : `24h objem ${volumeRatio.toFixed(2)}× 20D priemeru (limit ≥ 1.3×)`,
    },
    {
      id: "rsi-window",
      label: "RSI denný / týždenný",
      passed: point3,
      detail: `RSI 1D ${rsi1d > 0 ? rsi1d.toFixed(1) : "n/a"} (35–55, >65 = 0) · RSI 1W ${rsi1w > 0 ? rsi1w.toFixed(1) : "n/a"} (<60)`,
    },
  ];

  const score = (point1 ? 1 : 0) + (point2 ? 1 : 0) + (point3 ? 1 : 0);
  return { score, items };
}

export function evaluateHighBetaToken(
  tokenData: HighBetaTokenData,
  btcData: HighBetaBtcData,
): HighBetaEvaluation {
  const step0 = evaluateBtcMacro(btcData);
  const step1 = evaluateAntiFomo(tokenData);
  const step2 = evaluateTechnicalScore(tokenData);

  const checklist: HighBetaChecklist = {
    step0: {
      passed: step0.passed,
      label: "Makro Brána BTC",
      items: step0.items,
    },
    step1: {
      passed: step1.passed,
      label: "Anti-FOMO",
      items: step1.items,
    },
    step2: {
      passed: step2.score >= 2,
      label: "Technické skóre",
      score: step2.score,
      items: step2.items,
    },
  };

  if (!step0.passed) {
    return failEvaluation(HIGH_BETA_STEP0_REASON, 0, step2.score, checklist);
  }
  if (!step1.passed) {
    return failEvaluation(step1.reason, 1, step2.score, checklist);
  }
  if (step2.score < 2) {
    return failEvaluation(
      `Technické skóre ${step2.score}/3 — potrebných minimálne 2`,
      2,
      step2.score,
      checklist,
    );
  }

  return {
    approved: true,
    reason: "",
    stepFailed: null,
    score: step2.score,
    checklist,
  };
}
