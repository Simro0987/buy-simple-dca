import { useState } from 'react';
import { AlertTriangle, ChevronUp, ShieldCheck, Activity, Flame } from 'lucide-react';

// ============================================================================
// Smart Repayment Advisor — perzistentný panel pripnutý na spodok obrazovky.
// Pôžička je výhradne WETH proti LST kolaterálu → korelácia ETH/WETH eliminuje
// USD likvidáciu. Monitorujeme preto len:
//   1) Depeg Risk (LST vs ETH)  → Depeg > 0.5 % = RED
//   2) Net Carry Spread          → záporný carry = RED (páka stráca)
//   DCA Score > 85 → GREEN (Eufória · odpákuj a ber zisk)
// ============================================================================

export interface AdvisorInputs {
  /** Aktuálne LTV v % */
  ltv: number;
  /** Depeg kolaterálu v % */
  depegPct: number;
  /** Net carry spread (yield − WETH borrow APY) v % */
  netCarry: number;
  /** Globálne DCA / cycle skóre 0–100 */
  dcaScore: number;
  collateralSymbol: string;
  /** true = páka je aktívna (exekuovaná Vrstva 3) */
  leverageActive: boolean;
}

type Level = 'red' | 'green' | 'amber' | 'neutral';

interface Verdict { level: Level; title: string; body: string; }

function buildVerdict(i: AdvisorInputs): Verdict {
  const depegRisk = i.depegPct > 0.5;
  const carryRisk = i.leverageActive && i.netCarry < 0;

  if (depegRisk || carryRisk) {
    const parts: string[] = [];
    if (depegRisk) parts.push(`Depeg ${i.collateralSymbol} ${i.depegPct.toFixed(2)} % > 0.50 %`);
    if (carryRisk) parts.push(`Net carry ${i.netCarry.toFixed(2)} % < 0`);
    return {
      level: 'red',
      title: '🔴 Okamžite splať časť WETH pôžičky',
      body: `${parts.join(' · ')}. Depeg je jediné reálne likvidačné riziko (WETH dlh je korelovaný s ETH kolaterálom) a záporný carry znamená, že páka platí viac, než zarába. Zníž LTV pod 30 % repayom WETH cez DeFi Saver.`,
    };
  }

  if (i.dcaScore > 85) {
    return {
      level: 'green',
      title: '🟢 Eufória · odpákuj a zafixuj výnos',
      body: `DCA skóre ${i.dcaScore.toFixed(0)} > 85. Trh je prehriaty — splať WETH pôžičku (unwind páky), výnos presuň do BTC/stablecoinu podľa harvest plánu.`,
    };
  }

  if (i.leverageActive && i.netCarry < 0.3) {
    return {
      level: 'amber',
      title: '🟠 Tenký net carry spread',
      body: `Net carry ${i.netCarry.toFixed(2)} % · depeg ${i.depegPct.toFixed(2)} % · LTV ${i.ltv.toFixed(1)} %. Páka zarába málo — pri raste WETH borrow APY sa carry otočí do mínusu. Priprav si WETH na čiastočný repay.`,
    };
  }

  return {
    level: 'neutral',
    title: '🟢 Pozícia je zdravá',
    body: i.leverageActive
      ? `Net carry ${i.netCarry.toFixed(2)} % · depeg ${i.depegPct.toFixed(2)} % · LTV ${i.ltv.toFixed(1)} % · DCA skóre ${i.dcaScore.toFixed(0)}. Žiadna akcia nie je potrebná.`
      : `Páka nie je aktívna. Monitorujem depeg ${i.depegPct.toFixed(2)} %, net carry ${i.netCarry.toFixed(2)} % a DCA skóre ${i.dcaScore.toFixed(0)}.`,
  };
}


const STYLES: Record<Level, { border: string; bg: string; text: string; icon: JSX.Element }> = {
  red:     { border: 'border-red-500/60',     bg: 'bg-red-950/80',     text: 'text-red-100',     icon: <AlertTriangle className="h-4 w-4 text-red-300" /> },
  green:   { border: 'border-emerald-500/50', bg: 'bg-emerald-950/80', text: 'text-emerald-100', icon: <Flame className="h-4 w-4 text-emerald-300" /> },
  amber:   { border: 'border-orange-500/50',  bg: 'bg-orange-950/80',  text: 'text-orange-100',  icon: <Activity className="h-4 w-4 text-orange-300" /> },
  neutral: { border: 'border-slate-700/70',   bg: 'bg-slate-950/85',   text: 'text-slate-200',   icon: <ShieldCheck className="h-4 w-4 text-emerald-300" /> },
};

export function SmartRepaymentAdvisor(props: AdvisorInputs) {
  const [open, setOpen] = useState(true);
  const v = buildVerdict(props);
  const s = STYLES[v.level];

  return (
    <>
      {/* spacer aby panel neprekryl obsah */}
      <div className="h-24" aria-hidden />
      <div className="fixed bottom-[58px] left-0 right-0 z-40 px-2 pb-1">
        <div
          className={`mx-auto max-w-lg rounded-2xl border ${s.border} ${s.bg} px-3 py-2 backdrop-blur-xl shadow-[0_-8px_30px_-10px_rgba(0,0,0,0.9)]`}
        >
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              {s.icon}
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-slate-400">Smart Repayment Advisor</div>
                <div className={`truncate text-[12px] font-semibold ${s.text}`}>{v.title}</div>
              </div>
            </div>
            <ChevronUp className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? '' : 'rotate-180'}`} />
          </button>

          {open && (
            <>
              <div className={`mt-1.5 text-[11px] leading-relaxed ${s.text} opacity-90`}>{v.body}</div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-md bg-black/40 p-1.5">
                  <div className="text-[9px] text-slate-500">Net carry</div>
                  <div className={`font-mono text-[12px] ${props.netCarry < 0 ? 'text-red-300' : 'text-emerald-200'}`}>
                    {`${props.netCarry >= 0 ? '+' : ''}${props.netCarry.toFixed(2)} %`}
                  </div>
                </div>

                <div className="rounded-md bg-black/40 p-1.5">
                  <div className="text-[9px] text-slate-500">LTV</div>
                  <div className="font-mono text-[12px] text-slate-200">{props.ltv > 0 ? `${props.ltv.toFixed(1)} %` : '—'}</div>
                </div>
                <div className="rounded-md bg-black/40 p-1.5">
                  <div className="text-[9px] text-slate-500">Depeg</div>
                  <div className={`font-mono text-[12px] ${props.depegPct > 0.5 ? 'text-red-300' : 'text-slate-200'}`}>{props.depegPct.toFixed(2)} %</div>
                </div>
                <div className="rounded-md bg-black/40 p-1.5">
                  <div className="text-[9px] text-slate-500">DCA skóre</div>
                  <div className={`font-mono text-[12px] ${props.dcaScore > 85 ? 'text-emerald-300' : 'text-slate-200'}`}>{props.dcaScore.toFixed(0)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
