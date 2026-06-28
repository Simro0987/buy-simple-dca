import { formatPrice, formatUsd } from '@/lib/crypto';

export const MASKED_USD = '$***.**';
export const MASKED_PCT = '***%';

export function maskUsd(value: number, visible: boolean): string {
  return visible ? formatUsd(value) : MASKED_USD;
}

export function maskPrice(value: number, visible: boolean): string {
  return visible ? formatPrice(value) : MASKED_USD;
}

export function maskPct(value: number, visible: boolean, withSign = false): string {
  if (!visible) return MASKED_PCT;
  const sign = withSign && value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function maskSignedUsd(value: number, visible: boolean): string {
  if (!visible) return MASKED_USD;
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatUsd(value)}`;
}
