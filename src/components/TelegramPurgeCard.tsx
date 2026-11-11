import { useState } from 'react';
import { Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { purgeTelegramHistory } from '@/lib/telegramDcaSync';

/**
 * "Vymazať všetko" — sends a purge signal to the Telegram bot which deletes
 * all previously sent messages, notifications and logs.
 */
export function TelegramPurgeCard() {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');
  const [info, setInfo] = useState<string>('');

  const run = async () => {
    setState('busy');
    const res = await purgeTelegramHistory(150);
    if (res.success) {
      const d = res.data as { trackedDeleted?: number; sweptDeleted?: number } | undefined;
      const total = (d?.trackedDeleted ?? 0) + (d?.sweptDeleted ?? 0);
      setInfo(`Vymazaných správ: ${total}`);
      setState('done');
    } else {
      setInfo(res.error ?? 'Neznáma chyba');
      setState('error');
    }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Trash2 className="w-5 h-5 text-destructive" />
        <span className="font-medium text-foreground">Vymazať históriu bota</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Odošle purge signál botovi — zmaže všetky doteraz odoslané správy, notifikácie a logy
        v Telegram chate. Zrušenie aktívneho príkazu maže svoje správy automaticky.
      </p>

      {state === 'confirm' ? (
        <div className="flex gap-2">
          <button
            onClick={run}
            className="flex-1 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold"
          >
            Áno, vymazať všetko
          </button>
          <button
            onClick={() => setState('idle')}
            className="px-3 py-2 rounded-lg bg-secondary text-foreground text-sm"
          >
            Zrušiť
          </button>
        </div>
      ) : (
        <button
          onClick={() => setState('confirm')}
          disabled={state === 'busy'}
          className="w-full px-3 py-2 rounded-lg bg-destructive/15 text-destructive text-sm font-semibold ring-1 ring-destructive/40 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Vymazať všetko
        </button>
      )}

      {state === 'done' && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> {info}
        </div>
      )}
      {state === 'error' && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5" /> {info}
        </div>
      )}
    </div>
  );
}
