export type NewsCategory = "all" | "macro" | "btc" | "eth" | "sol";

export type NewsTagVariant =
  | "macro"
  | "institutions"
  | "btc"
  | "eth"
  | "sol"
  | "defi"
  | "regulation";

export interface NewsTag {
  label: string;
  variant: NewsTagVariant;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: Exclude<NewsCategory, "all">;
  tags: NewsTag[];
  pulseColor: string;
  isFlash?: boolean;
}

export const newsFilters: { id: NewsCategory; label: string }[] = [
  { id: "all", label: "Všetko" },
  { id: "macro", label: "Makro" },
  { id: "btc", label: "BTC" },
  { id: "eth", label: "ETH" },
  { id: "sol", label: "SOL" },
];

export const newsArticles: NewsArticle[] = [
  {
    id: "1",
    title: "Fed ponechal úrokové sadzby nezmenené",
    summary:
      "FOMC signalizuje opatrný postoj k inflácii. Trhy očakávajú prvé zníženie sadzieb až v Q3, čo podporuje risk-on sentiment v krypto sektore.",
    source: "Bloomberg / FOMC",
    category: "macro",
    tags: [
      { label: "MAKRO", variant: "macro" },
      { label: "Inštitúcie", variant: "institutions" },
    ],
    pulseColor: "bg-blue-400",
    isFlash: true,
  },
  {
    id: "2",
    title: "BlackRock zaznamenal rekordné netto prílevy do IBIT",
    summary:
      "Spot Bitcoin ETF priťahoval kapitál tretí týždeň po sebe. Inštitucionálny dopyt zostáva silný napriek krátkodobej volatilite na $64K.",
    source: "CoinDesk / ETF Flows",
    category: "btc",
    tags: [
      { label: "BTC", variant: "btc" },
      { label: "Inštitúcie", variant: "institutions" },
    ],
    pulseColor: "bg-orange-400",
    isFlash: true,
  },
  {
    id: "3",
    title: "Ethereum staking yield prekročil 3.8% APR",
    summary:
      "Rastúci podiel stakovaného ETH a pokles sieťových poplatkov zvyšujú reálny výnos validátorov. Restaking protokoly reportujú stabilný prílev.",
    source: "The Block / Ethereum",
    category: "eth",
    tags: [
      { label: "ETH", variant: "eth" },
      { label: "DeFi", variant: "defi" },
    ],
    pulseColor: "bg-purple-400",
    isFlash: true,
  },
  {
    id: "4",
    title: "Solana DEX objem prekonal $2.1B za 24h",
    summary:
      "Meme sezóna a nízke poplatky ťahajú aktivitu na Solane. Jito MEV rewards a nové launchpady držia sieť v top 3 podľa on-chain objemu.",
    source: "DeFiLlama / Solana",
    category: "sol",
    tags: [
      { label: "SOL", variant: "sol" },
      { label: "DeFi", variant: "defi" },
    ],
    pulseColor: "bg-cyan-400",
    isFlash: true,
  },
];

export const flashCount = newsArticles.filter((a) => a.isFlash).length;
