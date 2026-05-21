import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mark PENDING limit orders older than EXPIRE_AFTER_DAYS as EXPIRED.
// Used as input for ETH_Fill / SOL_Fill computation (FILLED vs EXPIRED).
const EXPIRE_AFTER_DAYS = 28;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const cutoff = new Date(Date.now() - EXPIRE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('dca_executions')
      .update({ status: 'EXPIRED', filled_at: new Date().toISOString() })
      .eq('kind', 'limit')
      .eq('status', 'PENDING')
      .lt('created_at', cutoff)
      .select('id, coin');

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, expired: data?.length ?? 0, cutoff }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
