import { createClient } from '../_shared/apiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth guard ─────────────────────────────────────────
  // Accept either the shared edge-function secret (used by pg_cron) or a valid
  // Supabase user JWT. Blocks unauthenticated public callers.
  {
    const edgeSecret = Deno.env.get('EDGE_FUNCTION_SECRET') ?? '';
    const providedSecret = req.headers.get('x-edge-secret') ?? '';
    const secretOk = edgeSecret.length > 0 && providedSecret === edgeSecret;
    if (!secretOk) {
      const authHeader = req.headers.get('authorization') ?? '';
      if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const verify = await fetch(`${Deno.env.get('API_URL')}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: Deno.env.get('API_ANON_KEY') ?? '' },
      });
      if (!verify.ok) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
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

    const apiUrl = Deno.env.get('API_URL')!;
    const serviceKey = Deno.env.get('API_SERVICE_KEY')!;
    const db = createClient(apiUrl, serviceKey);

    const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString();
    const { data, error } = await db
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
