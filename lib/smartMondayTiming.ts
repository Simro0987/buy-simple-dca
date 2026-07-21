import { computeRsi14 } from "@/lib/dcaTechnicalIndicators";

export const MONDAY_PUMP_THRESHOLD_PCT = 3;
export const MONDAY_RSI_OVERBOUGHT = 75;
export const MONDAY_DEFER_HOURS_MIN = 4;
export const MONDAY_DEFER_HOURS_MAX = 12;

const DEFER_STORAGE_KEY = "edge-trader-monday-timing-defer";
const BINANCE_KLINES = "https://data-api.binance.vision/api/v3/klines";

export interface MondayTimingIndicators {
  btcChange1hPct: number;
  btcChange4hPct: number;
  ethChange1hPct: number;
  ethChange4hPct: number;
  btcRsi14: number;
  ethRsi14: number;
}

export interface MondayTimingEvaluation {
  isMonday: boolean;
  indicators: MondayTimingIndicators;
  pumpAnomaly: boolean;
  rsiBlocked: boolean;
  isGreenLight: boolean;
  deferredUntil: string | null;
  message: string;
  status: "ready" | "waiting" | "idle";
}

type RawKline = [number, string, string, string, string, string, ...unknown[]];

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number,
): Promise<RawKline[]> {
  const url = `${BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as RawKline[];
}

function intervalChangePct(klines: RawKline[]): number {
  if (klines.length < 2) return 0;
  const prev = parseFloat(klines[klines.length - 2][4]);
  const curr = parseFloat(klines[klines.length - 1][4]);
  if (prev <= 0) return 0;
  return Math.round((((curr - prev) / prev) * 100) * 100) / 100;
}

export function isMondayLocal(date = new Date()): boolean {
  return date.getDay() === 1;
}

export function readMondayDeferUntil(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DEFER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeMondayDeferUntil(iso: string | null): void {
  if (typeof window === "undefined") return;
  if (!iso) {
    localStorage.removeItem(DEFER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(DEFER_STORAGE_KEY, iso);
}

export function computeMondayDeferUntil(now = new Date()): string {
  const hours =
    MONDAY_DEFER_HOURS_MIN +
    Math.floor(
      Math.random() * (MONDAY_DEFER_HOURS_MAX - MONDAY_DEFER_HOURS_MIN + 1),
    );
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export async function fetchMondayTimingIndicators(): Promise<MondayTimingIndicators> {
  const [btc1h, btc4h, eth1h, eth4h, btcDaily, ethDaily] = await Promise.all([
    fetchKlines("BTCUSDT", "1h", 2),
    fetchKlines("BTCUSDT", "4h", 2),
    fetchKlines("ETHUSDT", "1h", 2),
    fetchKlines("ETHUSDT", "4h", 2),
    fetchKlines("BTCUSDT", "1d", 20),
    fetchKlines("ETHUSDT", "1d", 20),
  ]);

  const btcCloses = btcDaily.map((k) => parseFloat(k[4]));
  const ethCloses = ethDaily.map((k) => parseFloat(k[4]));

  return {
    btcChange1hPct: intervalChangePct(btc1h),
    btcChange4hPct: intervalChangePct(btc4h),
    ethChange1hPct: intervalChangePct(eth1h),
    ethChange4hPct: intervalChangePct(eth4h),
    btcRsi14: btcCloses.length >= 16 ? Math.round(computeRsi14(btcCloses) * 10) / 10 : 50,
    ethRsi14: ethCloses.length >= 16 ? Math.round(computeRsi14(ethCloses) * 10) / 10 : 50,
  };
}

export function evaluateMondayTiming(
  indicators: MondayTimingIndicators,
  options?: { now?: Date; deferredUntil?: string | null },
): MondayTimingEvaluation {
  const now = options?.now ?? new Date();
  const isMonday = isMondayLocal(now);
  const deferredUntil = options?.deferredUntil ?? null;

  const pumpAnomaly =
    indicators.btcChange1hPct > MONDAY_PUMP_THRESHOLD_PCT ||
    indicators.btcChange4hPct > MONDAY_PUMP_THRESHOLD_PCT ||
    indicators.ethChange1hPct > MONDAY_PUMP_THRESHOLD_PCT ||
    indicators.ethChange4hPct > MONDAY_PUMP_THRESHOLD_PCT;

  const rsiBlocked =
    indicators.btcRsi14 > MONDAY_RSI_OVERBOUGHT ||
    indicators.ethRsi14 > MONDAY_RSI_OVERBOUGHT;

  if (!isMonday) {
    return {
      isMonday: false,
      indicators,
      pumpAnomaly,
      rsiBlocked,
      isGreenLight: true,
      deferredUntil: null,
      status: "idle",
      message: "Plánovaný DCA nákup: pondelok. Smart Timing Engine sleduje trh v pondelok ráno.",
    };
  }

  const deferActive =
    deferredUntil != null && new Date(deferredUntil).getTime() > now.getTime();

  if (deferActive) {
    if (!pumpAnomaly && !rsiBlocked) {
      writeMondayDeferUntil(null);
      return {
        isMonday: true,
        indicators,
        pumpAnomaly: false,
        rsiBlocked: false,
        isGreenLight: true,
        deferredUntil: null,
        status: "ready",
        message: "Teraz je ten správny čas!",
      };
    }

    return {
      isMonday: true,
      indicators,
      pumpAnomaly,
      rsiBlocked,
      isGreenLight: false,
      deferredUntil,
      status: "waiting",
      message:
        "Tento pondelok nie je správny čas na nákup (trhová anomália / vysoká volatilita). Čakáme na optimálne okno...",
    };
  }

  if (pumpAnomaly || rsiBlocked) {
    const nextDefer = computeMondayDeferUntil(now);
    writeMondayDeferUntil(nextDefer);
    const reason = pumpAnomaly
      ? "FOMO pumpa (+3 % za 1h/4h)"
      : `RSI prekúpené (BTC ${indicators.btcRsi14}, ETH ${indicators.ethRsi14})`;

    return {
      isMonday: true,
      indicators,
      pumpAnomaly,
      rsiBlocked,
      isGreenLight: false,
      deferredUntil: nextDefer,
      status: "waiting",
      message: `Tento pondelok nie je správny čas na nákup (${reason}). Čakáme na optimálne okno...`,
    };
  }

  writeMondayDeferUntil(null);

  return {
    isMonday: true,
    indicators,
    pumpAnomaly: false,
    rsiBlocked: false,
    isGreenLight: true,
    deferredUntil: null,
    status: "ready",
    message: "Teraz je ten správny čas!",
  };
}
