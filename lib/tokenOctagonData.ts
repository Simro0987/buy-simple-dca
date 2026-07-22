import {
  buildTokenOctagonSnapshot,
  DEFAULT_OCTAGON_BASKET,
  type OctagonTokenDefinition,
  type OhlcVolumeBar,
  type TokenOctagonSnapshot,
} from "@/lib/confluenceOctagon";
import { resolveOctagonTokensFromPortfolio } from "@/lib/resolveOctagonTokens";
import type { TrackedAsset } from "@/lib/portfolioStorage";

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

export async function fetchTokenOctagonSnapshotForDef(
  def: OctagonTokenDefinition,
  fearGreed: number,
): Promise<TokenOctagonSnapshot | null> {
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

export async function fetchOctagonSnapshotsForTokens(
  tokens: OctagonTokenDefinition[],
  fearGreed: number,
): Promise<Record<string, TokenOctagonSnapshot | null>> {
  const entries = await Promise.all(
    tokens.map(async (token) => {
      const snapshot = await fetchTokenOctagonSnapshotForDef(token, fearGreed);
      return [token.symbol, snapshot] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function fetchAllTokenOctagonSnapshots(
  fearGreed: number,
  portfolioSymbols?: string[],
  trackedAssets?: TrackedAsset[],
): Promise<Record<string, TokenOctagonSnapshot | null>> {
  const tokens = resolveOctagonTokensFromPortfolio(
    portfolioSymbols,
    trackedAssets,
  );
  return fetchOctagonSnapshotsForTokens(tokens, fearGreed);
}

/** @deprecated Use fetchOctagonSnapshotsForTokens */
export async function fetchTokenOctagonSnapshot(
  symbol: string,
  fearGreed: number,
): Promise<TokenOctagonSnapshot | null> {
  const def =
    DEFAULT_OCTAGON_BASKET.find((token) => token.symbol === symbol) ??
    DEFAULT_OCTAGON_BASKET[0];
  return fetchTokenOctagonSnapshotForDef(
    def.symbol === symbol ? def : { ...def, symbol },
    fearGreed,
  );
}
