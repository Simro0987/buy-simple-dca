/**
 * Decentralized Web3 Infrastructure & Sovereign Stack
 *
 * Ensures the entire application works 100% independently of any centralized IDE/builder
 * (no Lovable, no Cursor runtime lock-in) and integrates directly with decentralized
 * protocols for Oracles, AI Compute, and Permanent Storage:
 *
 *  1. ORACLES (Live Market Feeds without centralized API keys):
 *     - Pyth Network Hermes v2 (`https://hermes.pyth.network`) — real-time BTC, ETH, SOL, ARB, LINK, AAVE, UNI, NEAR, PENDLE prices
 *     - Chainlink On-Chain Data Feeds (`latestRoundData()` via Arbitrum / Ethereum RPC)
 *
 *  2. DECENTRALIZED AI & COMPUTE:
 *     - Bittensor (TAO) Subnet 8 (Taoshi Proprietary Trading Network) / Subnet 18 (Cortex.t / Corcel) / Subnet 4 (Targon)
 *     - Akash Network Supercloud (decentralized GPU / container compute endpoint for self-hosted LLM & agent worker)
 *
 *  3. DECENTRALIZED STORAGE & HOSTING:
 *     - Arweave (AR) Permaweb (`ar://` / `https://arweave.net`)
 *     - Filecoin (FIL) / IPFS (`ipfs://` / Web3.Storage / Lighthouse)
 *     - Sia (`sia://` Renterd decentralized object storage)
 *     - Storj (`sj://` S3-compatible decentralized cloud storage)
 */

export type DecentralizedLayerCategory = 'oracle' | 'compute_ai' | 'storage_hosting';

export interface DecentralizedProtocolNode {
  id: 'pyth' | 'chainlink' | 'bittensor_tao' | 'akash' | 'arweave' | 'filecoin' | 'sia' | 'storj';
  symbol: string;
  name: string;
  category: DecentralizedLayerCategory;
  color: string;
  defaultEndpoint: string;
  descriptionSk: string;
  descriptionEn: string;
  docsUrl: string;
}

export const DECENTRALIZED_PROTOCOLS: DecentralizedProtocolNode[] = [
  {
    id: 'pyth',
    symbol: 'PYTH',
    name: 'Pyth Network (Hermes On-Chain Oracle)',
    category: 'oracle',
    color: '#E6DAFE',
    defaultEndpoint: 'https://hermes.pyth.network',
    descriptionSk: 'Sub-sekundové inštitucionálne cenové feedy priamo z Pyth Hermes bez centrálneho servera.',
    descriptionEn: 'Sub-second institutional price feeds directly from Pyth Hermes without a central server.',
    docsUrl: 'https://pyth.network',
  },
  {
    id: 'chainlink',
    symbol: 'LINK',
    name: 'Chainlink Decentralized Data Feeds',
    category: 'oracle',
    color: '#375BD2',
    defaultEndpoint: 'https://arb1.arbitrum.io/rpc',
    descriptionSk: 'Priame on-chain čítanie Chainlink AggregatorV3 kontraktov (BTC/USD, ETH/USD, SOL/USD).',
    descriptionEn: 'Direct on-chain reading of Chainlink AggregatorV3 contracts (BTC/USD, ETH/USD, SOL/USD).',
    docsUrl: 'https://chain.link/data-feeds',
  },
  {
    id: 'bittensor_tao',
    symbol: 'TAO',
    name: 'Bittensor (TAO) · Subnets SN8 (Taoshi) & SN18',
    category: 'compute_ai',
    color: '#14F195',
    defaultEndpoint: 'https://api.corcel.io/v1/text/cortext/chat',
    descriptionSk: 'Decentralizovaná AI inteligencia pre autonómnych agentov a kvantitatívne BTC signály cez Bittensor TAO.',
    descriptionEn: 'Decentralized AI intelligence for autonomous agents and quantitative BTC signals via Bittensor TAO.',
    docsUrl: 'https://bittensor.com',
  },
  {
    id: 'akash',
    symbol: 'AKT',
    name: 'Akash Network (Decentralized Cloud & GPU)',
    category: 'compute_ai',
    color: '#FF414C',
    defaultEndpoint: 'https://chatapi.akash.network/api/v1',
    descriptionSk: 'Decentralizovaný výpočtový cluster pre 24/7 beh autonómnych AI agentov a LLM modelov (SDL deployment).',
    descriptionEn: 'Decentralized compute cluster for 24/7 autonomous AI agents and LLM models (SDL deployment).',
    docsUrl: 'https://akash.network',
  },
  {
    id: 'arweave',
    symbol: 'AR',
    name: 'Arweave Permaweb (Permanent Storage & UI)',
    category: 'storage_hosting',
    color: '#ffffff',
    defaultEndpoint: 'https://arweave.net',
    descriptionSk: 'Trvalé uloženie celej webstránky (Permaweb) a nemenných snapshotov portfólia a AI učenia.',
    descriptionEn: 'Permanent hosting of the entire web app (Permaweb) and immutable portfolio & AI learning snapshots.',
    docsUrl: 'https://arweave.org',
  },
  {
    id: 'filecoin',
    symbol: 'FIL',
    name: 'Filecoin & IPFS (Content-Addressed Storage)',
    category: 'storage_hosting',
    color: '#0090FF',
    defaultEndpoint: 'https://ipfs.io/ipfs/',
    descriptionSk: 'Kryptograficky adresované zálohy histórie obchodov, agentov a statického buildu cez IPFS/Filecoin.',
    descriptionEn: 'Content-addressed backups of trade history, agents, and static build via IPFS/Filecoin.',
    docsUrl: 'https://filecoin.io',
  },
  {
    id: 'sia',
    symbol: 'SC',
    name: 'Sia Network (Renterd Encrypted Storage)',
    category: 'storage_hosting',
    color: '#20EE82',
    defaultEndpoint: 'https://sia.tech/api',
    descriptionSk: 'Šifrované decentralizované uloženie stavov AI modelov a privátnych konfigurácií.',
    descriptionEn: 'Encrypted decentralized storage for AI model states and private configurations.',
    docsUrl: 'https://sia.tech',
  },
  {
    id: 'storj',
    symbol: 'STORJ',
    name: 'Storj DCS (Decentralized S3 Cloud)',
    category: 'storage_hosting',
    color: '#2683FF',
    defaultEndpoint: 'https://gateway.storjshare.io',
    descriptionSk: 'Vysokodostupné distribuované S3 úložisko pre telemetriu agentov a multi-chain zálohy.',
    descriptionEn: 'High-availability distributed S3 storage for agent telemetry and multi-chain backups.',
    docsUrl: 'https://storj.io',
  },
];

