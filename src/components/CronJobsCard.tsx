import { useEffect, useState, useCallback } from 'react';
import { Clock, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Lang } from '@/lib/i18n';

interface CronJob {
  jobid: number;
  jobname: string | null;
  schedule: string;
  active: boolean;
  last_run_started: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
}

interface Props {
  lang: Lang;
}

function formatRelative(iso: string | null, lang: Lang): string {
  if (!iso) return lang === 'sk' ? 'nikdy' : 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang === 'sk' ? 'pred chvíľou' : 'just now';
  if (m < 60) return lang === 'sk' ? `pred ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'sk' ? `pred ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === 'sk' ? `pred ${d} d` : `${d}d ago`;
}

function describeSchedule(schedule: string, lang: Lang): string {
  // Common cron patterns
  const map: Record<string, { sk: string; en: string }> = {
    '* * * * *': { sk: 'každú minútu', en: 'every minute' },
    '*/5 * * * *': { sk: 'každých 5 min', en: 'every 5 min' },
    '*/10 * * * *': { sk: 'každých 10 min', en: 'every 10 min' },
    '*/15 * * * *': { sk: 'každých 15 min', en: 'every 15 min' },
    '*/30 * * * *': { sk: 'každých 30 min', en: 'every 30 min' },
    '0 * * * *': { sk: 'každú hodinu', en: 'hourly' },
    '0 0 * * *': { sk: 'denne o 00:00', en: 'daily at 00:00' },
    '0 8 * * *': { sk: 'denne o 08:00', en: 'daily at 08:00' },
    '0 8 * * 1': { sk: 'pondelok 08:00', en: 'Monday 08:00' },
    '0 20 * * 0': { sk: 'nedeľa 20:00', en: 'Sunday 20:00' },
  };
  return map[schedule]?.[lang] ?? schedule;
}

export function CronJobsCard({ lang }: Props) {
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_cron_jobs_status');
      if (rpcError) throw rpcError;
      setJobs((data ?? []) as CronJob[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">
            {lang === 'sk' ? 'Cron úlohy' : 'Cron jobs'}
          </h3>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mb-2">{error}</div>
      )}

      {!jobs && !error && (
        <p className="text-xs text-muted-foreground">{lang === 'sk' ? 'Načítavam…' : 'Loading…'}</p>
      )}

      {jobs && jobs.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {lang === 'sk' ? 'Žiadne aktívne cron úlohy' : 'No active cron jobs'}
        </p>
      )}

      {jobs && jobs.length > 0 && (
        <div className="space-y-2">
          {jobs.map(job => {
            const status = job.last_run_status?.toLowerCase();
            const StatusIcon = status === 'succeeded'
              ? CheckCircle2
              : status === 'failed'
              ? XCircle
              : AlertCircle;
            const statusColor = status === 'succeeded'
              ? 'text-success'
              : status === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground';
            return (
              <div key={job.jobid} className="p-3 rounded-lg bg-secondary/50 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground text-sm truncate">
                    {job.jobname || `job #${job.jobid}`}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      job.active ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {job.active ? (lang === 'sk' ? 'AKTÍVNE' : 'ACTIVE') : (lang === 'sk' ? 'PAUZA' : 'PAUSED')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>📅 {describeSchedule(job.schedule, lang)}</span>
                  <code className="text-[10px] opacity-60">{job.schedule}</code>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <StatusIcon className={`w-3.5 h-3.5 ${statusColor}`} />
                  <span className={statusColor}>
                    {job.last_run_status || (lang === 'sk' ? 'nespustené' : 'not run')}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {formatRelative(job.last_run_started, lang)}
                  </span>
                </div>
                {job.last_run_status?.toLowerCase() === 'failed' && job.last_run_message && (
                  <p className="text-[11px] text-destructive bg-destructive/10 rounded p-1.5 mt-1 break-words">
                    {job.last_run_message.slice(0, 200)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
