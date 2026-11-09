import { useState } from 'react';
import { Lang } from '@/lib/i18n';
import { BtcDefiBrain } from './BtcDefiBrain';
import { EthDefiBrain } from './EthDefiBrain';
import { SolDefiBrain } from './SolDefiBrain';
import { LinkDefiBrain } from './LinkDefiBrain';
import { AaveDefiBrain } from './AaveDefiBrain';

import { HypeDefiBrain } from './HypeDefiBrain';

type TokenTab = 'BTC' | 'ETH' | 'SOL' | 'LINK' | 'AAVE' | 'HYPE';

interface Props { lang: Lang; marketScore?: number }

export function DefiBrainTabs({ lang, marketScore = 50 }: Props) {
  const [tab, setTab] = useState<TokenTab>('BTC');

  const tabs: { id: TokenTab; label: string }[] = [
    { id: 'BTC', label: 'BTC' },
    { id: 'ETH', label: 'ETH' },
    { id: 'SOL', label: 'SOL' },
    { id: 'LINK', label: 'LINK' },
    { id: 'AAVE', label: 'AAVE' },
    
    { id: 'HYPE', label: 'HYPE' },
  ];

  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-purple-500/30 bg-slate-950/60 p-1 backdrop-blur-sm">
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                active
                  ? 'bg-purple-500 text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.9)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'BTC' && <BtcDefiBrain lang={lang} />}
      {tab === 'ETH' && <EthDefiBrain lang={lang} marketScore={marketScore} />}
      {tab === 'SOL' && <SolDefiBrain lang={lang} />}
      {tab === 'LINK' && <LinkDefiBrain lang={lang} />}
      {tab === 'AAVE' && <AaveDefiBrain lang={lang} />}
      
      {tab === 'HYPE' && <HypeDefiBrain lang={lang} />}
    </div>
  );
}
