/**
 * CryptoNewsFeedPremium
 * ---------------------------------------------------------------------------
 * A premium, self-contained "Crypto News Feed" terminal component.
 *
 * - Drop-in ready for any Vite + React + Tailwind project.
 * - Only external dependency is `lucide-react` for icons.
 * - Fetches aggregated crypto news from CryptoCompare.
 * - Anti-crash: any fetch error / 403 / timeout falls back to Slovak mock data.
 * - Every <img> uses referrerPolicy="no-referrer" to dodge hotlink/CORS issues.
 *
 * Usage:  <CryptoNewsFeedPremium />
 */

import { useEffect, useMemo, useState } from "react";
import {
  Radio,
  RefreshCw,
  Filter,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ExternalLink,
  Zap,
  Globe,
  AlertTriangle,
  ListFilter,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Sentiment = "bullish" | "bearish" | "neutral";

interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  source: string;
  url: string;
  publishedOn: number; // unix seconds
  tags: string[];
  sentiment: Sentiment;
  flash: boolean;
}

/* ------------------------------------------------------------------ */
/* Source logo mapping (per spec)                                      */
/* ------------------------------------------------------------------ */

const sourceLogos: Record<string, string> = {
  CoinDesk: "https://cryptopanic.com/s/img/news/coindesk.png",
  Cointelegraph: "https://cryptopanic.com/s/img/news/cointelegraph.png",
  "The Block": "https://cryptopanic.com/s/img/news/theblock.png",
  Decrypt: "https://cryptopanic.com/s/img/news/decrypt.png",
};

/** Normalise the wildly inconsistent source names CryptoCompare returns. */
function normaliseSource(raw: string): string {
  const s = (raw || "").trim().toLowerCase();
  if (s.includes("coindesk")) return "CoinDesk";
  if (s.includes("cointelegraph") || s.includes("coin telegraph")) return "Cointelegraph";
  if (s.includes("theblock") || s.includes("the block")) return "The Block";
  if (s.includes("decrypt")) return "Decrypt";
  return raw || "CryptoCompare";
}

/* ------------------------------------------------------------------ */
/* Tag + sentiment + time helpers                                      */
/* ------------------------------------------------------------------ */

const FILTERS = ["Všetko", "Makro", "BTC", "ETH", "SOL"] as const;
type FilterKey = (typeof FILTERS)[number];

const MACRO_RE = /\b(fed|federal reserve|inflation|inflácia|interest rate|sadzb|regulat|regulácia|sec|cpi|gdp|macro|makro|stablecoin|bis|treasury|bank|etf|economy|ekonom|geopolit|iran|irán)\b/i;
const BULLISH_RE = /\b(surge|soar|rally|jump|gain|rise|bullish|breakout|record|all-time high|vzrást|vyskočil|vzrastl|rast|býči|býči[ae])\b/i;
const BEARISH_RE = /\b(drop|fall|crash|plunge|decline|bearish|dump|liquidat|selloff|klesol|padá|prepad|zmizl|výpadok|medvedí)\b/i;
const FLASH_RE = /\b(hack|exploit|breach|stolen|halt|výpadok|outage|down|emergency|urgent|flash|liquidat|crash|collapse|delist|ban)\b/i;

function deriveTags(categories: string, title: string, body: string): string[] {
  const hay = `${categories} ${title} ${body}`.toUpperCase();
  const tags: string[] = [];
  if (MACRO_RE.test(`${categories} ${title} ${body}`)) tags.push("MAKRO");
  else tags.push("KRYPTO");
  if (/\bBTC\b|BITCOIN/.test(hay)) tags.push("BTC");
  if (/\bETH\b|ETHEREUM|ETHER/.test(hay)) tags.push("ETH");
  if (/\bSOL\b|SOLANA/.test(hay)) tags.push("SOL");
  return Array.from(new Set(tags));
}

