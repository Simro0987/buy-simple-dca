const TEMPERAMENT_KEY = 'hcd-temperament-v1';
export const HCD_TEMPERAMENT_EVENT = 'hcd-temperament-changed';

export const DEFAULT_HCD_TEMPERAMENT = 50;

export function clampTemperament(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function loadHcdTemperament(): number {
  try {
    const raw = localStorage.getItem(TEMPERAMENT_KEY);
    if (raw == null) return DEFAULT_HCD_TEMPERAMENT;
    const n = Number(raw);
    return Number.isFinite(n) ? clampTemperament(n) : DEFAULT_HCD_TEMPERAMENT;
  } catch {
    return DEFAULT_HCD_TEMPERAMENT;
  }
}

export function saveHcdTemperament(value: number): void {
  try {
    localStorage.setItem(TEMPERAMENT_KEY, String(clampTemperament(value)));
    window.dispatchEvent(new CustomEvent(HCD_TEMPERAMENT_EVENT));
  } catch { /* ignore */ }
}

export function temperamentLabel(pct: number, sk: boolean): string {
  if (pct <= 25) return sk ? 'Konzervatívny' : 'Conservative';
  if (pct >= 75) return sk ? 'Agresívny' : 'Aggressive';
  return sk ? 'Vyvážený' : 'Balanced';
}
