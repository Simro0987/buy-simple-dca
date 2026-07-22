import type { DexId } from "@/lib/ethDefi/constants";
import {
  estimateDexSwapGas,
  estimateNativeMintGas,
  type GasFeeEstimate,
} from "@/lib/ethDefi/gasEstimator";
import type { OnChainMintRates } from "@/lib/ethDefi/dataLayer";

export type RouteSection = "rocket" | "lido";
export type RouteType = "native_mint" | "dex_swap";

export interface SmartRouteQuote {
  id: string;
  section: RouteSection;
  routeType: RouteType;
  label: string;
  dex: DexId | "native";
  outputToken: string;
  inputEth: number;
  outputAmount: number;
  netValueUsd: number;
  gasUsd: number;
  effectiveApyPct: number;
  feeUsd: number;
  slippagePct: number;
  etaMinutes: number;
  recommended?: boolean;
}

export interface RoutingWinner {
  route: SmartRouteQuote;
  lidoToken: "stETH" | "wstETH";
  message: string;
  netGainVsRunnerUp: number;
}

const STETH_ADDRESS = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const WSTETH_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
const RETH_ADDRESS = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ONE_ETH_WEI = "1000000000000000000";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function getOneInchApiKey(): string | undefined {
  return process.env.VITE_ONEINCH_API_KEY ?? process.env.NEXT_PUBLIC_ONEINCH_API_KEY;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 3000,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface DexQuoteResult {
  buyAmount: number;
  slippagePct: number;
}

async function fetchCowSwapQuote(
  sellEth: number,
  buyToken: string,
): Promise<DexQuoteResult | null> {
  const sellAmount = BigInt(Math.floor(sellEth * 1e18)).toString();
  const res = await fetchWithTimeout("https://api.cow.fi/mainnet/api/v1/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sellToken: WETH_ADDRESS,
      buyToken,
      sellAmountBeforeFee: sellAmount,
      kind: "sell",
      from: "0x0000000000000000000000000000000000000001",
    }),
  });
  if (!res) return null;

  try {
    const json = (await res.json()) as {
      quote?: { buyAmount?: string; feeAmount?: string };
    };
    const buyAmount = Number(json.quote?.buyAmount ?? 0) / 1e18;
    if (buyAmount <= 0) return null;
    return { buyAmount: round6(buyAmount), slippagePct: 0.03 };
  } catch {
    return null;
  }
}

async function fetchOneInchQuote(
  sellEth: number,
  buyToken: string,
): Promise<DexQuoteResult | null> {
  const apiKey = getOneInchApiKey();
  if (!apiKey) return null;

  const sellAmount = BigInt(Math.floor(sellEth * 1e18)).toString();
  const url = new URL("https://api.1inch.dev/swap/v6.0/1/quote");
  url.searchParams.set("src", WETH_ADDRESS);
  url.searchParams.set("dst", buyToken);
  url.searchParams.set("amount", sellAmount);

  const res = await fetchWithTimeout(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res) return null;

  try {
    const json = (await res.json()) as { dstAmount?: string };
    const buyAmount = Number(json.dstAmount ?? 0) / 1e18;
    if (buyAmount <= 0) return null;
    return { buyAmount: round6(buyAmount), slippagePct: 0.04 };
  } catch {
    return null;
  }
}

async function fetchJumperQuote(
  sellEth: number,
  buyToken: string,
): Promise<DexQuoteResult | null> {
  const sellAmount = BigInt(Math.floor(sellEth * 1e18)).toString();
  const url = new URL("https://li.quest/v1/quote");
  url.searchParams.set("fromChain", "1");
  url.searchParams.set("toChain", "1");
  url.searchParams.set("fromToken", WETH_ADDRESS);
  url.searchParams.set("toToken", buyToken);
  url.searchParams.set("fromAmount", sellAmount);
  url.searchParams.set("fromAddress", "0x0000000000000000000000000000000000000001");

  const res = await fetchWithTimeout(url.toString());
  if (!res) return null;

  try {
    const json = (await res.json()) as {
      estimate?: { toAmount?: string };
    };
    const buyAmount = Number(json.estimate?.toAmount ?? 0) / 1e18;
    if (buyAmount <= 0) return null;
    return { buyAmount: round6(buyAmount), slippagePct: 0.05 };
  } catch {
    return null;
  }
}

function estimateUniswapQuote(
  sellEth: number,
  mintRate: number,
): DexQuoteResult {
  const slippagePct = 0.06;
  const buyAmount = sellEth * mintRate * (1 - slippagePct);
  return { buyAmount: round6(buyAmount), slippagePct };
}

