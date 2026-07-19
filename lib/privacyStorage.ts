export const PRIVACY_STORAGE_KEY = "edge-trader-privacy-mode";

export const MASK_USD = "$***.**";
export const MASK_USD_SIGNED = "+$***.**";
export const MASK_CRYPTO = "****";
export const MASK_PERCENT = "**.*%";
export const MASK_PNL = "+$***.** **.*%";

export function readPrivacyModeFromStorage(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(PRIVACY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePrivacyModeToStorage(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRIVACY_STORAGE_KEY, enabled ? "1" : "0");
}
