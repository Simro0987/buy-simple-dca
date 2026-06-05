import { useEffect, useState, useCallback } from 'react';
import { Check, ClipboardPaste, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Lang } from '@/lib/i18n';

const STORAGE_KEY = 'tracked-public-addresses-v1';

// Solana base58, 32–44 chars
const SOL_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// EVM hex address
const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;

export interface TrackedAddresses {
  solana: string;
  evm: string;
}

function loadTracked(): TrackedAddresses {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { solana: '', evm: '' };
    const parsed = JSON.parse(raw);
    return {
      solana: typeof parsed.solana === 'string' ? parsed.solana : '',
      evm: typeof parsed.evm === 'string' ? parsed.evm : '',
    };
  } catch {
    return { solana: '', evm: '' };
  }
}

function saveTracked(value: TrackedAddresses): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('tracked-addresses-changed'));
  } catch { /* ignore */ }
}

interface Props {
  lang: Lang;
  onChange?: (value: TrackedAddresses) => void;
}

type FieldKey = 'solana' | 'evm';

interface FieldConfig {
  key: FieldKey;
  label: string;
  hint: string;
  placeholder: string;
  regex: RegExp;
}

export function TrackedAddressInputs({ lang, onChange }: Props) {
  const [values, setValues] = useState<TrackedAddresses>(() => loadTracked());

  useEffect(() => {
    saveTracked(values);
    onChange?.(values);
  }, [values, onChange]);

  const fields: FieldConfig[] = [
    {
      key: 'solana',
      label: lang === 'sk' ? 'Vaša Solana adresa (Verejný kľúč)' : 'Your Solana address (Public key)',
      hint: lang === 'sk'
        ? 'Sledovanie USDC zostatkov na Solana Mainnet.'
        : 'Tracks USDC balances on Solana Mainnet.',
      placeholder: 'Fg6PaFpoGXkY...',
      regex: SOL_REGEX,
    },
    {
      key: 'evm',
      label: lang === 'sk' ? 'Vaša EVM adresa (Verejný kľúč)' : 'Your EVM address (Public key)',
      hint: lang === 'sk'
        ? 'Sledovanie USDC / USDT na Base aj Arbitrum cez verejné RPC.'
        : 'Tracks USDC / USDT on Base and Arbitrum via public RPCs.',
      placeholder: '0x1234…abcd',
      regex: EVM_REGEX,
    },
  ];

  const handlePaste = useCallback(async (key: FieldKey) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setValues(prev => ({ ...prev, [key]: text.trim() }));
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  const clear = useCallback((key: FieldKey) => {
    setValues(prev => ({ ...prev, [key]: '' }));
  }, []);

  return (
    <div className="glass-card p-4 space-y-4">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {lang === 'sk' ? 'Sledované verejné adresy' : 'Tracked public addresses'}
      </p>

      {fields.map(f => {
        const raw = values[f.key];
        const trimmed = raw.trim();
        const isEmpty = trimmed.length === 0;
        const isValid = !isEmpty && f.regex.test(trimmed);
        const isInvalid = !isEmpty && !isValid;

        return (
          <div key={f.key} className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground block">
              {f.label}
            </label>
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <Input
                  value={raw}
                  onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className={`font-mono text-xs pr-9 ${
                    isInvalid
                      ? 'border-destructive/70 focus-visible:ring-destructive/40 bg-destructive/5'
                      : isValid
                      ? 'border-emerald-500/60 focus-visible:ring-emerald-500/30'
                      : ''
                  }`}
                  aria-invalid={isInvalid}
                />
                {isValid && (
                  <Check
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500"
                    aria-label={lang === 'sk' ? 'Platná adresa' : 'Valid address'}
                  />
                )}
                {!isEmpty && !isValid && (
                  <button
                    type="button"
                    onClick={() => clear(f.key)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={lang === 'sk' ? 'Vymazať' : 'Clear'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => handlePaste(f.key)}
                className="flex items-center gap-1 px-3 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 active:bg-primary active:text-primary-foreground transition-colors shrink-0"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                {lang === 'sk' ? 'Vložiť' : 'Paste'}
              </button>
            </div>
            {isInvalid ? (
              <p className="text-[11px] text-destructive">
                {lang === 'sk' ? 'Neplatný formát adresy' : 'Invalid address format'}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground leading-snug">{f.hint}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { loadTracked as loadTrackedAddresses, saveTracked as saveTrackedAddresses };
