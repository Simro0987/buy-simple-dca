import { useState } from 'react';
import { Zap, ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import type { OctToken } from '@/hooks/useConfluenceMetrics';
import { useInstitutionalRadar } from '@/hooks/useInstitutionalRadar';

// CoinGecko small logos — free public CDN, no API key
const TOKEN_IMG: Record<OctToken, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
};

// ─── internal news database ──────────────────────────────────────────────────

type NewsType = 'normal' | 'alert';

interface NewsItem {
  title:  string;    // Slovak
  type:   NewsType;
  tag?:   string;    // flash label (Fed, ETF, SEC …)
  source: string;
}

const NEWS_DB: Record<OctToken, NewsItem[]> = {
  BTC: [
    {
      title:  'Fed ponechal sadzby nezmenené — makro likvidita zostáva stabilná pre BTC akumuláciu.',
      type:   'alert',
      tag:    'Fed',
      source: 'Bloomberg / FOMC',
    },
    {
      title:  'BTC ETF zaznamenal 5 po sebe idúcich dní čistých prílevov — inštitucionálny dopyt rastie.',
      type:   'normal',
      source: 'CoinDesk / Farside',
    },
    {
      title:  'Bitcoin drží kľúčovú podporu nad 200-týždenným kĺzavým priemerom (200WMA) — makro trend bullish.',
      type:   'normal',
      source: 'TradingView / Glassnode',
    },
    {
      title:  'MicroStrategy oznámila ďalší nákup BTC — celkové zásoby firmy prekonávajú 500 000 BTC.',
      type:   'alert',
      tag:    'Inštitúcie',
      source: 'MSTR / SEC Filing',
    },
    {
      title:  'On-chain dáta: Dlhodobí držitelia (LTH) akumulujú — podiel supply mimo búrz rastie.',
      type:   'normal',
      source: 'Glassnode (free)',
    },
  ],

  ETH: [
    {
      title:  'ETH supply zostáva dezinflačné — spaľovacie mechanizmy EIP-1559 odstraňujú viac ETH ako sa vydáva.',
      type:   'normal',
      source: 'Ultrasound.money',
    },
    {
      title:  'Rocket Pool rETH dosiahol rekordnú TVL — liquid staking ekosystém Ethereum rastie.',
      type:   'normal',
      source: 'DeFiLlama',
    },
    {
      title:  'SEC stále posudzuje ďalšie dokumenty k spot ETH ETF — regulačná neistota pretrváva.',
      type:   'alert',
      tag:    'SEC',
      source: 'Reuters / Bloomberg',
    },
    {
      title:  'Ethereum L2 siete (Arbitrum, Base, Optimism) spracovávajú viac transakcií ako mainnet.',
      type:   'normal',
      source: 'L2Beat',
    },
    {
      title:  'DeFi TVL na Ethereum mainnet stabilizovaný nad $60 mld — on-chain aktivita zdravá.',
      type:   'normal',
      source: 'DeFiLlama',
    },
  ],

  SOL: [
    {
      title:  'Solana DEX objem prekonáva Ethereum v 7-dňovom porovnaní — retail adopcia zrýchľuje.',
      type:   'alert',
      tag:    'Surge',
      source: 'DeFiLlama / Dune',
    },
    {
      title:  'JitoSOL MEV výnosy rastú — staking na Solane prináša nadštandardné APY pre dlhodobých investorov.',
      type:   'normal',
      source: 'Jito Labs',
    },
    {
      title:  'Solana sieť zvládla záťažový test bez výpadku — 65 000+ TPS potvrdené na mainnet.',
      type:   'normal',
      source: 'Solana Status / Validators.app',
    },
    {
      title:  'Pump.fun a meme coin aktivita generuje rekordné poplatky — SOL stakers profitujú.',
      type:   'normal',
      source: 'Dune Analytics',
    },
    {
      title:  'Solana validator decentralizácia sa zlepšuje — Nakamoto koeficient narastá na nové maximum.',
      type:   'normal',
      source: 'Solana Compass',
    },
  ],
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const TOKEN_COLOR: Record<OctToken, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
};

