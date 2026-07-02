import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TOKENS } from '@/lib/crypto';
import {
  type PortfolioSymbol,
  type UserHoldings,
  EMPTY_USER_HOLDINGS,
} from '@/lib/portfolioRealHoldings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holdings: UserHoldings;
  onSave: (holdings: UserHoldings) => void;
  sk?: boolean;
}

type Draft = UserHoldings;

function parseNum(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function EditHoldingsModal({ open, onOpenChange, holdings, onSave, sk }: Props) {
  const [draft, setDraft] = useState<Draft>(holdings);

  useEffect(() => {
    if (open) setDraft(holdings);
  }, [open, holdings]);

  const updateRow = (symbol: PortfolioSymbol, field: keyof Draft[PortfolioSymbol], raw: string) => {
    setDraft(prev => ({
      ...prev,
      [symbol]: { ...prev[symbol], [field]: parseNum(raw) },
    }));
  };

  const handleSave = () => {
    onSave(draft);
    onOpenChange(false);
  };

  const labels = sk
    ? { title: 'Upraviť držby', amount: 'Počet tokenov', buy: 'Nákupná cena', invested: 'Vložené USD', save: 'Uložiť' }
    : { title: 'Edit holdings', amount: 'Token amount', buy: 'Buy price', invested: 'Invested USD', save: 'Save' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A] border border-white/10 text-white sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Settings className="w-4 h-4 text-[#14F195]" />
            {labels.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {(['BTC', 'ETH', 'SOL'] as PortfolioSymbol[]).map(symbol => {
            const token = TOKENS.find(t => t.symbol === symbol)!;
            const row = draft[symbol];
            const amountDecimals = symbol === 'BTC' ? 8 : symbol === 'ETH' ? 6 : 4;

            return (
              <div
                key={symbol}
                className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black"
                    style={{ background: `${token.color}18`, color: token.color, border: `1px solid ${token.color}35` }}
                  >
                    {symbol}
                  </span>
                  <span className="text-sm font-semibold text-white">{token.name}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">{labels.amount}</span>
                    <input
                      type="number"
                      min="0"
                      step={symbol === 'BTC' ? '0.00000001' : symbol === 'ETH' ? '0.000001' : '0.0001'}
                      value={row.tokenAmount || ''}
                      placeholder="0"
                      onChange={e => updateRow(symbol, 'tokenAmount', e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#14F195]/40"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">{labels.buy}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.averageBuyPrice || ''}
                      placeholder="0"
                      onChange={e => updateRow(symbol, 'averageBuyPrice', e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#14F195]/40"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">{labels.invested}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.investedUsd || ''}
                      placeholder="0"
                      onChange={e => updateRow(symbol, 'investedUsd', e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#14F195]/40"
                    />
                  </label>
                </div>

                {row.tokenAmount > 0 && (
                  <p className="text-[10px] font-mono text-white/35">
                    {row.tokenAmount.toFixed(amountDecimals)} {symbol}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => setDraft({ ...EMPTY_USER_HOLDINGS })}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm font-medium hover:text-white hover:border-white/20 transition-colors"
          >
            {sk ? 'Vynulovať' : 'Reset'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-[2] py-2.5 rounded-xl bg-[#14F195] text-black text-sm font-semibold hover:bg-[#12d987] transition-colors"
          >
            {labels.save}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditHoldingsTrigger({
  onClick,
  sk,
}: {
  onClick: () => void;
  sk?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={sk ? 'Upraviť držby' : 'Edit holdings'}
      className="p-1.5 rounded-lg border border-white/10 text-white/45 hover:text-white hover:border-[#14F195]/30 transition-colors shrink-0"
    >
      <Settings className="w-3.5 h-3.5" />
    </button>
  );
}