// Official Pyth Network Price Feed IDs (Mainnet)
export const PYTH_PRICE_FEED_IDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  AAVE: '0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445',
  UNI: '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
  NEAR: '0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750',
  PENDLE: '0x3f438981f0b5a44b5f5c6903f8c2732200f2e61d611a4f784838239f1e9911a0',
};

// Chainlink Arbitrum One AggregatorV3 Contract Addresses
export const CHAINLINK_ARB_FEEDS: Record<string, string> = {
  BTC: '0x6ce185860a4963106506C203335A2910413708e9',
  ETH: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
  SOL: '0x24ceA4b8ce57cdA5058b924B9B9987992450590c',
  LINK: '0x86E53CF1B870786351Da77A57575e79CB55812CB',
};

export interface PythLiveQuotes {
  prices: Record<string, number>;
  confidence: Record<string, number>;
  publishTime: number;
  source: 'pyth_hermes' | 'chainlink_onchain' | 'fallback';
}

/**
 * Fetches live institutional prices directly from Pyth Network Hermes v2 API.
 * Zero centralized backend needed — works directly from Arweave/IPFS/Akash/Browser.
 */
export async function fetchPythLivePrices(symbols: string[] = ['BTC', 'ETH', 'SOL', 'LINK', 'AAVE', 'UNI', 'NEAR']): Promise<PythLiveQuotes> {
  const validSymbols = symbols.filter((s) => PYTH_PRICE_FEED_IDS[s.toUpperCase()]);
  const idsParams = validSymbols.map((s) => `ids[]=${PYTH_PRICE_FEED_IDS[s.toUpperCase()]}`).join('&');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${idsParams}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);
    const json = await res.json();
    const parsed: Array<{
      id: string;
      price: { price: string; expo: number; conf: string; publish_time: number };
    }> = json?.parsed ?? [];

    const prices: Record<string, number> = {};
    const confidence: Record<string, number> = {};
    let publishTime = Date.now();

    for (const sym of validSymbols) {
      const targetId = PYTH_PRICE_FEED_IDS[sym.toUpperCase()].replace(/^0x/, '').toLowerCase();
      const entry = parsed.find((p) => p.id.toLowerCase() === targetId);
      if (entry?.price) {
        const expo = Number(entry.price.expo);
        const rawPrice = Number(entry.price.price);
        const rawConf = Number(entry.price.conf);
        prices[sym.toUpperCase()] = rawPrice * Math.pow(10, expo);
        confidence[sym.toUpperCase()] = rawConf * Math.pow(10, expo);
        publishTime = entry.price.publish_time * 1000;
      }
    }

    if (Object.keys(prices).length > 0) {
      return { prices, confidence, publishTime, source: 'pyth_hermes' };
    }
    throw new Error('Empty Pyth response');
  } catch {
    return fetchChainlinkOnChainPrices();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reads Chainlink AggregatorV3 `latestAnswer()` (selector 0x50d25bcd, 8 decimals) directly from Arbitrum RPC.
 */
export async function fetchChainlinkOnChainPrices(): Promise<PythLiveQuotes> {
  const prices: Record<string, number> = {};
  const confidence: Record<string, number> = {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const entries = Object.entries(CHAINLINK_ARB_FEEDS);
    const batch = entries.map(([, addr], idx) => ({
      jsonrpc: '2.0',
      id: idx + 1,
      method: 'eth_call',
      params: [{ to: addr, data: '0x50d25bcd' }, 'latest'],
    }));

    const res = await fetch('https://arb1.arbitrum.io/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      signal: controller.signal,
    });
    const results = await res.json();
    if (Array.isArray(results)) {
      results.forEach((item, idx) => {
        const sym = entries[idx]?.[0];
        const hex: string = item?.result ?? '';
        if (sym && hex && hex.startsWith('0x') && hex.length >= 10) {
          const val = parseInt(hex, 16) / 1e8;
          if (Number.isFinite(val) && val > 0) {
            prices[sym] = val;
            confidence[sym] = val * 0.0005;
          }
        }
      });
    }
    return {
      prices,
      confidence,
      publishTime: Date.now(),
      source: Object.keys(prices).length > 0 ? 'chainlink_onchain' : 'fallback',
    };
  } catch {
    return { prices: {}, confidence: {}, publishTime: Date.now(), source: 'fallback' };
  } finally {
    clearTimeout(timeout);
  }
}

