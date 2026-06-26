const SUPPLY_ONLY_KEY = 'hcd-supply-only-mode-v1';
export const SUPPLY_ONLY_MODE_EVENT = 'hcd-supply-only-mode-changed';

export function loadSupplyOnlyMode(): boolean {
  try {
    const raw = localStorage.getItem(SUPPLY_ONLY_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return false;
  } catch {
    return false;
  }
}

export function saveSupplyOnlyMode(enabled: boolean): void {
  try {
    localStorage.setItem(SUPPLY_ONLY_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(SUPPLY_ONLY_MODE_EVENT));
  } catch { /* ignore */ }
}
