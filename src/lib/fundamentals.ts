/**
 * Live fundamental scoring (0–10) — pure math, no fetching, no React.
 *
 * Every input is a REAL number pulled from a public API (DefiLlama, CoinGecko,
 * Binance klines, optionally Glassnode/Dune). There are no static mock values:
 * a metric that cannot be fetched is simply `null` and drops out of the
 * weighted average, and the caller is told which legs were available.
 *
 * Mirrored verbatim in `supabase/functions/_shared/fundamentals.ts`.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const map = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  x1 === x0 ? y0 : lerp(y0, y1, (x - x0) / (x1 - x0));

const num = (n: number | null | undefined): number | null =>
  n != null && Number.isFinite(n) ? n : null;

export interface FundamentalMetrics {
  /** CoinGecko market cap (USD). */
  marketCap: number | null;
  /** CoinGecko fully diluted valuation (USD). */
  fdv: number | null;
  /** CoinGecko circulating supply. */
  circulatingSupply: number | null;
  /** CoinGecko total (max/total) supply. */
  totalSupply: number | null;
  /** CoinGecko 24h volume (USD). */
  volume24h: number | null;
  /** DefiLlama TVL (chain TVL for L1s, protocol TVL for DeFi tokens). */
  tvlUsd: number | null;
  /** DefiLlama TVL change over the last 30 days, %. */
  tvlChange30dPct: number | null;
  /** DefiLlama fees, USD. */
  fees24h: number | null;
  fees7d: number | null;
  fees30d: number | null;
  /** DefiLlama protocol revenue over 30 days, USD. */
  revenue30d: number | null;
  /** MVRV — free proxy (spot / 200W SMA) unless a free provider returns the real one. */
  mvrv: number | null;
  /** 'proxy' when derived from Binance candles, 'onchain' when from a free provider. */
  mvrvSource: 'proxy' | 'onchain' | null;
  /** Mayer-style proxy: price / 365D average price (computed from live candles). */
  priceToYearAvg: number | null;
  /** Perp funding rate, %/8h (Binance/Coinglass public). */
  fundingRatePct: number | null;
  /** Open interest change over 7 days, % (Binance public futures data). */
  oiChange7dPct: number | null;
  /** 24h volume vs 30D average — abnormal-volume / institutional-flow proxy. */
  volumeSpikeRatio: number | null;
  /** Stablecoin supply change over 30 days, % (DefiLlama) — macro liquidity. */
  stablecoinFlow30dPct: number | null;
  /** Best free DefiLlama yield for the protocol, % APY (e.g. stETH). */
  yieldApyPct: number | null;
  /** Human-readable source list, e.g. ['DefiLlama', 'CoinGecko']. */
  sources: string[];
}

export const EMPTY_METRICS: FundamentalMetrics = {
  marketCap: null, fdv: null, circulatingSupply: null, totalSupply: null, volume24h: null,
  tvlUsd: null, tvlChange30dPct: null, fees24h: null, fees7d: null, fees30d: null,
  revenue30d: null, mvrv: null, mvrvSource: null, priceToYearAvg: null,
  fundingRatePct: null, oiChange7dPct: null, volumeSpikeRatio: null,
  stablecoinFlow30dPct: null, yieldApyPct: null, sources: [],
};


export interface FundamentalLeg { key: string; label: string; score: number; weight: number; detail: string; }

export interface FundamentalResult {
  /** Weighted 0–10 fundamental score, or null when nothing could be fetched. */
  score: number | null;
  legs: FundamentalLeg[];
  /** Compact Slovak summary of the live legs (used as the layer note). */
  note: string;
  sources: string[];
}

const usdShort = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2).replace('.', ',')} mld`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2).replace('.', ',')} mil`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1).replace('.', ',')} tis`;
  return `$${n.toFixed(0)}`;
};
const pct = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d).replace('.', ',')} %`;
const ratio = (n: number, d = 2) => `×${n.toFixed(d).replace('.', ',')}`;

