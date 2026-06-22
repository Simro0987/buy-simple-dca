/**
 * DailyRiskReportCard — inštitucionálny denný analytický report (Deep Space Bento).
 */
import { useState } from 'react';
import { FileText, RefreshCw, Copy, Check, Clock, AlertTriangle, Send } from 'lucide-react';
import { Bento, Label, Money, Chip } from '@/components/deep-space/primitives';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import type { DailyRiskReport } from '@/lib/portfolio/dailyRiskReport';

interface Props {
  lang: Lang;
  report: DailyRiskReport | null;
  reportText: string | null;
  lastGeneratedAt: string | null;
  needsToday: boolean;
  onGenerate: () => void;
  onSendTelegram?: () => Promise<boolean>;
  generating?: boolean;
  sendingTelegram?: boolean;
  telegramSentAt?: string | null;
}

function formatWhen(iso: string | null, sk: boolean): string {
  if (!iso) return sk ? 'ešte nevygenerovaný' : 'not generated yet';
  return new Date(iso).toLocaleString(sk ? 'sk-SK' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 font-mono">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Bullet({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <p className={`text-xs font-mono leading-relaxed pl-3 border-l-2 ${warn ? 'border-orange-500/60 text-orange-200/90' : 'border-white/10 text-white/65'}`}>
      {children}
    </p>
  );
}