// ─── component ────────────────────────────────────────────────────────────────

interface Props { activeToken: OctToken }

export function MacroNewsTicker({ activeToken }: Props) {
  const { messages: cached } = useInstitutionalRadar(activeToken);
  const items = cached ?? NEWS_DB[activeToken];

  // Default to first alert-type item; fall back to index 0
  const defaultIdx = Math.max(0, items.findIndex(i => i.type === 'alert'));
  const [idx, setIdx] = useState(defaultIdx);

  // Reset to default when token switches
  const [lastToken, setLastToken] = useState<OctToken>(activeToken);
  if (activeToken !== lastToken) {
    setLastToken(activeToken);
    setIdx(Math.max(0, items.findIndex(i => i.type === 'alert')));
  }

  const item    = items[idx] ?? items[0];
  const isFlash = item.type === 'alert';
  const total   = items.length;

  function prev() { setIdx(i => (i - 1 + total) % total); }
  function next() { setIdx(i => (i + 1) % total); }

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
          Inštitucionálny radar
        </p>

        {/* Token badge */}
        <span
          className="px-1.5 py-0.5 rounded text-[8px] font-bold text-background"
          style={{ backgroundColor: TOKEN_COLOR[activeToken] }}
        >
          {activeToken}
        </span>

        {/* Flash badge */}
        {isFlash && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
            <Zap className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide">
              {item.tag ?? 'Flash'}
            </span>
          </span>
        )}

        {/* Pagination */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={prev}
            className="p-0.5 rounded hover:bg-secondary transition-colors"
            aria-label="Predchádzajúca správa"
          >
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          </button>
          <span className="text-[9px] text-muted-foreground/60 tabular-nums w-6 text-center">
            {idx + 1}/{total}
          </span>
          <button
            onClick={next}
            className="p-0.5 rounded hover:bg-secondary transition-colors"
            aria-label="Ďalšia správa"
          >
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* News card */}
      <div
        className={`flex items-start gap-2 rounded-lg p-2.5 ${
          isFlash ? 'bg-amber-500/8 border border-amber-500/20' : 'bg-secondary/20'
        }`}
      >
        {/* Token thumbnail */}
        <div className="shrink-0 mt-0.5">
          <img
            src={TOKEN_IMG[activeToken]}
            alt={activeToken}
            width={22}
            height={22}
            className="rounded-full"
            onError={e => {
              // Fallback: hide img and show colored dot
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const next = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (next) next.style.display = 'flex';
            }}
          />
          {/* Fallback dot (hidden by default) */}
          <div
            className="w-[22px] h-[22px] rounded-full items-center justify-center text-[8px] font-bold text-background"
            style={{ backgroundColor: TOKEN_COLOR[activeToken], display: 'none' }}
          >
            {activeToken.slice(0, 1)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1">
            {isFlash && <Zap className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />}
            <p className={`text-[11px] font-semibold leading-snug ${
              isFlash ? 'text-amber-100' : 'text-foreground'
            }`}>
              {item.title}
            </p>
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-1">{item.source}</p>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1 mt-2">
        {items.map((it, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`rounded-full transition-all ${
              i === idx
                ? 'w-3 h-1.5'
                : 'w-1.5 h-1.5 opacity-30 hover:opacity-60'
            }`}
            style={{ backgroundColor: i === idx ? TOKEN_COLOR[activeToken] : '#6b7280' }}
            aria-label={`Správa ${i + 1}`}
          />
        ))}
      </div>

      {/* Footer */}
      <p className="text-[9px] text-muted-foreground/40 text-center mt-2">
        Prehľad: Inštitucionálny radar (Fundamenty)
      </p>
    </div>
  );
}
