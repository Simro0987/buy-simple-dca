import { useState } from 'react';
import { Zap, Radio, Newspaper, BarChart3, TrendingUp, Globe } from 'lucide-react';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang }

// ─── internal news database ──────────────────────────────────────────────────

type NewsAsset = 'BTC' | 'ETH' | 'SOL' | 'MAKRO';
type NewsType  = 'normal' | 'alert';

interface NewsItem {
  id:      number;
  asset:   NewsAsset;
  type:    NewsType;
  tag?:    string;
  title:   string;
  detail?: string;
  source:  string;
}

const NEWS: NewsItem[] = [
  // ── MAKRO ─────────────────────────────────────────────────────────────────
  {
    id: 1, asset: 'MAKRO', type: 'alert', tag: 'Fed',
    title:  'Fed ponechal úrokové sadzby nezmenené — globálna likvidita zostáva stabilná.',
    detail: 'Rozhodnutie FOMC: sadzba 5,25–5,50 %. Trh ho interpretuje ako neutrálny signál pre rizikové aktíva.',
    source: 'Bloomberg / FOMC',
  },
  {
    id: 2, asset: 'MAKRO', type: 'alert', tag: 'Cyklus',
    title:  'Halving 2024 prebehol úspešne — historicky po halvingu nasleduje 12–18-mesačný bull market.',
    detail: 'Odmena za blok klesla z 6,25 na 3,125 BTC. Predchádzajúce halvingové cykly (2016, 2020) viedli k novým ATH.',
    source: 'Blockchain historické dáta',
  },
  {
    id: 3, asset: 'MAKRO', type: 'normal',
    title:  'Globálna likvidita M2 rastie — historicky pozitívny makro signál pre kryptorh.',
    source: 'Fed / ECB / PBoC data',
  },
  {
    id: 4, asset: 'MAKRO', type: 'normal',
    title:  'Fear & Greed Index v neutrálnej zóne (40–60) — trh bez extrémov, DCA stratégia optimálna.',
    source: 'Alternative.me',
  },
  {
    id: 5, asset: 'MAKRO', type: 'normal',
    title:  'BTC dominancia stabilizovaná okolo 55 % — altcoiny ešte čakajú na rotáciu kapitálu.',
    source: 'CoinGecko',
  },

  // ── BTC ───────────────────────────────────────────────────────────────────
  {
    id: 6, asset: 'BTC', type: 'alert', tag: 'Inštitúcie',
    title:  'MicroStrategy oznámila ďalší nákup BTC — zásoby firmy prekonávajú 500 000 BTC.',
    detail: 'Celkové holdings na rekordnej úrovni. Firemná treasury stratégia naďalej signalizuje inštitucionálnu dôveru.',
    source: 'MSTR / SEC Filing',
  },
  {
    id: 7, asset: 'BTC', type: 'alert', tag: 'ETF',
    title:  'Spot BTC ETF zaznamenal 5 po sebe idúcich dní čistých prílevov — inštitucionálny dopyt rastie.',
    source: 'CoinDesk / Farside Investors',
  },
  {
    id: 8, asset: 'BTC', type: 'normal',
    title:  'Bitcoin drží kľúčovú podporu nad 200-týždenným kĺzavým priemerom — makro trend bullish.',
    source: 'TradingView / Glassnode',
  },
  {
    id: 9, asset: 'BTC', type: 'normal',
    title:  'On-chain dáta: Dlhodobí držitelia (LTH) akumulujú — podiel supply mimo búrz rastie na maximum.',
    source: 'Glassnode (free tier)',
  },
  {
    id: 10, asset: 'BTC', type: 'normal',
    title:  'Hash rate Bitcoinu na historickom maxime — bezpečnosť siete posilnená, ťažiari optimistickí.',
    source: 'Blockchain.com',
  },

  // ── ETH ───────────────────────────────────────────────────────────────────
  {
    id: 11, asset: 'ETH', type: 'alert', tag: 'SEC',
    title:  'SEC stále posudzuje dokumenty k spot ETH ETF — regulačná neistota pretrváva.',
    detail: 'Schválenie ETH ETF by mohlo priniesť podobné prílevy ako pri BTC ETF v januári 2024.',
    source: 'Reuters / Bloomberg',
  },
  {
    id: 12, asset: 'ETH', type: 'normal',
    title:  'ETH supply dezinflačné — EIP-1559 spaľuje viac ETH ako sa vydáva pri súčasnej aktivite.',
    source: 'Ultrasound.money',
  },
  {
    id: 13, asset: 'ETH', type: 'normal',
    title:  'Rocket Pool rETH dosiahol rekordnú TVL — liquid staking ekosystém Ethereum silno rastie.',
    source: 'DeFiLlama',
  },
  {
    id: 14, asset: 'ETH', type: 'normal',
    title:  'Ethereum L2 siete (Arbitrum, Base, Optimism) spracovávajú viac TXs ako mainnet — ekosystém škáluje.',
    source: 'L2Beat',
  },
  {
    id: 15, asset: 'ETH', type: 'normal',
    title:  'DeFi TVL na Ethereum mainnet stabilizovaný nad $60 mld — on-chain aktivita zdravá.',
    source: 'DeFiLlama',
  },

  // ── SOL ───────────────────────────────────────────────────────────────────
  {
    id: 16, asset: 'SOL', type: 'alert', tag: 'Surge',
    title:  'Solana DEX objem prekonáva Ethereum v 7-dňovom porovnaní — retail adopcia zrýchľuje.',
    source: 'DeFiLlama / Dune Analytics',
  },
  {
    id: 17, asset: 'SOL', type: 'normal',
    title:  'JitoSOL MEV výnosy rastú — staking na Solane prináša nadštandardné APY pre dlhodobých DCA investorov.',
    source: 'Jito Labs',
  },
  {
    id: 18, asset: 'SOL', type: 'normal',
    title:  'Solana mainnet zvládol záťažový test bez výpadku — 65 000+ TPS potvrdené.',
    source: 'Solana Status / Validators.app',
  },
  {
    id: 19, asset: 'SOL', type: 'normal',
    title:  'Pump.fun a meme coin aktivita generuje rekordné poplatky — SOL stakers priamo profitujú.',
    source: 'Dune Analytics',
  },
  {
    id: 20, asset: 'SOL', type: 'normal',
    title:  'Solana validator decentralizácia sa zlepšuje — Nakamoto koeficient na historickom maxime.',
    source: 'Solana Compass',
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

const ASSET_COLOR: Record<NewsAsset, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', MAKRO: '#14b8a6',
};

const ASSET_LABEL: Record<NewsAsset, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', MAKRO: 'Makro',
};

