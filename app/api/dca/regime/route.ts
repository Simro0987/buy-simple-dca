import { NextResponse } from "next/server";
import type { RegimeMetrics } from "@/lib/dca/types";

const FNG_URL = "https://api.alternative.me/fng/?limit=1";
const STABLES_URL = "https://stablecoins.llama.fi/stablecoincharts/all";
const CBBI_URL = "https://colintalkscrypto.com/cbbi/data/latest.json";

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function asNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseFearGreed(json: unknown): { value: number | null; label: string | null } {
  const row = (json as { data?: Array<{ value?: string; value_classification?: string }> })
    ?.data?.[0];
  const value = asNumber(row?.value);
  return {
    value: value == null ? null : clampScore(value),
    label: row?.value_classification ?? null,
  };
}

function parseStableCharts(json: unknown): { mcap: number | null; change30d: number | null } {
  if (!Array.isArray(json) || json.length < 2) return { mcap: null, change30d: null };
  const mcapAt = (row: unknown) => {
    const rec = row as {
      totalCirculatingUSD?: { peggedUSD?: number };
      totalCirculating?: { peggedUSD?: number };
    };
    return (
      asNumber(rec.totalCirculatingUSD?.peggedUSD) ??
      asNumber(rec.totalCirculating?.peggedUSD)
    );
  };
  const latest = mcapAt(json[json.length - 1]);
  if (latest == null) return { mcap: null, change30d: null };
  const latestDate = asNumber((json[json.length - 1] as { date?: number }).date) ?? 0;
  const target = latestDate - 30 * 24 * 3600;
  let previous = mcapAt(json[0]);
  for (const row of json) {
    const date = asNumber((row as { date?: number }).date);
    if (date != null && date <= target) previous = mcapAt(row);
  }
  if (previous == null || previous <= 0) return { mcap: latest, change30d: null };
  return { mcap: latest, change30d: ((latest - previous) / previous) * 100 };
}

function lastMapValue(record: Record<string, unknown>): number | null {
  const keys = Object.keys(record).sort();
  if (keys.length === 0) return null;
  return asNumber(record[keys[keys.length - 1]]);
}

function parseCbbi(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  const direct =
    asNumber(rec.cbbi) ??
    asNumber(rec.CBBI) ??
    asNumber(rec.confidence) ??
    asNumber(rec.Confidence);
  if (direct != null) return clampScore(direct <= 1.5 ? direct * 100 : direct);

  for (const key of ["Confidence", "confidence", "CBBI", "cbbi", "Composite"]) {
    const value = rec[key];
    if (value && typeof value === "object") {
      const last = lastMapValue(value as Record<string, unknown>);
      if (last != null) return clampScore(last <= 1.5 ? last * 100 : last);
    }
  }
  return null;
}

export async function GET() {
  const [fngJson, stablesJson, cbbiJson] = await Promise.all([
    fetchJson(FNG_URL),
    fetchJson(STABLES_URL),
    fetchJson(CBBI_URL),
  ]);

  const fng = parseFearGreed(fngJson);
  const stables = parseStableCharts(stablesJson);
  const cbbi = parseCbbi(cbbiJson);

  const payload: RegimeMetrics = {
    fearGreed: fng.value,
    fearGreedLabel: fng.label,
    stablecoinMcapUsd: stables.mcap,
    stablecoinChange30d: stables.change30d,
    cbbi,
    cbbiMock: cbbi == null,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
