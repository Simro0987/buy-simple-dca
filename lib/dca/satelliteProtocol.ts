import { computeRsi, computeSma } from "@/lib/dca/indicators";
import type {
  HighBetaBtcData,
  HighBetaCheckItem,
  SatelliteChecklist,
  SatelliteEvaluation,
  SatelliteTokenData,
} from "@/lib/dca/types";

export const SATELLITE_STEP0_REASON = "Záchranná brzda: BTC pod 200W SMA.";
const LINK_SYMBOL = "LINK";

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

function failEvaluation(
  reason: string,
  stepFailed: number,
  checklist: SatelliteChecklist,
): SatelliteEvaluation {
  return {
    approved: false,
    reason,
    stepFailed,
    checklist,
  };
}

function evaluateBearWinterBrake(btcData: HighBetaBtcData): {
  passed: boolean;
  items: HighBetaCheckItem[];
} {
  const price = btcData.price;
  const weeklyCloses = btcData.weeklyCandles.map((candle) => candle.close);
  const sma200w = computeSma(weeklyCloses, 200);
  const passed = price > 0 && sma200w > 0 && price > sma200w;

  return {
    passed,
    items: [
      {
        id: "btc-sma200w",
        label: "Záchranná brzda BTC (Nad 200W SMA)",
        passed,
        detail:
          sma200w <= 0
            ? "200W SMA nie je dostupná (potrebných 200 týždňov)"
            : `Cena ${price.toFixed(0)}$ vs SMA ${sma200w.toFixed(0)}$`,
      },
    ],
  };
}

function evaluateEuphoriaBrake(
  tokenSymbol: string,
  tokenData: SatelliteTokenData,
): {
  passed: boolean;
  skipped: boolean;
  reason: string;
  items: HighBetaCheckItem[];
} {
  if (tokenSymbol.toUpperCase() === LINK_SYMBOL) {
    return {
      passed: true,
      skipped: true,
      reason: "",
      items: [
        {
          id: "link-exception",
          label: "Výnimka udelená",
          passed: true,
          detail: "Preskočené — LINK ide do štandardného DCA bez brzdy eufórie.",
        },
      ],
    };
  }

  const dailyCloses = tokenData.dailyCandles.map((candle) => candle.close);
  const weeklyCloses = tokenData.weeklyCandles.map((candle) => candle.close);
  const hasDailyRsi = dailyCloses.length >= 15;
  const hasWeeklyRsi = weeklyCloses.length >= 15;
  const rsi1d = hasDailyRsi ? computeRsi(dailyCloses, 14) : 0;
  const rsi1w = hasWeeklyRsi ? computeRsi(weeklyCloses, 14) : 0;
  const close30d = tokenData.dailyCandles[tokenData.dailyCandles.length - 31]?.close ?? 0;
  const change30dPct = pctChange(tokenData.price, close30d);
  const hasChangeData = Number.isFinite(change30dPct);

  const dailyRsiOk = hasDailyRsi && rsi1d <= 65;
  const weeklyRsiOk = hasWeeklyRsi && rsi1w <= 65;
  const conditionA = dailyRsiOk && weeklyRsiOk;
  const conditionB = hasChangeData && change30dPct < 50;

  const items: HighBetaCheckItem[] = [
    {
      id: "rsi-cap",
      label: "Brzda Eufórie (Max RSI 65)",
      passed: conditionA,
      detail:
        !hasDailyRsi || !hasWeeklyRsi
          ? "Nedostatok RSI dát (1D / 1W)"
          : `RSI 1D ${rsi1d.toFixed(1)} · RSI 1W ${rsi1w.toFixed(1)} (limit ≤ 65)`,
    },
    {
      id: "growth-cap",
      label: "Brzda Eufórie (Rast < 50%)",
      passed: conditionB,
      detail: !hasChangeData
        ? "Chýba close pred 30 dňami"
        : `Zmena ${formatPct(change30dPct)} (limit < +50%)`,
    },
  ];

  let reason = "";
  if (!conditionA) {
    if (hasDailyRsi && rsi1d > 65) {
      reason = "Brzda Eufórie: Denné RSI nad 65.";
    } else if (hasWeeklyRsi && rsi1w > 65) {
      reason = "Brzda Eufórie: Týždenné RSI nad 65.";
    } else {
      reason = "Brzda Eufórie: Denné RSI nad 65.";
    }
  } else if (!conditionB) {
    reason = "Brzda Eufórie: Rýchly rast nad 50%.";
  }

  return {
    passed: conditionA && conditionB,
    skipped: false,
    reason,
    items,
  };
}

export function evaluateSatelliteToken(
  tokenSymbol: string,
  tokenData: SatelliteTokenData,
  btcData: HighBetaBtcData,
): SatelliteEvaluation {
  const step0 = evaluateBearWinterBrake(btcData);
  const step1 = evaluateEuphoriaBrake(tokenSymbol, tokenData);

  const checklist: SatelliteChecklist = {
    step0: {
      passed: step0.passed,
      label: "Záchranná brzda BTC (Nad 200W SMA)",
      items: step0.items,
    },
    step1: {
      passed: step1.passed,
      skipped: step1.skipped,
      label: "Brzda Eufórie (Max RSI 65, Rast < 50%)",
      items: step1.items,
    },
  };

  if (!step0.passed) {
    return failEvaluation(SATELLITE_STEP0_REASON, 0, checklist);
  }
  if (!step1.passed && !step1.skipped) {
    return failEvaluation(step1.reason, 1, checklist);
  }

  return {
    approved: true,
    reason: "",
    stepFailed: null,
    checklist,
  };
}
