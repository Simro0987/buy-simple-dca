import { useCallback } from 'react';
import { Check, ClipboardPaste, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Lang } from '@/lib/i18n';
import { useWalletContext, SOL_REGEX, EVM_REGEX } from '@/contexts/WalletContext';

interface Props {
  lang: Lang;
}

type FieldKey = 'solana' | 'evmArbitrum';

interface FieldConfig {
  key: FieldKey;
  label: string;
  hint: string;
  placeholder: string;
  regex: RegExp;
}

export function TrackedAddressInputs({ lang }: Props) {
  const { addresses, setAddresses } = useWalletContext();

  const fields: FieldConfig[] = [
    {
      key: 'solana',
      label: lang === 'sk' ? 'Vaša Solana adresa (Verejný kľúč)' : 'Your Solana address (Public key)',
      hint: lang === 'sk'
        ? 'Používa sa pre mSOL, INF a Kamino zostatky v Cyborg Termináli.'
        : 'Used for mSOL, INF and Kamino balances in the Cyborg Terminal.',
      placeholder: 'Fg6PaFpoGXkY...',
      regex: SOL_REGEX,
    },
    {
      key: 'evmArbitrum',
      label: lang === 'sk' ? 'Vaša EVM adresa — Arbitrum' : 'Your EVM address — Arbitrum',
      hint: lang === 'sk'
        ? 'Používa sa pre rETH, weETH a LBTC cez Alchemy RPC.'
        : 'Used for rETH, weETH and LBTC via Alchemy RPC.',
      placeholder: '0x1234…abcd',
      regex: EVM_REGEX,
    },
  ];

  const handlePaste = useCallback(async (key: FieldKey) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setAddresses({ [key]: text.trim() });
    } catch { /* clipboard unavailable */ }
  }, [setAddresses]);

  const clear = useCallback((key: FieldKey) => {
    setAddresses({ [key]: '' });
  }, [setAddresses]);

  return (
    <div className="glass-card p-4 space-y-4">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {lang === 'sk' ? 'Cyborg Terminal — peňaženky' : 'Cyborg Terminal — wallets'}
      </p>

      {fields.map(f => {
        const raw = addresses[f.key];
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
                  onChange={e => setAddresses({ [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className={`font-mono text-xs pr-9 touch-manipulation ${
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
                onClick={() => void handlePaste(f.key)}
                className="flex items-center gap-1 px-3 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 active:bg-primary active:text-primary-foreground transition-colors shrink-0 touch-manipulation min-h-[40px]"
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
