import type { PriceSource } from "@/lib/price/types";

interface CircuitEntry {
  failures: number;
  openUntil: number;
}

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 5 * 60 * 1000;

const circuits: Record<PriceSource, CircuitEntry> = {
  coingecko: { failures: 0, openUntil: 0 },
  mobula: { failures: 0, openUntil: 0 },
  coinmarketcap: { failures: 0, openUntil: 0 },
};

export function isCircuitOpen(source: PriceSource): boolean {
  return Date.now() < circuits[source].openUntil;
}

export function recordSourceSuccess(source: PriceSource): void {
  circuits[source].failures = 0;
  circuits[source].openUntil = 0;
}

export function recordSourceFailure(source: PriceSource): void {
  circuits[source].failures += 1;
  if (circuits[source].failures >= FAILURE_THRESHOLD) {
    circuits[source].openUntil = Date.now() + OPEN_MS;
  }
}

export function getCircuitSnapshot(): Record<
  PriceSource,
  { failures: number; open: boolean }
> {
  return {
    coingecko: {
      failures: circuits.coingecko.failures,
      open: isCircuitOpen("coingecko"),
    },
    mobula: {
      failures: circuits.mobula.failures,
      open: isCircuitOpen("mobula"),
    },
    coinmarketcap: {
      failures: circuits.coinmarketcap.failures,
      open: isCircuitOpen("coinmarketcap"),
    },
  };
}
