import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

const STORAGE_KEY = 'wallet-context-v1';
const EVT = 'wallet-context-changed';

export interface WalletAddresses {
  solana: string;
  evmArbitrum: string;
}

const EMPTY: WalletAddresses = { solana: '', evmArbitrum: '' };

const SOL_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;

function load(): WalletAddresses {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        solana: typeof p.solana === 'string' ? p.solana : '',
        evmArbitrum: typeof p.evmArbitrum === 'string' ? p.evmArbitrum : (typeof p.evm === 'string' ? p.evm : ''),
      };
    }
    const legacy = localStorage.getItem('tracked-public-addresses-v1');
    if (legacy) {
      const p = JSON.parse(legacy);
      const migrated = {
        solana: typeof p.solana === 'string' ? p.solana : '',
        evmArbitrum: typeof p.evm === 'string' ? p.evm : '',
      };
      persist(migrated);
      return migrated;
    }
    return { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function persist(value: WalletAddresses): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch { /* ignore */ }
}

interface WalletCtx {
  addresses: WalletAddresses;
  setSolanaAddress: (v: string) => void;
  setEvmArbitrumAddress: (v: string) => void;
  setAddresses: (v: Partial<WalletAddresses>) => void;
  hasSolana: boolean;
  hasEvm: boolean;
  hasAllAddresses: boolean;
  isSolanaValid: boolean;
  isEvmValid: boolean;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [addresses, setAddressesState] = useState<WalletAddresses>(() => load());

  useEffect(() => {
    const sync = () => setAddressesState(load());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('tracked-addresses-changed', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('tracked-addresses-changed', sync);
    };
  }, []);

  const setAddresses = useCallback((patch: Partial<WalletAddresses>) => {
    setAddressesState(prev => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const setSolanaAddress = useCallback((v: string) => setAddresses({ solana: v.trim() }), [setAddresses]);
  const setEvmArbitrumAddress = useCallback((v: string) => setAddresses({ evmArbitrum: v.trim() }), [setAddresses]);

  const value = useMemo<WalletCtx>(() => {
    const sol = addresses.solana.trim();
    const evm = addresses.evmArbitrum.trim();
    return {
      addresses,
      setSolanaAddress,
      setEvmArbitrumAddress,
      setAddresses,
      hasSolana: sol.length > 0 && SOL_REGEX.test(sol),
      hasEvm: evm.length > 0 && EVM_REGEX.test(evm),
      hasAllAddresses: sol.length > 0 && SOL_REGEX.test(sol) && evm.length > 0 && EVM_REGEX.test(evm),
      isSolanaValid: sol.length === 0 || SOL_REGEX.test(sol),
      isEvmValid: evm.length === 0 || EVM_REGEX.test(evm),
    };
  }, [addresses, setSolanaAddress, setEvmArbitrumAddress, setAddresses]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWalletContext() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWalletContext must be used inside WalletProvider');
  return v;
}

export { SOL_REGEX, EVM_REGEX, STORAGE_KEY as WALLET_CONTEXT_KEY };

export function loadWalletAddresses(): WalletAddresses {
  return load();
}

/** @deprecated use loadWalletAddresses — compat for legacy callers */
export function loadTrackedAddresses(): { solana: string; evm: string } {
  const a = load();
  return { solana: a.solana, evm: a.evmArbitrum };
}
