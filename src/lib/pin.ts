// Simple PIN hashing using Web Crypto SHA-256.
// Single-user personal app — acceptable per user choice.
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`bsdca:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

const UNLOCK_KEY = 'bsdca-unlocked';

export function markUnlocked(): void {
  sessionStorage.setItem(UNLOCK_KEY, '1');
}

export function isUnlocked(): boolean {
  return sessionStorage.getItem(UNLOCK_KEY) === '1';
}

export function clearUnlocked(): void {
  sessionStorage.removeItem(UNLOCK_KEY);
}
