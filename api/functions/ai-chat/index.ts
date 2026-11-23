// AI chat for the Agent page. The provider key lives ONLY on the server (/appdata/secrets.env:
// AI_BASE_URL, AI_API_KEY, optional AI_MODEL). Browsers never see or store a key.
//   GET  -> { configured: boolean }
//   POST { messages: [{ role: 'user'|'assistant', content }] } -> { reply }
// Needs a signed-in session (not in PUBLIC_FUNCTIONS). Advisory only: it cannot trade or sign.
import { corsHeaders } from '../_shared/apiClient.ts';

const SYSTEM = `Si konzervatívny asistent pre DCA portfólio v Safe{Wallet}. Pravidlá:
1) Nikdy nežiadaj seed phrase ani privátne kľúče. 2) Neodporúčaj presun prostriedkov mimo Safe.
3) Hovor jasne, že ide o informácie, nie o finančné poradenstvo. 4) Odpovedaj v jazyku používateľa, stručne, v odrážkach.
5) Ak nevieš aktuálne dáta (ceny, správy), povedz to a nevymýšľaj čísla.`;
const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const configured = Boolean(Deno.env.get('AI_GATEWAY_KEY') && Deno.env.get('AI_CONFIGURED') === 'true');
  if (req.method === 'GET') return json(200, { configured });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!configured) return json(503, { error: 'AI nie je nastavené na serveri (AI_API_KEY v /appdata/secrets.env).' });

  let body: { messages?: Array<{ role?: string; content?: unknown }> };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, MAX_CHARS) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json(400, { error: 'last message must be from the user' });

  const res = await fetch('http://ai-gateway.internal/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'system', content: SYSTEM }, ...msgs], max_tokens: 800 }),
  });
  if (!res.ok) return json(502, { error: `AI provider HTTP ${res.status}` });
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json(200, { reply: data.choices?.[0]?.message?.content ?? '' });
});
