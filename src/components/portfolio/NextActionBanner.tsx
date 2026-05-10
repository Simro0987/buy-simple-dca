import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

function nextDcaDate(dayName: string): Date {
  const target = DAY_INDEX[dayName] ?? 1;
  const now = new Date();
  const d = new Date(now);
  const diff = (target - now.getDay() + 7) % 7 || 7;
  d.setDate(now.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
}

function relTime(date: Date, now = new Date(), sk = true): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const past = diffMs < 0;
  const unit = days >= 1
    ? `${days} ${sk ? (days === 1 ? 'deň' : days < 5 ? 'dni' : 'dní') : (days === 1 ? 'day' : 'days')}`
    : `${hours} ${sk ? 'h' : 'h'}`;
  if (past) return sk ? `pred ${unit}` : `${unit} ago`;
  return sk ? `o ${unit}` : `in ${unit}`;
}

export function NextActionBanner({ lang }: Props) {
  const sk = lang === 'sk';
  const { data: settings } = useAppSettings();

  const { data: lastDca } = useQuery({
    queryKey: ['last-dca-purchase'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dca_purchases')
        .select('created_at, total_amount, btc_amount, eth_amount, sol_amount')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const dayName = settings?.dca_day ?? 'Monday';
  const nextDate = nextDcaDate(dayName);
  const weeklyBudget = Number(settings?.default_amount ?? 0);

  const lastDate = lastDca ? new Date(lastDca.created_at) : null;
  const totalUsd = lastDca?.total_amount ?? 0;

  return (
    <div className="glass-card p-3 space-y-1.5">
      {lastDate && (
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-gain shrink-0" />
          <span className="text-muted-foreground">{sk ? 'Posledný DCA:' : 'Last DCA:'}</span>
          <span className="text-foreground font-medium">{relTime(lastDate, new Date(), sk)}</span>
          <span className="ml-auto text-foreground font-semibold tabular-nums">
            {totalUsd > 0 ? formatUsd(Number(totalUsd)) : '—'}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-muted-foreground">{sk ? 'Ďalšia akcia:' : 'Next action:'}</span>
        <span className="text-foreground font-medium">
          {nextDate.toLocaleDateString(sk ? 'sk-SK' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {relTime(nextDate, new Date(), sk)}
        </span>
        {weeklyBudget > 0 && (
          <span className="ml-auto text-foreground font-semibold tabular-nums">
            DCA {formatUsd(weeklyBudget)}
          </span>
        )}
      </div>
    </div>
  );
}
