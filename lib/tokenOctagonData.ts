import {
  buildTokenOctagonSnapshot,
  OCTAGON_TOKEN_DEFINITIONS,
  type OctagonTokenSymbol,
  type OhlcVolumeBar,
  type TokenOctagonSnapshot,
} from "@/lib/confluenceOctagon";

type RawKline = [number, string, string, string, string, string, ...unknown[]];

const BINANCE_KLINES = "https://data-api.binance.vision/api/v3/klines";

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number,
): Promise<OhlcVolumeBar[]> {
  const url = `${BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const json = (await res.json()) as RawKline[];
  return json.map((k) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export async function fetchTokenOctagonSnapshot(
  symbol: OctagonTokenSymbol,
  fearGreed: number,
): Promise<TokenOctagonSnapshot | null> {
  const def = OCTAGON_TOKEN_DEFINITIONS.find((token) => token.symbol === symbol);
  if (!def) return null;

  const [dailyBars, weeklyBars] = await Promise.all([
    fetchKlines(def.binanceSymbol, "1d", 250),
    fetchKlines(def.binanceSymbol, "1w", 210),
  ]);

  return buildTokenOctagonSnapshot({
    symbol: def.symbol,
    name: def.name,
    dailyBars,
    weeklyBars,
    fearGreed,
  });
}

export async function fetchAllTokenOctagonSnapshots(
  fearGreed: number,
): Promise<Record<OctagonTokenSymbol, TokenOctagonSnapshot | null>> {
  const entries = await Promise.all(
    OCTAGON_TOKEN_DEFINITIONS.map(async (token) => {
      const snapshot = await fetchTokenOctagonSnapshot(token.symbol, fearGreed);
      return [token.symbol, snapshot] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    OctagonTokenSymbol,
    TokenOctagonSnapshot | null
  >;
}
