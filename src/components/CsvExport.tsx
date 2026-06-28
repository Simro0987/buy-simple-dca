import { Lang } from '@/lib/i18n';
import { TOKENS } from '@/lib/crypto';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { loadHoldingsRecord } from '@/lib/portfolioRealHoldings';

interface Props {
  lang: Lang;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPortfolio() {
  const holdings = loadHoldingsRecord();
  const rows = [['Token', 'Množstvo'].join(',')];
  for (const token of TOKENS) {
    const key = token.symbol.toLowerCase();
    rows.push([token.symbol, holdings[key] || 0].join(','));
  }
  const budget = localStorage.getItem('dca-budget') || '100';
  rows.push('');
  rows.push(['DCA Rozpočet', `$${budget}`].join(','));
  downloadCsv('portfolio.csv', rows.join('\n'));
}

function exportExecutionHistory() {
  const history = JSON.parse(localStorage.getItem('execution_history') || '[]');
  const rows = [['Týždeň', 'DCA', 'BTC Limit', 'ETH Limit', 'SOL Limit'].join(',')];
  for (const week of history) {
    const limits = TOKENS.map(t => {
      const l = week.limits?.find((li: { symbol: string; filled?: boolean }) => li.symbol === t.symbol);
      return l?.filled ? 'Áno' : 'Nie';
    });
    rows.push([week.weekId, week.dcaExecuted ? 'Áno' : 'Nie', ...limits].join(','));
  }
  downloadCsv('execution-historia.csv', rows.join('\n'));
}

export function CsvExport({ lang }: Props) {
  const sk = lang === 'sk';

  const handleExport = (type: 'portfolio' | 'execution') => {
    try {
      if (type === 'portfolio') exportPortfolio();
      else exportExecutionHistory();
      toast.success(sk ? 'CSV exportovaný' : 'CSV exported');
    } catch {
      toast.error(sk ? 'Export zlyhal' : 'Export failed');
    }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Download className="w-5 h-5 text-muted-foreground" />
        <span className="font-medium text-foreground">
          {sk ? 'Export dát' : 'Data Export'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleExport('portfolio')}
          className="px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
        >
          {sk ? '📊 Portfólio CSV' : '📊 Portfolio CSV'}
        </button>
        <button
          onClick={() => handleExport('execution')}
          className="px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
        >
          {sk ? '📋 Exekúcia CSV' : '📋 Execution CSV'}
        </button>
      </div>
    </div>
  );
}