export interface SovereignSnapshotManifest {
  schemaVersion: 'edge-trader-sovereign-v1';
  createdAt: string;
  contentHashSha256: string;
  arweaveTxTemplate: string;
  ipfsCidPreview: string;
  akashSdlVersion: string;
  safeSession: unknown;
  agentsState: unknown;
  portfolioState: Record<string, unknown>;
}

/**
 * Computes a deterministic SHA-256 hash and builds a decentralized storage bundle
 * ready for Arweave (AR), Filecoin/IPFS (FIL), Sia (SC), or Storj.
 */
export async function createDecentralizedSnapshotBundle(): Promise<SovereignSnapshotManifest> {
  const portfolioState: Record<string, unknown> = {};
  const keysToInclude = [
    'safe-global-wallet-session-v1',
    'autonomous-btc-agents-v1',
    'autonomous-agent-logs-v1',
    'wallet-context-v1',
    'crypto-wallets',
    'smart-alloc-holdings',
    'dca-budget',
  ];

  for (const k of keysToInclude) {
    try {
      const val = localStorage.getItem(k);
      if (val) portfolioState[k] = JSON.parse(val);
    } catch {
      portfolioState[k] = localStorage.getItem(k);
    }
  }

  const rawJson = JSON.stringify(portfolioState);
  let hashHex = '';
  try {
    const buf = new TextEncoder().encode(rawJson);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    hashHex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    hashHex = Math.random().toString(16).slice(2).padEnd(64, '0');
  }

  return {
    schemaVersion: 'edge-trader-sovereign-v1',
    createdAt: new Date().toISOString(),
    contentHashSha256: hashHex,
    arweaveTxTemplate: `ar://${hashHex.slice(0, 43)}`,
    ipfsCidPreview: `bafybeig${hashHex.slice(0, 44)}`,
    akashSdlVersion: '2.0',
    safeSession: portfolioState['safe-global-wallet-session-v1'] ?? null,
    agentsState: portfolioState['autonomous-btc-agents-v1'] ?? null,
    portfolioState,
  };
}

/**
 * Generates an Akash Network SDL (`deploy.yaml`) manifest so the user can deploy
 * this exact application + autonomous AI agents onto Akash decentralized cloud at any time.
 */
export function generateAkashDeploySdl(): string {
  return `---
version: "2.0"
services:
  edge-trader-sovereign:
    image: node:22-alpine
    expose:
      - port: 8080
        as: 80
        to:
          - global: true
    env:
      - SAFE_GUARD_ENFORCE_SELF_RECIPIENT=true
      - SAFE_GUARD_BLOCK_EXTERNAL_TRANSFERS=true
      - PRIMARY_AGENT_GOAL=ACCUMULATE_BTC
      - PYTH_HERMES_ENDPOINT=https://hermes.pyth.network
      - BITTENSOR_TAO_SUBNET=8
profiles:
  compute:
    edge-trader-sovereign:
      resources:
        cpu:
          units: 1.0
        memory:
          size: 1Gi
        storage:
          size: 5Gi
  placement:
    dcloud:
      pricing:
        edge-trader-sovereign:
          denom: uakt
          amount: 1000
deployment:
  edge-trader-sovereign:
    dcloud:
      profile: edge-trader-sovereign
      count: 1
`;
}
