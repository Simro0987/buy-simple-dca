/**
 * The edge functions were written against Lovable's hosted gateways:
 *   https://connector-gateway.lovable.dev/telegram/<method>   (Telegram Bot API proxy)
 *   https://ai.gateway.lovable.dev/v1/chat/completions        (OpenAI-compatible AI proxy)
 * Instead of rewriting 30 files, outgoing fetches to those two hosts are redirected to the
 * real providers using keys that live ONLY in the API container:
 *   TELEGRAM_BOT_TOKEN  -> https://api.telegram.org/bot<token>/<method>
 *   AI_BASE_URL + AI_API_KEY (+ optional AI_MODEL override) -> any OpenAI-compatible endpoint
 * Everything else passes through untouched.
 */
const TG_PREFIX = 'https://connector-gateway.lovable.dev/telegram/';
const AI_PREFIX = 'https://ai.gateway.lovable.dev/v1/';

export interface OutboundSecrets {
  TELEGRAM_BOT_TOKEN?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function cleanHeaders(init?: RequestInit): Headers {
  const h = new Headers(init?.headers);
  h.delete('authorization');
  h.delete('x-connection-api-key');
  return h;
}

export function createOutboundFetch(base: typeof fetch, secrets: OutboundSecrets): typeof fetch {
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(TG_PREFIX)) {
      if (!secrets.TELEGRAM_BOT_TOKEN) return json(503, { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured' });
      const method = url.slice(TG_PREFIX.length);
      if (!/^[A-Za-z]+(\?.*)?$/.test(method)) return json(400, { ok: false, description: 'bad telegram method' });
      return base(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/${method}`, { ...init, headers: cleanHeaders(init) });
    }
    if (url.startsWith(AI_PREFIX)) {
      if (!secrets.AI_API_KEY) return json(503, { error: { message: 'AI_API_KEY is not configured' } });
      const target = `${(secrets.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/${url.slice(AI_PREFIX.length)}`;
      const headers = cleanHeaders(init);
      headers.set('authorization', `Bearer ${secrets.AI_API_KEY}`);
      let body = init?.body;
      if (secrets.AI_MODEL && typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          parsed.model = secrets.AI_MODEL;
          body = JSON.stringify(parsed);
        } catch {
          /* leave as-is */
        }
      }
      return base(target, { ...init, headers, body });
    }
    return base(input as RequestInfo, init);
  };
  return wrapped as typeof fetch;
}
