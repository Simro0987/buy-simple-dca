import {
  createTrackedAsset,
  createTransactionId,
  findAssetByCoingeckoId,
  type PortfolioData,
} from "@/lib/portfolioStorage";
import {
  PORTFOLIO_JITO_RESTAKED_SYMBOL,
  PORTFOLIO_MARINADE_SYMBOL,
} from "@/lib/solDefi/constants";

export interface SolDefiExecutionInput {
  marinadeSol: number;
  jitoSolInput: number;
  jitoSolOutput: number;
  solPriceUsd: number;
  gasReserveSol: number;
}

const MARINADE_ASSET_DEF = {
  symbol: PORTFOLIO_MARINADE_SYMBOL,
  name: "Marinade Native (Staked SOL)",
  coingeckoId: "solana",
  logoUrl: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  category: "satellite" as const,
};

const JITO_RESTAKED_DEF = {
  symbol: PORTFOLIO_JITO_RESTAKED_SYMBOL,
  name: "Jito Restaked (JitoSOL)",
  coingeckoId: "jito-staked-sol",
  logoUrl:
    "https://assets.coingecko.com/coins/images/28046/small/JitoSOL-200.png",
  category: "satellite" as const,
};

function ensureAsset(
  portfolio: PortfolioData,
  def: typeof MARINADE_ASSET_DEF,
): { portfolio: PortfolioData; assetId: string } {
  const existing = portfolio.assets.find((a) => a.symbol === def.symbol);
  if (existing) return { portfolio, assetId: existing.id };

  const nextAsset = createTrackedAsset(def);
  return {
    portfolio: {
      ...portfolio,
      assets: [...portfolio.assets, nextAsset],
    },
    assetId: nextAsset.id,
  };
}

function findSolAsset(portfolio: PortfolioData) {
  return portfolio.assets.find((a) => a.symbol === "SOL");
}

/**
 * Module 6 — po potvrdení akcií odpočíta surové SOL a pripíše
 * Marinade Native + Jito Restaked pozície.
 */
export function applySolDefiMozogExecution(
  portfolio: PortfolioData,
  input: SolDefiExecutionInput,
): PortfolioData {
  const solAsset = findSolAsset(portfolio);
  if (!solAsset) return portfolio;

  const totalDeduct =
    input.marinadeSol + input.jitoSolInput + input.gasReserveSol;
  if (totalDeduct <= 0) return portfolio;

  const now = new Date().toISOString();
  let next = { ...portfolio };
  const transactions = [...portfolio.transactions];

  transactions.unshift({
    id: createTransactionId(),
    date: now,
    assetId: solAsset.id,
    symbol: "SOL",
    amount: totalDeduct,
    priceUsd: input.solPriceUsd,
    spentUsd: totalDeduct * input.solPriceUsd,
    type: "REMOVE",
  });

  if (input.marinadeSol > 0) {
    const ensured = ensureAsset(next, MARINADE_ASSET_DEF);
    next = ensured.portfolio;
    transactions.unshift({
      id: createTransactionId(),
      date: now,
      assetId: ensured.assetId,
      symbol: PORTFOLIO_MARINADE_SYMBOL,
      amount: input.marinadeSol,
      priceUsd: input.solPriceUsd,
      spentUsd: input.marinadeSol * input.solPriceUsd,
      type: "ADD",
    });
  }

  if (input.jitoSolOutput > 0) {
    const ensured = ensureAsset(next, JITO_RESTAKED_DEF);
    next = ensured.portfolio;
    const jitoPrice =
      input.jitoSolInput > 0
        ? (input.jitoSolInput * input.solPriceUsd) / input.jitoSolOutput
        : input.solPriceUsd;

    transactions.unshift({
      id: createTransactionId(),
      date: now,
      assetId: ensured.assetId,
      symbol: PORTFOLIO_JITO_RESTAKED_SYMBOL,
      amount: input.jitoSolOutput,
      priceUsd: jitoPrice,
      spentUsd: input.jitoSolInput * input.solPriceUsd,
      type: "ADD",
    });
  }

  return { ...next, transactions };
}

/** Guard: skip if portfolio already has staked positions from prior execution. */
export function hasSolDefiPositions(portfolio: PortfolioData): boolean {
  return portfolio.assets.some(
    (a) =>
      a.symbol === PORTFOLIO_MARINADE_SYMBOL ||
      a.symbol === PORTFOLIO_JITO_RESTAKED_SYMBOL,
  );
}

export function resolveJitoRestakedAsset(portfolio: PortfolioData) {
  return findAssetByCoingeckoId(portfolio.assets, JITO_RESTAKED_DEF.coingeckoId);
}
