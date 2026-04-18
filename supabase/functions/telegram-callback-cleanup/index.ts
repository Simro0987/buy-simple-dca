import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const olderThanDays = Number(body.olderThanDays);
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1 || olderThanDays > 365) {
      return new Response(
        JSON.stringify({ error: 'olderThanDays must be 1-365' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString();
    const { data, error } = await supabase
      .from('telegram_callback_log')
      .delete()
      .lt('created_at', cutoff)
      .select('id');

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, deleted: data?.length ?? 0, cutoff }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
