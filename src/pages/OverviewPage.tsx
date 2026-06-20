import { useState } from 'react';
import { Zap, Radio, Globe, Filter } from 'lucide-react';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang }

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
  { id: 1,  asset: 'MAKRO', type: 'alert', tag: 'Fed',         title: 'Fed ponechal úrokové sadzby nezmenené — globálna likvidita zostáva stabilná.', detail: 'Rozhodnutie FOMC: sadzba 5,25–5,50 %. Trh interpretuje ako neutrálny signál pre rizikové aktíva.', source: 'Bloomberg / FOMC' },
  { id: 2,  asset: 'MAKRO', type: 'alert', tag: 'Cyklus',      title: 'Halving 2024 prebehol — historicky po halvingu nasleduje 12–18-mesačný bull market.', detail: 'Odmena za blok klesla z 6,25 na 3,125 BTC. Predchádzajúce cykly viedli k novým ATH.', source: 'Blockchain historické dáta' },
  { id: 3,  asset: 'MAKRO', type: 'normal',                    title: 'Globálna likvidita M2 rastie — historicky pozitívny makro signál pre kryptorh.', source: 'Fed / ECB / PBoC data' },
  { id: 4,  asset: 'MAKRO', type: 'normal',                    title: 'Fear & Greed Index v neutrálnej zóne (40–60) — trh bez extrémov, DCA optimálna.', source: 'Alternative.me' },
  { id: 5,  asset: 'MAKRO', type: 'normal',                    title: 'BTC dominancia stabilizovaná okolo 55 % — altcoiny čakajú na rotáciu kapitálu.', source: 'CoinGecko' },
  { id: 6,  asset: 'BTC',   type: 'alert', tag: 'Inštitúcie',  title: 'MicroStrategy oznámila ďalší nákup BTC — zásoby firmy prekonávajú 500 000 BTC.', detail: 'Firemná treasury stratégia naďalej signalizuje inštitucionálnu dôveru v Bitcoin.', source: 'MSTR / SEC Filing' },
  { id: 7,  asset: 'BTC',   type: 'alert', tag: 'ETF',         title: 'Spot BTC ETF zaznamenal 5 po sebe idúcich dní čistých prílevov — inštitucionálny dopyt rastie.', source: 'CoinDesk / Farside Investors' },
  { id: 8,  asset: 'BTC',   type: 'normal',                    title: 'Bitcoin drží kľúčovú podporu nad 200-týždenným kĺzavým priemerom — makro trend bullish.', source: 'TradingView / Glassnode' },
  { id: 9,  asset: 'BTC',   type: 'normal',                    title: 'On-chain: Dlhodobí držitelia (LTH) akumulujú — podiel supply mimo búrz rastie na maximum.', source: 'Glassnode (free tier)' },
  { id: 10, asset: 'BTC',   type: 'normal',                    title: 'Hash rate Bitcoinu na historickom maxime — bezpečnosť siete posilnená, ťažiari optimistickí.', source: 'Blockchain.com' },
  { id: 11, asset: 'ETH',   type: 'alert', tag: 'SEC',         title: 'SEC stále posudzuje dokumenty k spot ETH ETF — regulačná neistota pretrváva.', detail: 'Schválenie by mohlo priniesť podobné prílevy ako pri BTC ETF v januári 2024.', source: 'Reuters / Bloomberg' },
  { id: 12, asset: 'ETH',   type: 'normal',                    title: 'ETH supply dezinflačné — EIP-1559 spaľuje viac ETH ako sa vydáva pri súčasnej aktivite.', source: 'Ultrasound.money' },
  { id: 13, asset: 'ETH',   type: 'normal',                    title: 'Rocket Pool rETH dosiahol rekordnú TVL — liquid staking ekosystém Ethereum silno rastie.', source: 'DeFiLlama' },
  { id: 14, asset: 'ETH',   type: 'normal',                    title: 'Ethereum L2 siete spracovávajú viac TXs ako mainnet — ekosystém škáluje efektívne.', source: 'L2Beat' },
  { id: 15, asset: 'ETH',   type: 'normal',                    title: 'DeFi TVL na Ethereum mainnet stabilizovaný nad $60 mld — on-chain aktivita zdravá.', source: 'DeFiLlama' },
  { id: 16, asset: 'SOL',   type: 'alert', tag: 'Surge',       title: 'Solana DEX objem prekonáva Ethereum v 7-dňovom porovnaní — retail adopcia zrýchľuje.', source: 'DeFiLlama / Dune Analytics' },
  { id: 17, asset: 'SOL',   type: 'normal',                    title: 'JitoSOL MEV výnosy rastú — staking na Solane prináša nadštandardné APY pre DCA investorov.', source: 'Jito Labs' },
  { id: 18, asset: 'SOL',   type: 'normal',                    title: 'Solana mainnet zvládol záťažový test bez výpadku — 65 000+ TPS potvrdené.', source: 'Solana Status' },
  { id: 19, asset: 'SOL',   type: 'normal',                    title: 'Pump.fun a meme coin aktivita generuje rekordné poplatky — SOL stakers profitujú.', source: 'Dune Analytics' },
  { id: 20, asset: 'SOL',   type: 'normal',                    title: 'Solana validator decentralizácia sa zlepšuje — Nakamoto koeficient na historickom maxime.', source: 'Solana Compass' },
];

