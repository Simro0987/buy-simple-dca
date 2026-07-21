export interface NewsSource {
  id: string;
  name: string;
  domain: string;
  feedUrl: string;
  maxItems: number;
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: "coindesk",
    name: "CoinDesk",
    domain: "coindesk.com",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    maxItems: 6,
  },
  {
    id: "cointelegraph",
    name: "CoinTelegraph",
    domain: "cointelegraph.com",
    feedUrl: "https://cointelegraph.com/rss",
    maxItems: 6,
  },
  {
    id: "theblock",
    name: "The Block",
    domain: "theblock.co",
    feedUrl: "https://www.theblock.co/rss.xml",
    maxItems: 6,
  },
  {
    id: "decrypt",
    name: "Decrypt",
    domain: "decrypt.co",
    feedUrl: "https://decrypt.co/feed",
    maxItems: 6,
  },
  {
    id: "blockworks",
    name: "Blockworks",
    domain: "blockworks.co",
    feedUrl: "https://blockworks.co/feed",
    maxItems: 6,
  },
  {
    id: "coingecko",
    name: "CoinGecko",
    domain: "coingecko.com",
    feedUrl: "https://www.coingecko.com/news.atom",
    maxItems: 6,
  },
  {
    id: "bloomberg",
    name: "Bloomberg",
    domain: "bloomberg.com",
    feedUrl: "https://feeds.bloomberg.com/crypto/news.rss",
    maxItems: 5,
  },
];

export const DEFI_NEWS_SOURCES: NewsSource[] = [
  {
    id: "dlnews",
    name: "DeFiLlama News",
    domain: "dlnews.com",
    feedUrl: "https://www.dlnews.com/arc/outboundfeeds/rss/",
    maxItems: 8,
  },
  {
    id: "thedefiant",
    name: "The Defiant",
    domain: "thedefiant.io",
    feedUrl: "https://thedefiant.io/api/feed",
    maxItems: 8,
  },
];

export function getSourceFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
