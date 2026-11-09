/**
 * SPRÁVA ODSTRÁNENIA TOKENOV — prehľadný výber zo všetkých aktívnych tokenov
 * v Portfóliu. Po výbere sa otvorí potvrdzovacie okno (RemoveTokenModal).
 *
 * Odstránenie zruší kartu v Portfóliu aj v DCA a zastaví všetky fetch/polling
 * loopy. Historické realizované zisky zostávajú v databáze a naďalej vstupujú
 * do globálnej metriky „Vybrané zisky“.
 */
import { useMemo, useState } from 'react';
import { X, Search, Trash2, Coins } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import type { HoldingRow } from '@/components/portfolio/v2/PortfolioV2';

export function RemoveTokenManagerModal({
  rows, onClose, onSelect,
}: {
  rows: HoldingRow[];
  onClose: () => void;
  onSelect: (row: HoldingRow) => void;
}) {
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter(r =>
          r.symbol.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle))
      : rows;
    return [...filtered].sort((a, b) => b.value - a.value);
  }, [rows, q]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Odstrániť token"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0B0F] p-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-white font-bold text-base">Odstrániť token</h3>
            <p className="text-[11px] text-white/45 font-mono mt-0.5">
              Vyber token, ktorý chceš odstrániť z Portfólia aj z DCA.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavrieť"
            className="p-1.5 rounded-lg border border-white/10 text-white/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04]">
          <Search className="w-4 h-4 text-white/35" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Hľadať token…"
            aria-label="Hľadať token"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
          />
        </div>

        <div className="mt-3 overflow-y-auto rounded-xl border border-white/[0.06] divide-y divide-white/[0.05]">
          {list.length === 0 ? (
            <p className="py-8 text-center text-white/40 text-sm">Žiadne aktívne tokeny.</p>
          ) : (
            list.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => onSelect(r)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
              >
                {r.image_url ? (
                  <img src={r.image_url} alt={`${r.symbol} logo`} className="w-7 h-7 rounded-full" loading="lazy" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                    <Coins className="w-3.5 h-3.5 text-white/50" />
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white truncate">{r.symbol}</span>
                  <span className="block text-[10px] font-mono text-white/40 truncate">{r.name}</span>
                </span>
                <span className="text-xs font-mono text-white/60 tabular-nums">{formatUsd(r.value)}</span>
                <Trash2 className="w-4 h-4 text-red-400/80" />
              </button>
            ))
          )}
        </div>

        <p className="mt-3 text-[10px] font-mono text-white/35 leading-relaxed">
          Historické transakcie a vybrané zisky zostávajú archivované — naďalej sa
          počítajú do metriky „Vybrané zisky“, bez akéhokoľvek fetchu na pozadí.
        </p>
      </div>
    </div>
  );
}