// ─── visual config ────────────────────────────────────────────────────────────

const ASSET_CFG: Record<NewsAsset, { color: string; label: string; img: string | null }> = {
  BTC:   { color: '#F7931A', label: 'Bitcoin', img: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
  ETH:   { color: '#627EEA', label: 'Ethereum', img: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  SOL:   { color: '#9945FF', label: 'Solana', img: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
  MAKRO: { color: '#14b8a6', label: 'Makro', img: null },
};

const CAT_TAG: Record<NewsAsset, { bg: string; text: string; label: string }> = {
  BTC:   { bg: 'rgba(247,147,26,0.14)',  text: '#F7931A', label: 'Krypto' },
  ETH:   { bg: 'rgba(98,126,234,0.14)',  text: '#627EEA', label: 'Krypto' },
  SOL:   { bg: 'rgba(153,69,255,0.14)',  text: '#9945FF', label: 'Krypto' },
  MAKRO: { bg: 'rgba(20,184,166,0.14)',  text: '#14b8a6', label: 'Makro'  },
};

type FilterVal = 'ALL' | NewsAsset;

const FILTERS: { id: FilterVal; label: string }[] = [
  { id: 'ALL',   label: 'Všetko' },
  { id: 'MAKRO', label: 'Makro'  },
  { id: 'BTC',   label: 'BTC'    },
  { id: 'ETH',   label: 'ETH'    },
  { id: 'SOL',   label: 'SOL'    },
];

// ─── component ────────────────────────────────────────────────────────────────

export function OverviewPage({ lang: _lang }: Props) {
  const [filter, setFilter] = useState<FilterVal>('ALL');

  const displayed = NEWS
    .filter(n => filter === 'ALL' || n.asset === filter)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'alert' ? -1 : 1;
      return a.id - b.id;
    });

  const alertCount = displayed.filter(n => n.type === 'alert').length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            Noviny
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Inštitucionálny radar · BTC, ETH, SOL
          </p>
        </div>
        {alertCount > 0 && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/12 border border-amber-500/25">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400 tabular-nums">{alertCount} flash</span>
          </span>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        <Filter className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        {FILTERS.map(f => {
          const cfg = f.id === 'ALL' ? null : ASSET_CFG[f.id as NewsAsset];
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shrink-0"
              style={{
                background: isActive
                  ? (cfg ? `${cfg.color}22` : 'rgba(34,197,94,0.15)')
                  : 'rgba(255,255,255,0.04)',
                border: isActive
                  ? `1px solid ${cfg ? cfg.color + '50' : 'rgba(34,197,94,0.4)'}`
                  : '1px solid rgba(255,255,255,0.07)',
                color: isActive
                  ? (cfg ? cfg.color : 'hsl(142 62% 40%)')
                  : 'rgba(255,255,255,0.45)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* News list */}
      <div className="space-y-1.5">
        {displayed.map(item => {
          const isFlash  = item.type === 'alert';
          const assetCfg = ASSET_CFG[item.asset];
          const catTag   = CAT_TAG[item.asset];

          return (
            <div
              key={item.id}
              className="glass-card p-3"
              style={isFlash ? {
                borderColor: 'rgba(251,191,36,0.25)',
                background: 'rgba(15,20,32,0.92)',
              } : {}}
            >
              <div className="flex items-start gap-2.5">
                {/* Token logo */}
                <div className="shrink-0 mt-0.5">
                  {assetCfg.img ? (
                    <img
                      src={assetCfg.img}
                      alt={item.asset}
                      width={20}
                      height={20}
                      className="rounded-full"
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (next) next.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  {/* Fallback / MAKRO globe */}
                  <div
                    className={`${assetCfg.img ? 'hidden' : 'flex'} w-5 h-5 rounded-full items-center justify-center`}
                    style={{ backgroundColor: `${assetCfg.color}22`, border: `1px solid ${assetCfg.color}40` }}
                  >
                    <Globe className="w-2.5 h-2.5" style={{ color: assetCfg.color }} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Tag row */}
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {/* Category tag */}
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ background: catTag.bg, color: catTag.text }}
                    >
                      {catTag.label}
                    </span>

                    {/* Asset tag */}
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ background: `${assetCfg.color}18`, color: assetCfg.color }}
                    >
                      {item.asset}
                    </span>

                    {/* Flash tag */}
                    {isFlash && (
                      <span className="flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 uppercase tracking-wide">
                        <Zap className="w-2 h-2" />
                        {item.tag ?? 'Flash'}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <p className={`text-[11px] font-semibold leading-snug ${isFlash ? 'text-amber-50' : 'text-foreground'}`}>
                    {item.title}
                  </p>

                  {/* Optional detail */}
                  {item.detail && (
                    <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">{item.detail}</p>
                  )}

                  {/* Source */}
                  <p className="text-[8px] text-muted-foreground/40 mt-1.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30 inline-block" />
                    {item.source}
                  </p>
                </div>

                {/* Alert pulse indicator */}
                {isFlash && (
                  <div className="shrink-0 mt-1">
                    <span className="block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  </div>
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
      <p className="text-[9px] text-muted-foreground/30 text-center pb-2">
        Inštitucionálny prehľad fundamentov
      </p>
    </div>
  );
}
