import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, ShieldCheck, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { api } from '@/lib/api/client';
import { SafeGlobalConnectCard } from '@/components/wallet/SafeGlobalConnectCard';
import { AgentRunnerStatusCard } from '@/components/wallet/AgentRunnerStatusCard';
import { Collapsible } from '@/components/ui/collapsible-section';

interface Props {
  lang: Lang;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const HISTORY_KEY = 'agent-chat-history-v1';
// Keys from older versions that stored AI provider keys in the browser. They are deleted on load.
const LEGACY_KEY_ITEMS = ['openrouter-api-key-v1', 'gemini-api-key-v1'];

function loadHistory(): ChatMessage[] {
  try {
    const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** What the agent can and cannot do — mirrors contracts/AgentSwapModule.sol (enforced on-chain). */
function AgentRulesCard({ sk }: { sk: boolean }) {
  const rules = sk
    ? [
        'Agent má jedinú schopnosť: swap cez AgentSwapModule na vašom Safe. Nemôže posielať tokeny ani ETH na žiadnu adresu.',
        'Výstup swapu ide vždy späť do toho istého Safe (recipient je natvrdo Safe).',
        'Iba tokeny a pooly, ktoré povolíte vy (owners) multisig transakciou.',
        'Ochrana ceny cez Chainlink orákulum + limity na swap, na deň a cooldown.',
        'Agent môže iba pozastaviť modul; odomknúť, meniť limity či tokeny môžu len owners. Modul viete kedykoľvek vypnúť (disableModule).',
        'Predvolene beží runner na testnete v DRY-RUN (nič neposiela). Kontrakt zatiaľ nie je auditovaný.',
      ]
    : [
        'The agent has exactly one capability: a swap through AgentSwapModule on your Safe. It cannot send tokens or ETH anywhere.',
        'Swap output always returns to the same Safe (recipient is hard-coded).',
        'Only tokens and pools the owners allow-list via a multisig transaction.',
        'Price protection via Chainlink oracle + per-swap, per-day caps and a cooldown.',
        'The agent can only pause the module; unpausing or changing limits/tokens is owners-only. You can disable the module any time.',
        'By default the runner runs on a testnet in DRY-RUN (sends nothing). The contract is not audited yet.',
      ];
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold">{sk ? 'Čo agent smie a čo nie' : 'What the agent may and may not do'}</h3>
      </div>
      <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
        {rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground mt-2">
        {sk ? 'Zdroj: contracts/AgentSwapModule.sol, SAFE_AGENT_PERMISSIONS.md' : 'Source: contracts/AgentSwapModule.sol, SAFE_AGENT_PERMISSIONS.md'}
      </p>
    </div>
  );
}

function AiChatCard({ sk }: { sk: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    for (const k of LEGACY_KEY_ITEMS) localStorage.removeItem(k);
    void api.functions.invoke<{ configured: boolean }>('ai-chat', { method: 'GET' }).then(({ data }) => setConfigured(Boolean(data?.configured)));
  }, []);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-100)));
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user' as const, content: text, ts: Date.now() }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    const { data, error } = await api.functions.invoke<{ reply: string }>('ai-chat', {
      body: { messages: next.map(({ role, content }) => ({ role, content })) },
    });
    setBusy(false);
    if (error || !data) {
      toast.error(sk ? 'AI odpoveď zlyhala' : 'AI request failed');
      setMessages((p) => [...p, { role: 'assistant', content: `⚠️ ${error?.message ?? 'error'}`, ts: Date.now() }]);
      return;
    }
    setMessages((p) => [...p, { role: 'assistant', content: data.reply || '—', ts: Date.now() }]);
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{sk ? 'AI asistent (len rady)' : 'AI assistant (advice only)'}</h3>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} className="text-muted-foreground hover:text-foreground" aria-label="clear">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {configured === false && (
        <div className="flex gap-2 text-xs text-muted-foreground rounded-lg border border-border p-2.5">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            {sk
              ? 'AI nie je nastavené. Kľúč sa zadáva iba na serveri: AI_API_KEY v /appdata/secrets.env komponentu „api“ (Flux). Prehliadač žiadny kľúč neukladá.'
              : 'AI is not configured. The key is set only on the server: AI_API_KEY in /appdata/secrets.env of the "api" component. The browser never stores a key.'}
          </span>
        </div>
      )}
      <div className="max-h-80 overflow-y-auto space-y-2">
        {messages.map((m) => (
          <div
            key={m.ts}
            className={`text-xs whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-primary/10 ml-8' : 'bg-secondary mr-8'}`}
          >
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          disabled={configured === false}
          placeholder={sk ? 'Opýtaj sa na plán, riziko, tokeny…' : 'Ask about the plan, risk, tokens…'}
          className="flex-1 resize-none rounded-lg bg-secondary border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !draft.trim() || configured === false}
          className="px-3 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          aria-label="send"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {sk ? 'Informácie, nie finančné poradenstvo. AI nemôže obchodovať ani podpisovať.' : 'Information, not financial advice. The AI cannot trade or sign.'}
      </p>
    </div>
  );
}

export function AgentPage({ lang }: Props) {
  const sk = lang === 'sk';
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{sk ? 'Agent' : 'Agent'}</h2>
        <p className="text-xs text-muted-foreground">
          {sk
            ? 'Serverový runner na Fluxe s jedinou schopnosťou: swap v rámci limitov vo vašom Safe. Žiadne kľúče v prehliadači.'
            : 'Server-side runner on Flux with one capability: swaps within limits inside your Safe. No keys in the browser.'}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <AgentRunnerStatusCard lang={lang} />
          <AgentRulesCard sk={sk} />
        </div>
        <div className="space-y-4">
          <SafeGlobalConnectCard lang={lang} compact />
          <Collapsible title={sk ? 'AI asistent' : 'AI assistant'} defaultOpen>
            <AiChatCard sk={sk} />
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
