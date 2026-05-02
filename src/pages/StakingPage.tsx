import { useState } from 'react';
import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG, StakingPosition } from '@/lib/wallets';
import { Lock, TrendingUp, Landmark, Zap, Send } from 'lucide-react';
import { useDefiApys, DefiApyData } from '@/hooks/useDefiApys';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ContextCTAs } from '@/components/decision/ContextCTAs';
import { MasterProtocolCard } from '@/components/staking/MasterProtocolCard';
import { StakingCalculator } from '@/components/staking/StakingCalculator';

interface Props { lang: Lang; }

function getLiveApy(pos: StakingPosition, apys?: DefiApyData | null): number | null {
  if (!apys) return pos.apy ?? null;
  if (pos.protocol === 'Rocket Pool') return apys.rocketPool;
  if (pos.label.includes('wstETH') && pos.type !== 'lending') return apys.lido;
  if (pos.protocol === 'Aave V3') return apys.aaveEth;
  if (pos.protocol === 'Jito') return apys.jito;
  if (pos.protocol === 'Kamino') return apys.kaminoSol;
  return pos.apy ?? null;
}

function typeIcon(type: StakingPosition['type']) {
  if (type === 'staking') return <TrendingUp className="w-3.5 h-3.5 text-gain" />;
  if (type === 'lending') return <Landmark className="w-3.5 h-3.5 text-accent" />;
  return <Lock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function typeLabel(type: StakingPosition['type'], lang: Lang) {
  const labels = {
    sk: { hold: 'HODL', staking: 'Staking', lending: 'Lending' },
    en: { hold: 'HODL', staking: 'Staking', lending: 'Lending' },
  };
  return labels[lang][type];
}

function yieldLabel(dir: StakingPosition['yieldDirection'], lang: Lang) {
  if (!dir || dir === 'none') return null;
  const labels = {
    sk: { btc: 'Výnos ide do BTC', restake: 'Re-stake', compound: 'Auto-compound' },
    en: { btc: 'Yield → BTC', restake: 'Re-stake', compound: 'Auto-compound' },
  };
  return labels[lang][dir];
}

export function StakingPage({ lang }: Props) {
  const { data: apys, isFetching: apyLoading } = useDefiApys();
  const [sending, setSending] = useState(false);

  const handleSendMaturityAlert = async () => {
    const chatId = localStorage.getItem('telegram_chat_id')?.trim();
    if (!chatId) {
      toast.error(lang === 'sk' ? 'Nastav Telegram Chat ID v nastaveniach' : 'Set Telegram Chat ID in settings');
      return;
    }

    setSending(true);
    try {
      // Collect all staking/lending positions with yield directions
      const maturityItems: Array<Record<string, unknown>> = [];
      for (const asset of STAKING_CONFIG) {
        for (const pos of asset.positions) {
          if (pos.type === 'hold') continue;
          const liveApy = getLiveApy(pos, apys);
          maturityItems.push({
            symbol: asset.symbol,
            protocol: pos.protocol || pos.label,
            type: pos.type,
            apy: liveApy,
            action: pos.yieldDirection === 'btc'
              ? `Konvertuj výnos do BTC (APY: ${liveApy?.toFixed(1) ?? '?'}%)`
              : pos.yieldDirection === 'compound'
              ? `Auto-compound aktívny (APY: ${liveApy?.toFixed(1) ?? '?'}%)`
              : `Skontroluj pozíciu (APY: ${liveApy?.toFixed(1) ?? '?'}%)`,
          });
        }
      }

      const { error } = await supabase.functions.invoke('telegram-staking-maturity', {
        body: { chatId, maturityItems },
      });

      if (error) throw error;
      toast.success(lang === 'sk' ? 'Staking alert odoslaný na Telegram ✓' : 'Staking alert sent to Telegram ✓');
    } catch (err) {
      console.error('Staking maturity alert error:', err);
      toast.error(lang === 'sk' ? 'Nepodarilo sa odoslať alert' : 'Failed to send alert');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          {lang === 'sk' ? 'Staking & Výnosy' : 'Staking & Yields'}
        </h1>
        <button
          onClick={handleSendMaturityAlert}
          disabled={sending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20 active:bg-primary/20 disabled:opacity-50"
        >
          <Send className={`w-3.5 h-3.5 ${sending ? 'animate-pulse' : ''}`} />
          {lang === 'sk' ? 'Test maturity alert' : 'Test maturity alert'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {lang === 'sk'
          ? 'Prehľad kde pracuje tvoj kapitál. Žiadne akcie – len informácie.'
          : 'Overview of where your capital works. No actions – information only.'}
      </p>
      <div className="flex items-center gap-1.5 text-[10px]">
        <Zap className="w-3 h-3 text-green-400" />
        <span className={apyLoading ? 'text-muted-foreground animate-pulse' : 'text-green-400'}>
          {apyLoading
            ? (lang === 'sk' ? 'Načítavam APY...' : 'Loading APY...')
            : (lang === 'sk' ? 'Live APY z DefiLlama' : 'Live APY from DefiLlama')}
        </span>
      </div>

      <ContextCTAs actions={['optimize_staking', 'move_to_yield']} />

      <StakingCalculator lang={lang} />

      <MasterProtocolCard lang={lang} />

      {STAKING_CONFIG.map(asset => (
        <div key={asset.symbol} className="glass-card p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: asset.color + '20', color: asset.color }}
              >
                {asset.symbol.slice(0, 2)}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">{asset.symbol}</p>
                <p className="text-[11px] text-muted-foreground">{asset.name}</p>
              </div>
            </div>
            <span className="text-sm font-bold text-foreground">{asset.allocation}%</span>
          </div>

          {/* Positions */}
          <div className="space-y-2">
            {asset.positions.map((pos, i) => {
              const yield_ = yieldLabel(pos.yieldDirection, lang);
              return (
                <div key={i} className="flex items-start gap-2.5 bg-secondary/40 rounded-lg px-3 py-2">
                  {typeIcon(pos.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{pos.label}</span>
                      <span className="text-xs font-bold text-foreground">{pos.percentage}%</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {typeLabel(pos.type, lang)}
                      </span>
                      {pos.protocol && (
                        <span className="text-[10px] text-muted-foreground">{pos.protocol}</span>
                      )}
                      {(() => {
                        const liveApy = getLiveApy(pos, apys);
                        return liveApy != null ? (
                          <span className="text-[10px] text-gain font-medium">{liveApy.toFixed(1)}% APY</span>
                        ) : null;
                      })()}
                    </div>
                    {yield_ && (
                      <p className="text-[10px] text-accent mt-1">→ {yield_}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visual bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
            {asset.positions.map((pos, i) => {
              const colors = { hold: 'bg-muted-foreground/40', staking: 'bg-gain', lending: 'bg-accent' };
              return (
                <div
                  key={i}
                  className={`${colors[pos.type]} transition-all`}
                  style={{ width: `${pos.percentage}%` }}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Yield flow summary — Master Protokol 2026 */}
      <div className="glass-card p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground">
          {lang === 'sk' ? 'Tok výnosov (Master Protokol 2026)' : 'Yield Flow (Master Protocol 2026)'}
        </p>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            • <span className="text-foreground">ETH:</span> rETH vault (Beefy/ARB) → {lang === 'sk' ? 'výnos do BTC' : 'yield → BTC'}
          </p>
          <p className="text-xs text-muted-foreground">
            • <span className="text-foreground">SOL:</span> Kamino Multiply (jitoSOL) → {lang === 'sk' ? 'výnos do BTC' : 'yield → BTC'}
          </p>
          <p className="text-xs text-muted-foreground">
            • <span className="text-foreground">BTC:</span> Babylon (compound) + LBTC vault (Beefy/ARB) → {lang === 'sk' ? 'späť do BTC' : 'back to BTC'}
          </p>
          <p className="text-xs text-muted-foreground">
            • {lang === 'sk' ? 'Cieľ: akumulovať 1 BTC cez všetky kanály.' : 'Goal: accumulate 1 BTC across all channels.'}
          </p>
        </div>
      </div>
    </div>
  );
}