async function fetchBestDexQuote(
  sellEth: number,
  tokenAddress: string,
  mintRate: number,
): Promise<{ dex: DexId; quote: DexQuoteResult } | null> {
  const results: Array<{ dex: DexId; quote: DexQuoteResult }> = [];

  const [cow, inch, jumper] = await Promise.all([
    fetchCowSwapQuote(sellEth, tokenAddress).then((q) =>
      q ? { dex: "cowswap" as const, quote: q } : null,
    ),
    fetchOneInchQuote(sellEth, tokenAddress).then((q) =>
      q ? { dex: "oneinch" as const, quote: q } : null,
    ),
    fetchJumperQuote(sellEth, tokenAddress).then((q) =>
      q ? { dex: "jumper" as const, quote: q } : null,
    ),
  ]);

  if (cow) results.push(cow);
  if (inch) results.push(inch);
  if (jumper) results.push(jumper);

  results.push({
    dex: "uniswap",
    quote: estimateUniswapQuote(sellEth, mintRate),
  });

  if (results.length === 0) return null;

  return results.reduce((best, cur) =>
    cur.quote.buyAmount > best.quote.buyAmount ? cur : best,
  );
}

const DEX_LABELS: Record<DexId | "native", string> = {
  cowswap: "CowSwap",
  oneinch: "1inch",
  jumper: "Jumper",
  uniswap: "Uniswap",
  native: "Native Mint",
};

function computeNetValueUsd(
  outputAmount: number,
  tokenPriceEth: number,
  ethPriceUsd: number,
  gasUsd: number,
): number {
  const grossUsd = outputAmount * tokenPriceEth * ethPriceUsd;
  return round2(grossUsd - gasUsd);
}