/** Builds the live fundamental score from whatever the APIs actually returned. */
export function computeFundamentals(m: FundamentalMetrics): FundamentalResult {
  const legs: FundamentalLeg[] = [];

  // 1 · Fee momentum — daily fees vs. the 30D daily average.
  const fees24h = num(m.fees24h);
  const fees30d = num(m.fees30d);
  if (fees24h != null && fees30d != null && fees30d > 0) {
    const r = (fees24h * 30) / fees30d;
    legs.push({
      key: 'feeMomentum', label: 'Fee momentum', weight: 1.2,
      score: clamp(map(r, 0.4, 1.8, 2, 9.5), 0, 10),
      detail: `24H fees ${usdShort(fees24h)} · ${ratio(r)} vs 30D priemer`,
    });
  }

  // 2 · Fee trend — last 7 days vs. the 30D pace.
  const fees7d = num(m.fees7d);
  if (fees7d != null && fees30d != null && fees30d > 0) {
    const r = fees7d / ((fees30d / 30) * 7);
    legs.push({
      key: 'feeTrend', label: 'Fee trend 7D', weight: 1.0,
      score: clamp(map(r, 0.5, 1.6, 2.5, 9), 0, 10),
      detail: `7D fees ${usdShort(fees7d)} · ${ratio(r)} vs 30D tempo`,
    });
  }

  // 3 · Revenue quality — how much of the fees the protocol actually keeps.
  const rev30d = num(m.revenue30d);
  if (rev30d != null && fees30d != null && fees30d > 0) {
    const share = rev30d / fees30d;
    legs.push({
      key: 'revenueQuality', label: 'Revenue share', weight: 0.9,
      score: clamp(map(share, 0.02, 0.5, 3, 9), 0, 10),
      detail: `30D revenue ${usdShort(rev30d)} (${(share * 100).toFixed(1).replace('.', ',')} % z fees)`,
    });
  }

  // 4 · TVL trend (30D) — real capital flowing in or out.
  const tvlChg = num(m.tvlChange30dPct);
  if (tvlChg != null) {
    legs.push({
      key: 'tvlTrend', label: 'TVL 30D', weight: 1.3,
      score: clamp(map(tvlChg, -30, 40, 2, 9.5), 0, 10),
      detail: `TVL ${pct(tvlChg)}${m.tvlUsd ? ` · ${usdShort(m.tvlUsd)}` : ''}`,
    });
  }

  // 5 · P/TVL valuation — market cap paid per dollar of on-chain capital.
  const mcap = num(m.marketCap);
  const tvl = num(m.tvlUsd);
  if (mcap != null && tvl != null && tvl > 0) {
    const pTvl = mcap / tvl;
    legs.push({
      key: 'pTvl', label: 'MCap / TVL', weight: 1.0,
      score: clamp(map(pTvl, 6, 0.5, 2, 9.5), 0, 10),
      detail: `${ratio(pTvl)} — ${pTvl > 4 ? 'drahé voči TVL' : pTvl < 1.5 ? 'lacné voči TVL' : 'v norme'}`,
    });
  }

  // 6 · Liquidity / usage proxy — 24h volume relative to market cap.
  const vol = num(m.volume24h);
  if (mcap != null && vol != null && mcap > 0) {
    const turn = vol / mcap;
    legs.push({
      key: 'turnover', label: 'Volume / MCap', weight: 0.9,
      score: clamp(map(turn, 0.004, 0.12, 3, 9), 0, 10),
      detail: `${(turn * 100).toFixed(2).replace('.', ',')} % obrat · objem ${usdShort(vol)}`,
    });
  }

  // 7 · Dilution / supply overhang — circulating share of the FDV.
  const fdv = num(m.fdv);
  if (mcap != null && fdv != null && fdv > 0) {
    const float = mcap / fdv;
    legs.push({
      key: 'float', label: 'Float (MCap/FDV)', weight: 0.8,
      score: clamp(map(float, 0.3, 1, 3, 9), 0, 10),
      detail: `${(float * 100).toFixed(1).replace('.', ',')} % v cirkulácii · FDV ${usdShort(fdv)}`,
    });
  }

  // 8 · Valuation vs. realized cost — MVRV (free proxy: spot / 200W SMA).
  const mvrv = num(m.mvrv);
  const yearRatio = num(m.priceToYearAvg);
  if (mvrv != null && mvrv > 0) {
    const label = m.mvrvSource === 'onchain' ? 'MVRV (on-chain)' : 'MVRV proxy (200W SMA)';
    legs.push({
      key: 'mvrv', label, weight: 1.4,
      score: clamp(map(mvrv, 3.4, 0.9, 1.5, 9.5), 0, 10),
      detail: `${ratio(mvrv)} — ${mvrv > 3 ? 'cyklické prehriatie' : mvrv < 1.2 ? 'hodnotová zóna' : 'stred cyklu'}`,
    });
  } else if (yearRatio != null && yearRatio > 0) {
    legs.push({
      key: 'yearRatio', label: 'Cena / 365D priemer', weight: 1.1,
      score: clamp(map(yearRatio, 2.2, 0.85, 1.5, 9.5), 0, 10),
      detail: `${ratio(yearRatio)} (MVRV proxy)`,
    });
  }

  // 9 · Perp funding — free Binance/Coinglass gauge of leverage euphoria.
  const funding = num(m.fundingRatePct);
  if (funding != null) {
    legs.push({
      key: 'funding', label: 'Funding 8H', weight: 0.8,
      score: clamp(map(funding, 0.06, -0.01, 2, 9), 0, 10),
      detail: `${pct(funding, 3)} — ${funding > 0.03 ? 'preplatené longy' : funding < 0 ? 'shorty platia' : 'neutrál'}`,
    });
  }

  // 10 · Open interest 7D — rastúca páka = krehkejší trh.
  const oi = num(m.oiChange7dPct);
  if (oi != null) {
    legs.push({
      key: 'oi', label: 'Open interest 7D', weight: 0.7,
      score: clamp(map(oi, 40, -20, 2.5, 8.5), 0, 10),
      detail: `OI ${pct(oi)}`,
    });
  }

  // 11 · Objemový spike — proxy inštitucionálneho / ETF záujmu (Binance).
  const spike = num(m.volumeSpikeRatio);
  if (spike != null && spike > 0) {
    legs.push({
      key: 'volSpike', label: 'Objemový spike (ETF proxy)', weight: 0.6,
      score: clamp(map(spike, 0.5, 2.2, 3.5, 9), 0, 10),
      detail: `${ratio(spike)} vs 30D priemer objemu`,
    });
  }

  // 12 · Stablecoin flows — makro likvidita (DefiLlama, zadarmo).
  const stables = num(m.stablecoinFlow30dPct);
  if (stables != null) {
    legs.push({
      key: 'stables', label: 'Stablecoin supply 30D', weight: 0.7,
      score: clamp(map(stables, -4, 8, 2, 9), 0, 10),
      detail: `${pct(stables)} likvidity na trhu`,
    });
  }

  // 13 · Real yield protokolu (DefiLlama yields, zadarmo).
  const apy = num(m.yieldApyPct);
  if (apy != null && apy > 0) {
    legs.push({
      key: 'yield', label: 'Protokolový yield', weight: 0.5,
      score: clamp(map(apy, 1, 15, 3.5, 9), 0, 10),
      detail: `${apy.toFixed(1).replace('.', ',')} % APY (medián free pools)`,
    });
  }


  if (!legs.length) {
    return { score: null, legs, note: '⛔️ Fundamenty nedostupné — API nevrátilo dáta', sources: m.sources };
  }

  const tw = legs.reduce((s, l) => s + l.weight, 0);
  const score = clamp(legs.reduce((s, l) => s + l.score * l.weight, 0) / tw, 0, 10);

  return {
    score,
    legs,
    note: legs.map((l) => `${l.label} ${l.score.toFixed(1).replace('.', ',')}`).join(' · '),
    sources: m.sources,
  };
}
