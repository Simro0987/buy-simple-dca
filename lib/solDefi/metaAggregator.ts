import {
  estimateDexSwapGas,
  estimateNativeStakeGas,
} from "@/lib/solDefi/gasEstimator";
import type { JitoMintRateData } from "@/lib/solDefi/dataLayer";
import { fetchJupiterSwapQuote } from "@/lib/solDefi/dataLayer";
import { MARINADE_EARN_URL } from "@/lib/solDefi/constants";

export type RouteSection = "marinade" | "jito";
export type RouteType = "native_delegate" | "native_mint" | "dex_swap";

export interface SolSmartRouteQuote {
  id: string;
  section: RouteSection;
  routeType: RouteType;
  label: string;
  dex: "native" | "jupiter";
  outputToken: string;
  inputSol: number;
  outputAmount: number;
  netValueUsd: number;
  gasUsd: number;
  effectiveApyPct: number;
  feeUsd: number;
  slippagePct: number;
  etaMinutes: number;
  recommended?: boolean;
}

export interface MarinadeRoutingWinner {
  message: string;
  inputSol: number;
  netValueUsd: number;
  gasUsd: number;
}

export interface JitoRoutingWinner {
  route: SolSmartRouteQuote;
  message: string;
  netGainVsRunnerUp: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function computeNetValueUsd(
  outputSol: number,
  solPriceUsd: number,
  gasUsd: number,
  tokenMultiplier = 1,
): number {
  return round2(outputSol * solPriceUsd * tokenMultiplier - gasUsd);
}

function computeEffectiveApy(
  netValueUsd: number,
  inputSol: number,
  solPriceUsd: number,
  baseApyPct: number,
): number {
  if (inputSol <= 0 || solPriceUsd <= 0) return baseApyPct;
  const inputUsd = inputSol * solPriceUsd;
  const yieldBoost = ((netValueUsd - inputUsd) / inputUsd) * 100;
  return round2(Math.max(0, baseApyPct + yieldBoost * 0.05));
}

function buildMarinadeNativeRoute(input: {
  inputSol: number;
  solPriceUsd: number;
  marinadeApyPct: number;
}): SolSmartRouteQuote {
  const gas = estimateNativeStakeGas(input.solPriceUsd);
  const outputAmount = round6(input.inputSol);
  const netValueUsd = computeNetValueUsd(outputAmount, input.solPriceUsd, gas.usdCost);

  return {
    id: "marinade_native_delegate",
    section: "marinade",
    routeType: "native_delegate",
    label: "Natívna delegácia (Marinade Native)",
    dex: "native",
    outputToken: "SOL → Staked SOL",
    inputSol: input.inputSol,
    outputAmount,
    netValueUsd,
    gasUsd: gas.usdCost,
    feeUsd: gas.usdCost,
    slippagePct: 0,
    effectiveApyPct: computeEffectiveApy(
      netValueUsd,
      input.inputSol,
      input.solPriceUsd,
      input.marinadeApyPct,
    ),
    etaMinutes: 2,
    recommended: true,
  };
}

async function buildJitoNativeMintRoute(input: {
  inputSol: number;
  solPriceUsd: number;
  jitoApyPct: number;
  mintRate: JitoMintRateData;
}): Promise<SolSmartRouteQuote> {
  const gas = estimateNativeStakeGas(input.solPriceUsd);
  const outputAmount = round6(input.inputSol * input.mintRate.jitoSolPerSol);
  const netValueUsd = computeNetValueUsd(
    outputAmount,
    input.solPriceUsd,
    gas.usdCost,
    1.02,
  );

  return {
    id: "jito_native_mint",
    section: "jito",
    routeType: "native_mint",
    label: "Native Mint (JitoSOL)",
    dex: "native",
    outputToken: "SOL → JitoSOL",
    inputSol: input.inputSol,
    outputAmount,
    netValueUsd,
    gasUsd: gas.usdCost,
    feeUsd: gas.usdCost,
    slippagePct: 0,
    effectiveApyPct: computeEffectiveApy(
      netValueUsd,
      input.inputSol,
      input.solPriceUsd,
      input.jitoApyPct,
    ),
    etaMinutes: 3,
  };
}

async function buildJitoDexSwapRoute(input: {
  inputSol: number;
  solPriceUsd: number;
  jitoApyPct: number;
  mintRate: JitoMintRateData;
}): Promise<SolSmartRouteQuote> {
  const gas = estimateDexSwapGas(input.solPriceUsd);
  const quote = await fetchJupiterSwapQuote({ inputSol: input.inputSol });
  const outputAmount =
    quote?.outputAmount ?? round6(input.inputSol * input.mintRate.jitoSolPerSol * 0.995);
  const slippagePct = quote?.priceImpactPct ?? 0.1;
  const netValueUsd = computeNetValueUsd(
    outputAmount,
    input.solPriceUsd,
    gas.usdCost,
    1.02,
  );

  return {
    id: "jito_dex_jupiter",
    section: "jito",
    routeType: "dex_swap",
    label: "DEX Swap (JitoSOL) · Jupiter",
    dex: "jupiter",
    outputToken: "SOL → JitoSOL",
    inputSol: input.inputSol,
    outputAmount,
    netValueUsd,
    gasUsd: gas.usdCost,
    feeUsd: gas.usdCost,
    slippagePct: round2(slippagePct),
    effectiveApyPct: computeEffectiveApy(
      netValueUsd,
      input.inputSol,
      input.solPriceUsd,
      input.jitoApyPct,
    ),
    etaMinutes: 1,
  };
}

export async function buildSolSmartRoutingQuotes(input: {
  marinadeSol: number;
  jitoSol: number;
  solPriceUsd: number;
  marinadeApyPct: number;
  jitoApyPct: number;
  mintRate: JitoMintRateData;
}): Promise<{
  routes: SolSmartRouteQuote[];
  marinadeRoutes: SolSmartRouteQuote[];
  jitoRoutes: SolSmartRouteQuote[];
  marinadeWinner: MarinadeRoutingWinner | null;
  jitoWinner: JitoRoutingWinner | null;
}> {
  const routes: SolSmartRouteQuote[] = [];

  let marinadeWinner: MarinadeRoutingWinner | null = null;
  if (input.marinadeSol > 0) {
    const route = buildMarinadeNativeRoute({
      inputSol: input.marinadeSol,
      solPriceUsd: input.solPriceUsd,
      marinadeApyPct: input.marinadeApyPct,
    });
    routes.push(route);
    marinadeWinner = {
      message: `Optimalizácia: Priama delegácia cez ${MARINADE_EARN_URL} (Nulové riziko smart kontraktu)`,
      inputSol: route.inputSol,
      netValueUsd: route.netValueUsd,
      gasUsd: route.gasUsd,
    };
  }

  let jitoWinner: JitoRoutingWinner | null = null;
  if (input.jitoSol > 0) {
    const [nativeRoute, dexRoute] = await Promise.all([
      buildJitoNativeMintRoute({
        inputSol: input.jitoSol,
        solPriceUsd: input.solPriceUsd,
        jitoApyPct: input.jitoApyPct,
        mintRate: input.mintRate,
      }),
      buildJitoDexSwapRoute({
        inputSol: input.jitoSol,
        solPriceUsd: input.solPriceUsd,
        jitoApyPct: input.jitoApyPct,
        mintRate: input.mintRate,
      }),
    ]);

    routes.push(nativeRoute, dexRoute);

    const winner =
      dexRoute.netValueUsd >= nativeRoute.netValueUsd ? dexRoute : nativeRoute;
    const runnerUp =
      winner.id === dexRoute.id ? nativeRoute : dexRoute;

    winner.recommended = true;
    runnerUp.recommended = false;

    const action =
      winner.routeType === "dex_swap"
        ? "Odporúčaný SWAP cez Jupiter"
        : "Odporúčaný Native Mint (JitoSOL)";

    jitoWinner = {
      route: winner,
      message: `Optimalizácia: ${action}`,
      netGainVsRunnerUp: round2(winner.netValueUsd - runnerUp.netValueUsd),
    };
  }

  return {
    routes,
    marinadeRoutes: routes.filter((r) => r.section === "marinade"),
    jitoRoutes: routes.filter((r) => r.section === "jito"),
    marinadeWinner,
    jitoWinner,
  };
}
