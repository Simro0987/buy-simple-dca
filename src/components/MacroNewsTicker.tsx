import { useEffect, useMemo, useState } from 'react';
import { Zap, ChevronLeft, ChevronRight, Radio, ExternalLink } from 'lucide-react';
import type { OctToken } from '@/hooks/useConfluenceMetrics';
import { useCryptoNews, type NewsItem } from '@/hooks/useCryptoNews';

// CoinGecko small logos — free public CDN, no API key
const TOKEN_IMG: Record<OctToken, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
};

const TOKEN_COLOR: Record<OctToken, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
};

interface Props { activeToken: OctToken }

export function MacroNewsTicker({ activeToken }: Props) {
  // Live news with built-in try/catch via react-query; we never throw to UI.
  const { data, isLoading, isError } = useCryptoNews('BTC,ETH,SOL', 'sk');

  // Filter for active token (tokens array contains BTC/ETH/SOL)
  const items = useMemo<NewsItem[]>(() => {
    if (!data || data.length === 0) return [];
    const filtered = data.filter(n => n.tokens.some(t => t.toUpperCase() === activeToken));
    return filtered.slice(0, 5);
  }, [data, activeToken]);

  const [idx, setIdx] = useState(0);
  const [lastToken, setLastToken] = useState<OctToken>(activeToken);
  useEffect(() => {
    if (activeToken !== lastToken) {
      setLastToken(activeToken);
      setIdx(0);
    } else if (idx >= items.length) {
      setIdx(0);
    }
  }, [activeToken, lastToken, idx, items.length]);

  // Auto-rotate every 8s
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 8000);
    return () => clearInterval(t);
  }, [items.length]);

  const hasItems = items.length > 0;
  const item = hasItems ? items[Math.min(idx, items.length - 1)] : null;
  const isFlash = item?.impact === 'high';
  const total = items.length;

  function prev() { if (total) setIdx(i => (i - 1 + total) % total); }
  function next() { if (total) setIdx(i => (i + 1) % total); }

  // Silent fallback text when network/CORS fails or no matching items
  const fallbackText = isLoading
    ? 'Radar sa synchronizuje…'
    : isError
      ? 'Radar sa synchronizuje…'
      : 'Žiadne nové správy pre tento token — radar čaká.';

  return (
    <div
      className={`glass-card p-3 transition-all ${
        isFlash ? 'border-amber-500/40 bg-amber-500/5' : ''
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-2">
        <Radio className="w-3 h-3 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex-1">
          Inštitucionálny radar · LIVE
        </p>

        <span
          className="px-1.5 py-0.5 rounded text-[8px] font-bold text-background"
          style={{ backgroundColor: TOKEN_COLOR[activeToken] }}
        >
          {activeToken}
        </span>

        {isFlash && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
            <Zap className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide">
              High impact
            </span>
          </span>
        )}

        {total > 1 && (
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={prev} className="p-0.5 rounded hover:bg-secondary transition-colors" aria-label="Predchádzajúca">
              <ChevronLeft className="w-3 h-3 text-muted-foreground" />
            </button>
            <span className="text-[9px] text-muted-foreground/60 tabular-nums w-6 text-center">
              {idx + 1}/{total}
            </span>
            <button onClick={next} className="p-0.5 rounded hover:bg-secondary transition-colors" aria-label="Ďalšia">
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>

      {/* News card */}
      <div className={`flex items-start gap-2 rounded-lg p-2.5 ${
        isFlash ? 'bg-amber-500/8 border border-amber-500/20' : 'bg-secondary/20'
      }`}>
        <div className="shrink-0 mt-0.5">
          <img
            src={TOKEN_IMG[activeToken]}
            alt={activeToken}
            width={22}
            height={22}
            className="rounded-full"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const n = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (n) n.style.display = 'flex';
            }}
          />
          <div
            className="w-[22px] h-[22px] rounded-full items-center justify-center text-[8px] font-bold text-background"
            style={{ backgroundColor: TOKEN_COLOR[activeToken], display: 'none' }}
          >
            {activeToken.slice(0, 1)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {item ? (
            <>
              <div className="flex items-start gap-1">
                {isFlash && <Zap className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />}
                <p className={`text-[11px] font-semibold leading-snug ${
                  isFlash ? 'text-amber-100' : 'text-foreground'
                }`}>
                  {item.title}
                </p>
              </div>
              {item.summary && (
                <p className="text-[10px] text-muted-foreground/80 mt-1 leading-snug line-clamp-2">
                  {item.summary}
                </p>
              )}
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[9px] text-muted-foreground/50">{item.source}</p>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-foreground"
                  >
                    Zdroj <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              {fallbackText}
            </p>
          )}
        </div>
      </div>

      {total > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${
                i === idx ? 'w-3 h-1.5' : 'w-1.5 h-1.5 opacity-30 hover:opacity-60'
              }`}
              style={{ backgroundColor: i === idx ? TOKEN_COLOR[activeToken] : '#6b7280' }}
              aria-label={`Správa ${i + 1}`}
            />
          ))}
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/40 text-center mt-2">
        Live feed: CoinDesk · CoinTelegraph · The Block · Decrypt · Blockworks
      </p>
    </div>
  );
}
