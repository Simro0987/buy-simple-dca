/** Preserve the exact JS quantity without currency, symbol, grouping or rounding. */
export function rawTokenAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  const value = String(amount);
  if (!/[eE]/.test(value)) return value;
  const [coefficient, exponent] = value.toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}