function computeEffectiveApy(
  netValueUsd: number,
  inputEth: number,
  ethPriceUsd: number,
  baseApyPct: number,
): number {
  if (inputEth <= 0 || ethPriceUsd <= 0) return baseApyPct;
  const inputUsd = inputEth * ethPriceUsd;
  const yieldBoost = ((netValueUsd - inputUsd) / inputUsd) * 100;
  return round2(Math.max(0, baseApyPct + yieldBoost * 0.1));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function buildNativeMintRoute(input: {
  section: RouteSection;
  inputEth: number;
  outputToken: string;
  mintRate: number;
  baseApyPct: number;
  gwei: number;
  ethPriceUsd: number;
}): SmartRouteQuote {
  const gas = estimateNativeMintGas(input.gwei, input.ethPriceUsd);
  const outputAmount = round6(input.inputEth * input.mintRate);
  const netValueUsd = computeNetValueUsd(
    outputAmount,
    1,
    input.ethPriceUsd,
    gas.usdCost,
  );

  const tokenLabel = input.outputToken.replace("ETH → ", "");

  return {
    id: `${input.section}_native_${tokenLabel.toLowerCase()}`,
    section: input.section,
    routeType: "native_mint",
    label: `Native Mint (${tokenLabel})`,
    dex: "native",
    outputToken: input.outputToken,
    inputEth: input.inputEth,
    outputAmount,
    netValueUsd,
    gasUsd: gas.usdCost,
    feeUsd: gas.usdCost,
    slippagePct: 0,
    effectiveApyPct: computeEffectiveApy(
      netValueUsd,
      input.inputEth,
      input.ethPriceUsd,
      input.baseApyPct,
    ),
    etaMinutes: 8,
  };
}

async function buildDexSwapRoute(input: {
  section: RouteSection;
  inputEth: number;
  outputToken: string;
  tokenAddress: string;
  mintRate: number;
  baseApyPct: number;
  gwei: number;
  ethPriceUsd: number;
}): Promise<SmartRouteQuote> {
  const gas = estimateDexSwapGas(input.gwei, input.ethPriceUsd);
  const bestDex = await fetchBestDexQuote(
    input.inputEth,
    input.tokenAddress,
    input.mintRate,
  );

  const tokenLabel = input.outputToken.replace("ETH → ", "");
  const dex = bestDex?.dex ?? "uniswap";
  const quote = bestDex?.quote ?? estimateUniswapQuote(input.inputEth, input.mintRate);
  const outputAmount = quote.buyAmount;
  const netValueUsd = computeNetValueUsd(
    outputAmount,
    1,
    input.ethPriceUsd,
    gas.usdCost,
  );

  return {
    id: `${input.section}_dex_${tokenLabel.toLowerCase()}_${dex}`,
    section: input.section,
    routeType: "dex_swap",
    label: `DEX Swap (${tokenLabel}) · ${DEX_LABELS[dex]}`,
    dex,
    outputToken: input.outputToken,
    inputEth: input.inputEth,
    outputAmount,
    netValueUsd,
    gasUsd: gas.usdCost,
    feeUsd: gas.usdCost,
    slippagePct: round2(quote.slippagePct * 100),
    effectiveApyPct: computeEffectiveApy(
      netValueUsd,
      input.inputEth,
      input.ethPriceUsd,
      input.baseApyPct,
    ),
    etaMinutes: dex === "cowswap" ? 12 : dex === "oneinch" ? 6 : 8,
  };
}

/** Module 4 — Meta-Aggregator: porovnanie trás podľa Net Value po gase. */
export async function buildSmartRoutingQuotes(input: {
  lidoEth: number;
  rocketEth: number;
  ethPriceUsd: number;
  lidoApyPct: number;
  rocketApyPct: number;
  gwei: number;
  mintRates: OnChainMintRates;
}): Promise<{
  routes: SmartRouteQuote[];
  rocketWinner: SmartRouteQuote | null;
  lidoWinner: SmartRouteQuote | null;
  routingWinner: RoutingWinner | null;
}> {
  const routes: SmartRouteQuote[] = [];

  if (input.rocketEth > 0) {
    routes.push(
      buildNativeMintRoute({
        section: "rocket",
        inputEth: input.rocketEth,
        outputToken: "ETH → rETH",
        mintRate: input.mintRates.rEthPerEth,
        baseApyPct: input.rocketApyPct,
        gwei: input.gwei,
        ethPriceUsd: input.ethPriceUsd,
      }),
    );
    routes.push(
      await buildDexSwapRoute({
        section: "rocket",
        inputEth: input.rocketEth,
        outputToken: "ETH → rETH",
        tokenAddress: RETH_ADDRESS,
        mintRate: input.mintRates.rEthPerEth,
        baseApyPct: input.rocketApyPct,
        gwei: input.gwei,
        ethPriceUsd: input.ethPriceUsd,
      }),
    );
  }

  if (input.lidoEth > 0) {
    routes.push(
      buildNativeMintRoute({
        section: "lido",
        inputEth: input.lidoEth,
        outputToken: "ETH → stETH",
        mintRate: input.mintRates.stEthPerEth,
        baseApyPct: input.lidoApyPct,
        gwei: input.gwei,
        ethPriceUsd: input.ethPriceUsd,
      }),
    );
    routes.push(
      await buildDexSwapRoute({
        section: "lido",
        inputEth: input.lidoEth,
        outputToken: "ETH → stETH",
        tokenAddress: STETH_ADDRESS,
        mintRate: input.mintRates.stEthPerEth,
        baseApyPct: input.lidoApyPct,
        gwei: input.gwei,
        ethPriceUsd: input.ethPriceUsd,
      }),
    );
    routes.push(
      await buildDexSwapRoute({
        section: "lido",
        inputEth: input.lidoEth,
        outputToken: "ETH → wstETH",
        tokenAddress: WSTETH_ADDRESS,
        mintRate: input.mintRates.wstEthPerEth,
        baseApyPct: input.lidoApyPct,
        gwei: input.gwei,
        ethPriceUsd: input.ethPriceUsd,
      }),
    );
  }

  const rocketRoutes = routes.filter((r) => r.section === "rocket");
  const lidoRoutes = routes.filter((r) => r.section === "lido");

  const rocketWinner =
    rocketRoutes.length > 0
      ? rocketRoutes.reduce((best, r) => (r.netValueUsd > best.netValueUsd ? r : best))
      : null;

  const lidoWinner =
    lidoRoutes.length > 0
      ? lidoRoutes.reduce((best, r) => (r.netValueUsd > best.netValueUsd ? r : best))
      : null;

  routes.forEach((r) => {
    r.recommended =
      (r.section === "rocket" && r.id === rocketWinner?.id) ||
      (r.section === "lido" && r.id === lidoWinner?.id);
  });

  const allWinners = [rocketWinner, lidoWinner].filter(Boolean) as SmartRouteQuote[];
  const globalBest =
    allWinners.length > 0
      ? allWinners.reduce((best, r) => (r.netValueUsd > best.netValueUsd ? r : best))
      : null;

  let routingWinner: RoutingWinner | null = null;
  if (globalBest) {
    const sectionRoutes =
      globalBest.section === "rocket" ? rocketRoutes : lidoRoutes;
    const sorted = [...sectionRoutes].sort((a, b) => b.netValueUsd - a.netValueUsd);
    const runnerUp = sorted[1];
    const netGainVsRunnerUp = runnerUp
      ? round2(globalBest.netValueUsd - runnerUp.netValueUsd)
      : 0;

    const lidoToken: "stETH" | "wstETH" = globalBest.outputToken.includes("wstETH")
      ? "wstETH"
      : "stETH";

    const dexLabel =
      globalBest.dex === "native"
        ? "Native Mint"
        : DEX_LABELS[globalBest.dex];

    const action =
      globalBest.routeType === "native_mint"
        ? `Odporúčaný Native Mint (${lidoToken === "wstETH" ? "wstETH" : "stETH"})`
        : `Odporúčaný SWAP cez ${dexLabel}`;

    routingWinner = {
      route: globalBest,
      lidoToken: globalBest.section === "lido" ? lidoToken : "stETH",
      message: `Optimalizácia: ${action}`,
      netGainVsRunnerUp,
    };
  }

  return {
    routes: routes.sort((a, b) => b.netValueUsd - a.netValueUsd),
    rocketWinner,
    lidoWinner,
    routingWinner,
  };
}

export { DEX_LABELS };