type FilterVal = 'ALL' | NewsAsset;

const FILTERS: { id: FilterVal; label: string; icon: typeof Globe }[] = [
  { id: 'ALL',    label: 'Všetko', icon: Newspaper },
  { id: 'MAKRO',  label: 'Makro',  icon: Globe      },
  { id: 'BTC',    label: 'BTC',    icon: TrendingUp  },
  { id: 'ETH',    label: 'ETH',    icon: TrendingUp  },
  { id: 'SOL',    label: 'SOL',    icon: TrendingUp  },
];

// ─── component ────────────────────────────────────────────────────────────────

export function OverviewPage({ lang: _lang }: Props) {
  const [filter, setFilter] = useState<FilterVal>('ALL');

  const displayed = NEWS
    .filter(n => filter === 'ALL' || n.asset === filter)
    .sort((a, b) => {
      // alerts first, then by id (insertion order)
      if (a.type === b.type) return a.id - b.id;
      return a.type === 'alert' ? -1 : 1;
    });

  const alertCount = displayed.filter(n => n.type === 'alert').length;

  return (
    <div className="space-y-3">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            Noviny
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inštitucionálny radar · BTC, ETH, SOL
          </p>
        </div>
        {alertCount > 0 && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400">{alertCount} flash</span>
          </span>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 border ${
              filter === f.id
                ? 'text-background border-transparent'
                : 'bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground'
            }`}
            style={filter === f.id
              ? { backgroundColor: f.id === 'ALL' ? 'hsl(var(--primary))' : ASSET_COLOR[f.id as NewsAsset] }
              : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* News list */}
      <div className="space-y-2">
        {displayed.map(item => {
          const isFlash = item.type === 'alert';
          return (
            <div
              key={item.id}
              className={`glass-card p-3 transition-all ${
                isFlash ? 'border-amber-500/35 bg-amber-500/5' : ''
              }`}
            >
              <div className="flex items-start gap-2.5">
                {/* Asset dot */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-background shrink-0 mt-0.5"
                  style={{ backgroundColor: ASSET_COLOR[item.asset] }}
                >
                  {item.asset === 'MAKRO' ? <Globe className="w-3 h-3" /> : item.asset.slice(0, 1)}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide"
                      style={{ color: ASSET_COLOR[item.asset] }}
                    >
                      {ASSET_LABEL[item.asset]}
                    </span>

                    {isFlash && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
                        <Zap className="w-2 h-2 text-amber-400" />
                        <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide">
                          {item.tag ?? 'Flash'}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <p className={`text-[12px] font-semibold leading-snug ${
                    isFlash ? 'text-amber-100' : 'text-foreground'
                  }`}>
                    {item.title}
                  </p>

                  {/* Optional detail */}
                  {item.detail && (
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      {item.detail}
                    </p>
                  )}

                  {/* Source */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <Radio className="w-2.5 h-2.5 text-muted-foreground/40" />
                    <span className="text-[9px] text-muted-foreground/50">{item.source}</span>
                  </div>
                </div>

                {/* Alert icon */}
                {isFlash && (
                  <BarChart3 className="w-3.5 h-3.5 text-amber-400/60 shrink-0 mt-0.5" />
                )}
              </div>
            </div>
          );
        })}

        {displayed.length === 0 && (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Žiadne správy pre tento filter.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground/50 text-center pb-2">
        Inštitucionálny prehľad fundamentov
      </p>
    </div>
  );
}
