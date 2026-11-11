/**
 * Sovereign Local Auth Storage — 100% independent of any external IDE or preview broker.
 * Works identically on Vercel, Arweave, Filecoin/IPFS, Akash, Sia, Storj, and localhost.
 */
export interface PreviewAuthStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

export function brokeredPreviewStorage(): PreviewAuthStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}
