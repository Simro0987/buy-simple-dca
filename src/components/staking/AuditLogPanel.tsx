import { useState } from 'react';
import { ChevronDown, ScrollText, Trash2 } from 'lucide-react';
import { useAuditLog } from '@/stores/auditLogStore';
import { rawTokenAmount } from '@/lib/tokenAmount';

/** Collapsible audit log of every recorded layer action (local history). */
export function AuditLogPanel() {
  const { entries, clear } = useAuditLog();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-purple-500/30 bg-slate-950/70 font-mono text-[10px]">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-purple-300">
        <span className="flex items-center gap-2 font-semibold tracking-wider uppercase"><ScrollText className="w-3.5 h-3.5" />Audit log ({entries.length})</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {entries.length === 0 && <p className="text-slate-500">Zatiaľ žiadne zaznamenané akcie.</p>}
          {entries.map((e, i) => (
            <div key={e.ts + '-' + i} className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1.5 space-y-0.5">
              <div className="flex justify-between gap-2"><span className="text-slate-500">{new Date(e.ts).toLocaleString('sk-SK')}</span><span className="text-accent">{rawTokenAmount(e.amount)} {e.symbol}</span></div>
              <p className="text-slate-200 truncate">{e.action}</p>
              <p className="text-slate-400 truncate">{e.protocol} · {e.network}</p>
            </div>
          ))}
          {entries.length > 0 && (
            <button type="button" onClick={clear} className="flex items-center gap-1 text-slate-500 hover:text-destructive"><Trash2 className="w-3 h-3" />Vymazať log</button>
          )}
        </div>
      )}
    </div>
  );
}
