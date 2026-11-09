import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const TABLES = [
  'app_settings',
  'dca_purchases',
  'capital_entries',
  'weekly_scores',
  'limit_orders',
  'staking_rewards',
] as const;

type TableName = typeof TABLES[number];

interface BackupPayload {
  version: 1;
  exported_at: string;
  tables: Partial<Record<TableName, unknown[]>>;
}

export function BackupRestoreCard() {
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [confirmImport, setConfirmImport] = useState<BackupPayload | null>(null);

  const handleExport = async () => {
    setBusy('export');
    try {
      const payload: BackupPayload = {
        version: 1,
        exported_at: new Date().toISOString(),
        tables: {},
      };
      for (const t of TABLES) {
        const { data, error } = await supabase.from(t).select('*');
        if (error) throw error;
        payload.tables[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buy-simple-dca-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup vyexportovaný');
    } catch (e) {
      console.error(e);
      toast.error('Export zlyhal');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      if (parsed.version !== 1 || !parsed.tables) {
        toast.error('Neplatný backup súbor');
        return;
      }
      setConfirmImport(parsed);
    } catch {
      toast.error('Nepodarilo sa prečítať súbor');
    }
  };

  const performImport = async () => {
    if (!confirmImport) return;
    setBusy('import');
    try {
      // Restore order: settings first (update), then data tables (delete + insert)
      const settingsRows = confirmImport.tables.app_settings ?? [];
      if (settingsRows.length > 0) {
        const s = settingsRows[0] as Record<string, unknown>;
        const { id, ...rest } = s;
        if (id) {
          await supabase.from('app_settings').update(rest as never).eq('id', id as string);
        }
      }

      const dataTables: TableName[] = ['dca_purchases', 'capital_entries', 'weekly_scores', 'limit_orders', 'staking_rewards'];
      for (const t of dataTables) {
        const rows = confirmImport.tables[t] ?? [];
        // Wipe + insert
        await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (rows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.from(t).insert(rows as any);
          if (error) throw error;
        }
      }
      toast.success('Backup obnovený. Obnovte stránku.');
      setConfirmImport(null);
    } catch (e) {
      console.error(e);
      toast.error('Import zlyhal');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Backup & obnova (JSON)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Stiahnite si všetky dáta ako JSON (ulozte do Proton Drive). Import prepíše všetky existujúce dáta.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleExport}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {busy === 'export' ? 'Exportujem…' : 'Export JSON'}
        </button>

        <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold cursor-pointer">
          <Upload className="w-4 h-4" />
          Import JSON
          <input type="file" accept="application/json" className="hidden" onChange={handleFile} disabled={busy !== null} />
        </label>
      </div>

      {confirmImport && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-destructive">
            ⚠️ Toto prepíše VŠETKY dáta. Pokračovať?
          </p>
          <p className="text-[11px] text-muted-foreground">
            DCA: {(confirmImport.tables.dca_purchases ?? []).length} • Capital: {(confirmImport.tables.capital_entries ?? []).length} • Weeks: {(confirmImport.tables.weekly_scores ?? []).length} • Orders: {(confirmImport.tables.limit_orders ?? []).length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={performImport}
              disabled={busy === 'import'}
              className="flex-1 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-50"
            >
              {busy === 'import' ? 'Obnovujem…' : 'Áno, obnoviť'}
            </button>
            <button
              onClick={() => setConfirmImport(null)}
              disabled={busy === 'import'}
              className="flex-1 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-semibold"
            >
              Zrušiť
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
