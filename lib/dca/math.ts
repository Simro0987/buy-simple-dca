export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp(t, 0, 1);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function last<T>(values: T[]): T | undefined {
  return values[values.length - 1];
}

export function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function softmax(values: number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const sum = exps.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return values.map(() => 1 / values.length);
  return exps.map((value) => value / sum);
}

export function mapRange(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number,
): number {
  if (!Number.isFinite(value)) return (toLow + toHigh) / 2;
  const t = (value - fromLow) / (fromHigh - fromLow);
  return lerp(toLow, toHigh, t);
}
