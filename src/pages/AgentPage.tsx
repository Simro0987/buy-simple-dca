import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

interface ChatMessage { role: 'user' | 'assistant'; content: string; ts: number; }

const HISTORY_KEY = 'agent-chat-history-v1';
const DRAFT_KEY = 'agent-chat-draft-v1';
const API_KEY_KEY = 'openrouter-api-key-v1';

const PERSONA = `Pôsobíš v striktnej role Konzervatívneho Senior Risk Manažéra and On-Chain Audítora pre investora Thomasa. Tvojou absolútnou prioritou je ochrana kapitálu. Odpovedaj chladnou logikou, slovensky, stručne v odrážkach, zameraj sa čisto na technickú exekúciu a WACB výpočty. Ak nemáš dosť dát, odpovedz výhradne: 'Nedostatok lokálnych dát pre presný výpočet.' Nikdy nežiadaj seed phrase.`;

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function AgentPage({ lang }: Props) {
  const sk = lang === 'sk';
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [draft, setDraft] = useState<string>(() => localStorage.getItem(DRAFT_KEY) ?? '');
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(API_KEY_KEY) ?? '');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Persist draft + history
  useEffect(() => { localStorage.setItem(DRAFT_KEY, draft); }, [draft]);
  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-200))); }, [messages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => { taRef.current?.focus(); }, []);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (!apiKey.trim()) {
      toast.error(sk ? 'Zadaj OpenRouter API Kľúč v Nastaveniach' : 'Set OpenRouter API key in Settings');
      return;
    }
    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setDraft('');
    setBusy(true);
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'BTC Cockpit · Risk Agent',
        },
        body: JSON.stringify({
          model: 'openrouter/auto',
          plugins: [{ id: 'web' }], // background web search
          provider: { sort: 'price', allow_fallbacks: true },
          route: 'fallback',
          // NotDiamond cost/quality flag (0 = max savings)
          notdiamond_cost_quality: 0,
          messages: [
            { role: 'system', content: PERSONA },
            ...nextMsgs.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`OpenRouter ${resp.status}: ${txt.slice(0, 200)}`);
      }
      const data = await resp.json();
      const out = data?.choices?.[0]?.message?.content ?? '';
      setMessages(prev => [...prev, { role: 'assistant', content: String(out || '(prázdna odpoveď)'), ts: Date.now() }]);
    } catch (e) {
      const msg = (e as Error).message;
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Chyba: ${msg}`, ts: Date.now() }]);
      toast.error(sk ? 'Chyba volania AI' : 'AI call failed');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  };

  const clearAll = () => {
    if (!confirm(sk ? 'Vymazať históriu konverzácie?' : 'Clear conversation history?')) return;
    setMessages([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">
            {sk ? 'AI Agent · Risk Manažér' : 'AI Agent · Risk Manager'}
          </h1>
        </div>
        <button
          onClick={clearAll}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-95"
          aria-label="Clear"
          title={sk ? 'Vymazať' : 'Clear'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {!apiKey.trim() && (
        <div className="glass-card p-3 flex items-start gap-2 border border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-200 leading-snug">
            {sk
              ? 'OpenRouter API kľúč nie je nastavený. Otvor Nastavenia → "Zadajte OpenRouter API Kľúč".'
              : 'OpenRouter API key not set. Open Settings → "Enter OpenRouter API Key".'}
          </p>
        </div>
      )}

      <div className="glass-card p-3 space-y-2 min-h-[300px] max-h-[55vh] overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {sk
              ? 'Konverzácia s konzervatívnym Senior Risk Manažérom. Spýtaj sa na WACB výpočty, technickú exekúciu alebo on-chain audit.'
              : 'Conversation with the conservative Senior Risk Manager. Ask about WACB, execution, or on-chain audit.'}
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-[12px] leading-snug whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-primary/15 text-foreground border border-primary/30'
                : 'bg-secondary/60 text-foreground border border-border'
            }`}
          >
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
              {m.role === 'user' ? (sk ? 'Ty' : 'You') : 'Agent'}
            </p>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="rounded-lg px-3 py-2 text-[12px] bg-secondary/60 text-muted-foreground border border-border animate-pulse">
            {sk ? 'Agent rozmýšľa…' : 'Agent is thinking…'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="glass-card p-2 space-y-2">
        <textarea
          ref={taRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={sk ? 'Napíš správu… (Cmd/Ctrl + Enter odošle)' : 'Type a message… (Cmd/Ctrl + Enter to send)'}
          rows={3}
          className="w-full resize-none rounded-md bg-background border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={send}
          disabled={busy || !draft.trim()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 active:scale-95"
        >
          <Send className="w-4 h-4" />
          {busy ? (sk ? 'Odosielam…' : 'Sending…') : (sk ? 'Odoslať' : 'Send')}
        </button>
      </div>
    </div>
  );
}