function deriveSentiment(title: string, body: string): Sentiment {
  const hay = `${title} ${body}`;
  if (BULLISH_RE.test(hay) && !BEARISH_RE.test(hay)) return "bullish";
  if (BEARISH_RE.test(hay)) return "bearish";
  return "neutral";
}

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 60) return `pred ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `pred ${hours} hod`;
  const days = Math.floor(hours / 24);
  return `pred ${days} d`;
}

/* ------------------------------------------------------------------ */
/* Slovak mock fallback (anti-crash)                                   */
/* ------------------------------------------------------------------ */

const mockNews: NewsItem[] = [
  {
    id: "mock-1",
    title:
      "Posun AI čipu v Južnej Kórei v hodnote 518 miliárd dolárov ukazuje, že kryptomeny stále prehrávajú preteky kapitálu",
    excerpt:
      "Samsung a SK Hynix posúvajú výstavbu čipovej továrne vpred o desaťročie, aby uspokojili dopyt po pamäti AI. Je to najnovší a najväčší znak kapitálového cyklu AI...",
    imageUrl:
      "https://images.unsplash.com/photo-1526666923127-b2970f64b422?q=80&w=1200&auto=format&fit=crop",
    source: "CoinDesk",
    url: "https://www.coindesk.com",
    publishedOn: Math.floor(Date.now() / 1000) - 2 * 3600,
    tags: ["MAKRO"],
    sentiment: "neutral",
    flash: false,
  },
  {
    id: "mock-2",
    title: "Základňa trpí druhým výpadkom siete za dva dni",
    excerpt:
      "Produkcia základného bloku bola obnovená o 16:11 UTC po upozornení na ďalšie zastavenie hlavného siete o 15:33...",
    imageUrl:
      "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=1200&auto=format&fit=crop",
    source: "The Block",
    url: "https://www.theblock.co",
    publishedOn: Math.floor(Date.now() / 1000) - 2 * 86400,
    tags: ["MAKRO"],
    sentiment: "neutral",
    flash: true,
  },
  {
    id: "mock-3",
    title: "Bitcoin klesol na 59 700 USD, keďže deeskalácia Iránu zdvihla akcie, ale nie krypto",
    excerpt:
      "Americké akciové futures vzrástli po správach, že sa USA a Irán dohodli na zastavení štrajkov a obnovení rozhovorov. Bitcoin sa takmer nepohol, za týždeň stále...",
    imageUrl:
      "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=1200&auto=format&fit=crop",
    source: "CoinDesk",
    url: "https://www.coindesk.com",
    publishedOn: Math.floor(Date.now() / 1000) - 2 * 3600,
    tags: ["KRYPTO", "BTC"],
    sentiment: "neutral",
    flash: false,
  },
  {
    id: "mock-4",
    title: "Tu je to, čo sa dnes stalo v kryptomenách",
    excerpt:
      "Potrebujete vedieť, čo sa dnes stalo v kryptomenách? Tu sú najnovšie správy o denných trendoch a udalostiach...",
    imageUrl:
      "https://images.unsplash.com/photo-1621761191319-c6fb62004040?q=80&w=1200&auto=format&fit=crop",
    source: "Cointelegraph",
    url: "https://cointelegraph.com",
    publishedOn: Math.floor(Date.now() / 1000) - 2 * 3600,
    tags: ["KRYPTO", "BTC"],
    sentiment: "neutral",
    flash: false,
  },
  {
    id: "mock-5",
    title:
      "Býčia divergencia bitcoinového RSI vyvolala u analytikov požiadavku na dno medvedieho trhu v štýle roku 2022",
    excerpt:
      "Býčie divergencie bitcoinu RSI tvorili základ pre nový prípad býka, ale niektoré trhové akcie varovali, že nové minimá cien...",
    imageUrl:
      "https://images.unsplash.com/photo-1605792657660-596af9009e82?q=80&w=1200&auto=format&fit=crop",
    source: "Cointelegraph",
    url: "https://cointelegraph.com",
    publishedOn: Math.floor(Date.now() / 1000) - 6 * 3600,
    tags: ["KRYPTO", "BTC"],
    sentiment: "bullish",
    flash: false,
  },
  {
    id: "mock-6",
    title: "Akcie Solana DAT vzrástli dvojciferne, keď SOL vyskočili o 9 %",
    excerpt:
      "Sol Strategies (STKE) sa v piatok vyšplhala až o 22 % na maximum 1,20 dolára, čím prekonala ostatné krypto-treasury akcie.",
    imageUrl:
      "https://images.unsplash.com/photo-1639815188546-c43c240ff4df?q=80&w=1200&auto=format&fit=crop",
    source: "The Block",
    url: "https://www.theblock.co",
    publishedOn: Math.floor(Date.now() / 1000) - 2 * 86400,
    tags: ["KRYPTO", "SOL"],
    sentiment: "bullish",
    flash: false,
  },
  {
    id: "mock-7",
    title: "Éterová pokladnica Sharplink kúpil minulý týždeň ETH za 62,4 milióna dolárov",
    excerpt:
      "Sharplink kúpil minulý týždeň takmer 40 000 ETH po osemmesačnej prestávke, čím dal najavo, že spoločnosť obnovila svoju stratégiu akumulácie éteru.",
    imageUrl:
      "https://images.unsplash.com/photo-1622630998477-20aa696ecb05?q=80&w=1200&auto=format&fit=crop",
    source: "Cointelegraph",
    url: "https://cointelegraph.com",
    publishedOn: Math.floor(Date.now() / 1000) - 5 * 3600,
    tags: ["KRYPTO", "ETH"],
    sentiment: "neutral",
    flash: false,
  },
];

/* ------------------------------------------------------------------ */
/* Data fetching (with anti-crash fallback)                            */
/* ------------------------------------------------------------------ */

const NEWS_ENDPOINT = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";

async function fetchNews(): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(NEWS_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const raw: any[] = json?.Data ?? [];
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("Empty payload");

    const mapped: NewsItem[] = raw.slice(0, 30).map((a, i) => {
      const source = normaliseSource(a?.source_info?.name ?? a?.source ?? "");
      const title = String(a?.title ?? "Bez názvu");
      const body = String(a?.body ?? "");
      return {
        id: String(a?.id ?? `${i}`),
        title,
        excerpt: body.length > 180 ? `${body.slice(0, 180).trim()}...` : body,
        imageUrl: a?.imageurl || "",
        source,
        url: a?.url || a?.guid || "#",
        publishedOn: Number(a?.published_on ?? Math.floor(Date.now() / 1000)),
        tags: deriveTags(String(a?.categories ?? ""), title, body),
        sentiment: deriveSentiment(title, body),
        flash: FLASH_RE.test(`${title} ${body}`),
      };
    });

    return mapped;
  } catch (err) {
    // 403 / network / timeout / parse error → never crash, show Slovak mock data
    console.log("[v0] CryptoNewsFeed fetch failed, using mock fallback:", (err as Error)?.message);
    return mockNews;
  }
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function SourceLogo({ source, className }: { source: string; className?: string }) {
  const logo = sourceLogos[source];
  if (logo) {
    return (
      <img
        src={logo}
        alt={source}
        referrerPolicy="no-referrer"
        className={className ?? "h-5 w-5 rounded-full object-cover"}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
      <Globe className="h-3 w-3" />
    </span>
  );
}

const TAG_STYLES: Record<string, string> = {
  MAKRO: "bg-teal-500/10 text-teal-300",
  KRYPTO: "bg-amber-500/10 text-amber-300",
  BTC: "bg-orange-500/10 text-orange-300",
  ETH: "bg-indigo-500/10 text-indigo-300",
  SOL: "bg-violet-500/10 text-violet-300",
};

function Tag({ label }: { label: string }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
        TAG_STYLES[label] ?? "bg-zinc-700/40 text-zinc-300"
      }`}
    >
      {label}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  if (sentiment === "bullish") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-green-400">
        <ArrowUpRight className="h-3 w-3" /> Bullish
      </span>
    );
  }
  if (sentiment === "bearish") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-red-400">
        <ArrowDownRight className="h-3 w-3" /> Bearish
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
      <Minus className="h-3 w-3" /> Neutrálne
    </span>
  );
}

function FlashTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-400">
      <Zap className="h-3 w-3" /> Flash
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hero card                                                           */
/* ------------------------------------------------------------------ */

function HeroCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 shadow-[0_0_40px_-12px_rgba(0,0,0,0.8)] transition-colors hover:border-zinc-700"
    >
      {/* Image header */}
      <div className="relative h-56 w-full overflow-hidden bg-zinc-900">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <Globe className="h-10 w-10" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
      </div>

      <div className="space-y-4 p-5">
        {/* Top badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-gradient-to-r from-orange-500/20 to-amber-500/10 px-3 py-1.5 text-[12px] font-extrabold uppercase tracking-wide text-orange-400">
            <Flame className="h-3.5 w-3.5" /> Dnešná top správa
          </span>
          {item.tags.map((t, i) => (
            <Tag key={`${t}-${i}`} label={t} />
          ))}
        </div>

        {/* Sentiment + timestamp row */}
        <div className="flex items-center justify-between">
          <SentimentBadge sentiment={item.sentiment} />
          <span className="text-sm text-zinc-500">{timeAgo(item.publishedOn)}</span>
        </div>

        {/* Title */}
        <h2 className="text-balance text-2xl font-extrabold leading-tight text-white">
          {item.title}
        </h2>

        {/* Excerpt */}
        <p className="text-pretty text-base leading-relaxed text-zinc-500">{item.excerpt}</p>

        {/* Footer */}
        <div className="flex items-center gap-2 pt-1 text-zinc-500">
          <SourceLogo source={item.source} />
          <span className="text-sm">{item.source}</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </div>
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Feed card                                                           */
/* ------------------------------------------------------------------ */

function FeedCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block rounded-2xl border bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700 ${
        item.flash
          ? "border-amber-500/40 shadow-[0_0_25px_-6px_rgba(245,158,11,0.45)]"
          : "border-zinc-800"
      }`}
    >
      {/* Header row: logo + tags + time */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <SourceLogo source={item.source} className="h-7 w-7 rounded-full object-cover" />
          {item.tags.map((t, i) => (
            <Tag key={`${t}-${i}`} label={t} />
          ))}
          {item.sentiment !== "neutral" ? (
            <SentimentBadge sentiment={item.sentiment} />
          ) : (
            <SentimentBadge sentiment="neutral" />
          )}
          {item.flash && <FlashTag />}
        </div>
        <span className="shrink-0 text-sm text-zinc-500">{timeAgo(item.publishedOn)}</span>
      </div>

      {/* Title */}
      <h3 className="mt-3 text-balance text-lg font-bold leading-snug text-white">{item.title}</h3>

      {/* Excerpt */}
      <p className="mt-2 text-pretty text-sm leading-relaxed text-zinc-500">{item.excerpt}</p>

      {/* Footer */}
      <div className="mt-3 flex items-center gap-2 text-zinc-500">
        <SourceLogo source={item.source} />
        <span className="text-sm">{item.source}</span>
        <ExternalLink className="h-3.5 w-3.5" />
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function CryptoNewsFeedPremium() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("Všetko");
  const [updatedAt, setUpdatedAt] = useState<string>("");

  async function load() {
    setLoading(true);
    const data = await fetchNews();
    setItems(data);
    setUpdatedAt(
      new Date().toLocaleTimeString("sk-SK", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (filter === "Všetko") return items;
    if (filter === "Makro") return items.filter((i) => i.tags.includes("MAKRO"));
    return items.filter((i) => i.tags.includes(filter));
  }, [items, filter]);

  const flashItem = useMemo(() => items.find((i) => i.flash), [items]);

  const hero = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="h-6 w-6 text-emerald-400" />
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Noviny</h1>
            </div>
            <p className="mt-1 text-base text-zinc-500">Live feed · BTC, ETH, SOL</p>
          </div>
          <button
            onClick={load}
            aria-label="Obnoviť"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Flash alert ticker */}
        {flashItem && (
          <div className="mb-4 flex items-center gap-2 overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
            <Zap className="h-4 w-4 shrink-0 animate-pulse text-amber-400" />
            <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
              Flash
            </span>
            <span className="truncate text-sm text-amber-200/90">{flashItem.title}</span>
          </div>
        )}

        {/* Filter pills */}
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Filter className="h-4 w-4 shrink-0 text-zinc-600" />
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "border-white bg-white text-black"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>

        {/* Last updated */}
        <div className="mb-5 flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Posledná aktualizácia: {updatedAt || "—"}
        </div>

        {/* Loading skeleton */}
        {loading && items.length === 0 ? (
          <div className="space-y-4">
            <div className="h-80 w-full animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900/40" />
            <div className="h-40 w-full animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />
            <div className="h-40 w-full animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 py-12 text-zinc-500">
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm">Žiadne správy pre tento filter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hero && <HeroCard item={hero} />}
            {rest.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Sources footer */}
        <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-zinc-700">
          <ListFilter className="h-3 w-3" />
          Zdroje: Cointelegraph · CoinDesk · The Block · CryptoCompare · CoinGecko
        </div>
      </div>
    </div>
  );
}