export function DailyRiskReportCard({
  lang, report, reportText, lastGeneratedAt, needsToday, onGenerate, onSendTelegram,
  generating, sendingTelegram, telegramSentAt,
}: Props) {
  const sk = lang === 'sk';
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const copyReport = async () => {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Bento delay={0.24} className="p-5 md:p-6 space-y-5 border-white/[0.12]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#14F195]" />
          <span className="text-sm font-bold text-white uppercase tracking-widest">
            {sk ? 'Analytický report' : 'Analytical report'}
          </span>
          <Chip color={needsToday ? 'amber' : 'green'}>
            {needsToday ? (sk ? 'ČAKÁ 19:00' : 'PENDING 19:00') : (sk ? 'AKTUÁLNY' : 'CURRENT')}
          </Chip>
          {telegramSentAt && (
            <Chip color="purple">
              <Send className="w-3 h-3 inline mr-0.5" />
              TG
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {reportText && (
            <button
              onClick={() => void copyReport()}
              className="p-2 rounded-xl border border-white/10 text-white/40 hover:text-white transition-colors"
              title={sk ? 'Kopírovať report' : 'Copy report'}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#14F195]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs font-mono text-white/50 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            {sk ? 'Generovať' : 'Generate'}
          </button>
          {report && onSendTelegram && (
            <button
              onClick={() => void onSendTelegram()}
              disabled={sendingTelegram}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#14F195]/30 text-xs font-mono text-[#14F195]/80 hover:text-[#14F195] hover:border-[#14F195]/50 transition-colors disabled:opacity-40"
            >
              <Send className={`w-3.5 h-3.5 ${sendingTelegram ? 'animate-pulse' : ''}`} />
              Telegram
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-mono text-white/30">
        <Clock className="w-3 h-3" />
        <span>
          {sk ? 'Posledný report' : 'Last report'}: {formatWhen(lastGeneratedAt, sk)}
          {' · '}
          {sk ? 'automaticky denne o 19:00 SEČ' : 'auto daily at 19:00 CET'}
          {telegramSentAt && (
            <>
              {' · '}
              {sk ? 'Telegram' : 'Telegram'}: {formatWhen(telegramSentAt, sk)}
            </>
          )}
        </span>
      </div>

      {!report ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-8 text-center">
          <p className="text-sm text-white/40 font-mono">
            {sk
              ? 'Denný report sa vygeneruje automaticky o 19:00 alebo po kliknutí na Generovať.'
              : 'Daily report auto-generates at 19:00 or click Generate.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4">
            <Label>{sk ? 'Executive summary' : 'Executive summary'}</Label>
            <p className="text-sm text-white/75 font-mono leading-relaxed mt-2">{report.executiveSummary}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: sk ? 'Hodnota' : 'Value', v: formatUsd(report.totalValue) },
              { l: sk ? 'Likvidita' : 'Liquidity', v: formatUsd(report.netLiquidity) },
              { l: '24H PnL', v: `${report.pnl24hUsd >= 0 ? '+' : ''}${formatUsd(report.pnl24hUsd)}`, pos: report.pnl24hUsd >= 0 },
              { l: sk ? 'Kum. PnL' : 'Cum. PnL', v: `${report.cumulativePnlUsd >= 0 ? '+' : ''}${formatUsd(report.cumulativePnlUsd)}`, pos: report.cumulativePnlUsd >= 0 },
            ].map(s => (
              <div key={s.l} className="bg-black/30 rounded-2xl p-3 border border-white/[0.06]">
                <Label>{s.l}</Label>
                <Money size="md" className="mt-1 block" positive={s.pos} negative={s.pos === false}>
                  {s.v}
                </Money>
              </div>
            ))}
          </div>

          <Section title={sk ? 'Alokácia' : 'Allocation'}>
            {report.allocations.map(a => (
              <Bullet key={a.symbol}>
                <span className="font-bold text-white">{a.symbol}</span>
                {' '}{formatUsd(a.value)} · {a.actualPct.toFixed(1)} %
                <span className="text-white/35"> (cieľ {(a.targetPct * 100).toFixed(0)} %)</span>
              </Bullet>
            ))}
          </Section>

          <Section title="WACB vs Spot">
            {report.wacb.map(w => (
              <Bullet key={w.symbol}>
                {w.holdings <= 0 ? (
                  <span>{w.symbol}: —</span>
                ) : (
                  <>
                    <span className="font-bold text-white">{w.symbol}</span>
                    {' '}WACB {formatUsd(w.wacb)} · Spot {formatUsd(w.spot)}
                    {' · '}
                    <span className={w.premiumPct >= 0 ? 'text-[#14F195]' : 'text-red-400'}>
                      {w.premiumPct >= 0 ? '+' : ''}{w.premiumPct.toFixed(2)} %
                    </span>
                  </>
                )}
              </Bullet>
            ))}
          </Section>

          <Section title={sk ? 'Rizikový index' : 'Risk index'}>
            <Bullet>
              Fear & Greed <span className="text-white font-bold">{report.fearGreed}</span>
              {' · '}LiveRiskScore <span className="text-white font-bold">{report.liveRiskScore.toFixed(1)}</span>
            </Bullet>
          </Section>

          {report.concentrationAlerts.length > 0 && (
            <Section title={sk ? 'Koncentračné riziko' : 'Concentration risk'}>
              {report.concentrationAlerts.map((a, i) => (
                <Bullet key={i} warn>
                  <AlertTriangle className="w-3 h-3 inline mr-1 text-orange-400" />
                  {a.message}
                </Bullet>
              ))}
            </Section>
          )}

          <Section title={sk ? 'Konzervatívne aktívum' : 'Conservative asset'}>
            <Bullet>
              <span className="font-bold text-[#F7931A]">{report.conservativeAsset}</span>
              {' — '}{report.conservativeSummary}
            </Bullet>
          </Section>

          <button
            onClick={() => setShowRaw(v => !v)}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 uppercase tracking-wider"
          >
            {showRaw ? (sk ? 'Skryť plný text' : 'Hide full text') : (sk ? 'Zobraziť plný text reportu' : 'Show full report text')}
          </button>

          {showRaw && reportText && (
            <pre className="text-[10px] font-mono text-white/50 whitespace-pre-wrap leading-relaxed rounded-2xl border border-white/[0.06] bg-black/50 p-4 max-h-80 overflow-y-auto">
              {reportText}
            </pre>
          )}
        </div>
      )}
    </Bento>
  );
}
