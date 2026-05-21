// Týždenná snímka fill-rate pre ETH/SOL limit objednávky.
// Beží pondelok ráno (cron), agreguje predchádzajúci ISO týždeň z dca_executions
// a zapisuje fill / expired / cancelled počty + fill_rate do weekly_fill_snapshots.
// Tieto snapshoty potom slúžia ako vstup pre self-learning feedback loop.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getIsoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Predchádzajúci týždeň (uplynulý pondelok-nedeľa)
    const now = new Date();
    const lastWeekRef = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const targetWeek = getIsoWeek(lastWeekRef);

    const { data: rows, error } = await supabase
      .from('dca_executions')
      .select('coin, status')
      .eq('kind', 'limit')
      .eq('week_number', targetWeek);
    if (error) throw error;

    const coins = ['ETH', 'SOL'] as const;
    const snapshots: any[] = [];

    for (const coin of coins) {
      const coinRows = (rows ?? []).filter((r: any) => r.coin === coin);
      const filled = coinRows.filter((r: any) => r.status === 'FILLED').length;
      const expired = coinRows.filter((r: any) => r.status === 'EXPIRED').length;
      const cancelled = coinRows.filter((r: any) => r.status === 'CANCELLED').length;
      const total_closed = filled + expired + cancelled;
      const fill_rate = total_closed === 0 ? 0.5 : filled / total_closed;

      const { error: upErr } = await supabase
        .from('weekly_fill_snapshots')
        .upsert(
          { week_number: targetWeek, coin, filled, expired, cancelled, total_closed, fill_rate },
          { onConflict: 'week_number,coin' },
        );
      if (upErr) throw upErr;

      snapshots.push({ coin, week_number: targetWeek, filled, expired, cancelled, fill_rate });
    }

    return new Response(JSON.stringify({ ok: true, snapshots }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
