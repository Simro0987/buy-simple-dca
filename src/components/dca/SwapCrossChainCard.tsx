import { useMemo, useState } from 'react';
import { Repeat, Clock, Sun, Shield, Coins, Rocket, AlertTriangle, XCircle } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';

type Token = 'WETH' | 'cbBTC';

export function SwapCrossChainCard() {
  const { data: prices } = usePrices();
  const [token, setToken]   = useState<Token>('WETH');
  const [amount, setAmount] = useState<number>(0);

  const priceUsd = token === 'WETH'
    ? prices?.ethereum?.usd ?? 0
    : prices?.bitcoin?.usd ?? 0;
  const usd = amount * priceUsd;

  const evalBox = useMemo(() => {
    if (token === 'WETH') {
      if (usd < 100) return {
        tone: 'amber' as const,
        text: '⚠️ Cesta je pripravená (Across), ale suma je nízka. Poplatok za L1 plyn ti zbytočne uberie z percent investície. Odporúčam ešte týždeň-dva hromadiť na Base.',
        Icon: AlertTriangle,
      };
      return {
        tone: 'green' as const,
        text: '🟢 VHODNÉ NA SWAP. Použi Across Protocol (alebo ho vyhľadaj v Jumperi). Dostaneš najlepší kurz a bleskové doručenie.',
        Icon: Shield,
      };
    }
    // cbBTC
    if (usd < 300) return {
      tone: 'red' as const,
      text: '❌ NEODPORÚČA SA. Fixný poplatok Bitcoin sieti ($5 – $10) je pre túto sumu príliš vysoký a zožral by ti podstatnú časť balíka. Pokračuj v DCA nákupoch na Base.',
      Icon: XCircle,
    };
    if (usd <= 500) return {
      tone: 'amber' as const,
      text: '⚠️ DOSTATOČNÉ. Ak nutne potrebuješ self-custody na Trezore/Ledgeri, môžeš použiť Jumper (THORchain) alebo Symbiosis, ale fixný poplatok stále pocítiš.',
      Icon: AlertTriangle,
    };
    return {
      tone: 'green' as const,
      text: '🚀 IDEÁLNA SUMA. Fixný poplatok siete sa v tomto objeme úplne stratí. Otvor Jumper (trasa THORchain) alebo Symbiosis a odlej Bitcoin na hardvér.',
      Icon: Rocket,
    };
  }, [token, usd]);

  const platform = token === 'WETH'
    ? 'Across Protocol (alebo Across trasa v Jumperi)'
    : 'Jumper Exchange (trasa THORchain) alebo Symbiosis Finance';

  const timing = token === 'WETH'
    ? 'Spusti swap ideálne v sobotu alebo nedeľu ráno pre absolútne najnižší plyn.'
    : 'Swap spúšťaj výhradne cez víkend ráno, kedy sú poplatky BTC minerov najnižšie.';

  const toneClass = (t: 'green' | 'amber' | 'red') =>
    t === 'green' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
    : t === 'amber' ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
    : 'bg-rose-500/10 border-rose-500/40 text-rose-300';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Repeat className="w-4 h-4 text-emerald-400" />
        <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">
          SWAP — Cross-Chain Native Optimizer
        </h2>
      </div>

      {/* STATIC ROUTES OVERVIEW */}
      <div className="glass-card p-3.5 bg-[#0a0d12] border border-emerald-500/10 space-y-3 text-[11px] leading-relaxed">
        <div>
          <p className="text-xs font-bold text-amber-300 mb-1 flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5" /> SOLANA (SOL)
          </p>
          <ul className="ml-4 space-y-0.5 text-muted-foreground">
            <li>• <span className="text-foreground font-semibold">Týždenný nákup (Market):</span> <span className="text-emerald-300 font-semibold">Jumper Exchange</span> (trasa Mayan) alebo <span className="text-emerald-300 font-semibold">deBridge</span></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold text-sky-300 mb-1 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> ETHEREUM (WETH / ETH)
          </p>
          <ul className="ml-4 space-y-0.5 text-muted-foreground">
            <li>• <span className="text-foreground font-semibold">Týždenný nákup (Market):</span> <span className="text-emerald-300 font-semibold">Velora</span> alebo <span className="text-emerald-300 font-semibold">Odos</span></li>
            <li>• <span className="text-foreground font-semibold">Týždenný nákup (Limit):</span> <span className="text-emerald-300 font-semibold">CoW Swap</span></li>
            <li>• <span className="text-foreground font-semibold">Mesačný presun na Ledger:</span> <span className="text-emerald-300 font-semibold">Across Protocol</span> (alebo Across trasa v Jumperi)</li>
            <li className="text-[10px] ml-3 italic flex items-center gap-1"><Clock className="w-3 h-3" /> Najlepší čas: cez víkend (sobota alebo nedeľa) ráno kvôli najlacnejšiemu plynu.</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold text-orange-300 mb-1 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" /> BITCOIN (cbBTC / BTC)
          </p>
          <ul className="ml-4 space-y-0.5 text-muted-foreground">
            <li>• <span className="text-foreground font-semibold">Týždenný nákup (Market):</span> <span className="text-emerald-300 font-semibold">Velora</span> alebo <span className="text-emerald-300 font-semibold">Odos</span></li>
            <li>• <span className="text-foreground font-semibold">Týždenný nákup (Limit):</span> <span className="text-emerald-300 font-semibold">CoW Swap</span></li>
            <li>• <span className="text-foreground font-semibold">Mesačný presun na Trezor/Ledger:</span> <span className="text-emerald-300 font-semibold">Jumper Exchange</span> (trasa THORchain) alebo <span className="text-emerald-300 font-semibold">Symbiosis Finance</span></li>
            <li className="text-[10px] ml-3 italic flex items-center gap-1"><Clock className="w-3 h-3" /> Najlepší čas: cez víkend (sobota alebo nedeľa) ráno kvôli najnižším L1 poplatkom.</li>
          </ul>
        </div>
      </div>

      {/* EVALUATOR */}
      <div className="glass-card p-3.5 bg-[#0a0d12] border border-emerald-500/10 space-y-3">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-semibold">
          Evaluátor Cross-Chain Prevodu
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Token</label>
            <div className="mt-1 flex gap-1 bg-[#06080b] border border-border rounded-lg p-0.5">
              {(['WETH', 'cbBTC'] as Token[]).map(t => (
                <button key={t} onClick={() => setToken(t)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold tabular-nums transition-colors ${
                    token === t ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted-foreground'
                  }`}
                >{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Zadaj množstvo</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              value={amount || ''}
              placeholder="0.0"
              onChange={e => setAmount(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full bg-[#06080b] border border-emerald-500/20 rounded-lg px-2.5 py-1.5 text-sm font-bold text-emerald-300 tabular-nums focus:outline-none focus:border-emerald-400/60"
            />
          </div>
        </div>

        {amount > 0 && (
          <>
            <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
              <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Orientačná hodnota</span>
              <span className="text-sm font-bold text-emerald-300 tabular-nums">
                ${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="text-[11px]">
              <p className="text-muted-foreground">Odporúčaná platforma:</p>
              <p className="text-foreground font-semibold leading-snug">{platform}</p>
            </div>

            <div className={`flex items-start gap-2 rounded-lg p-2.5 border ${toneClass(evalBox.tone)}`}>
              <evalBox.Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold leading-snug">{evalBox.text}</p>
            </div>

            <div className="flex items-start gap-2 rounded-lg p-2 bg-secondary/40 border border-border">
              <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground">Načasovanie:</span> {timing}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
