import {
  createTrackedAsset,
  createTransactionId,
  type PortfolioData,
} from "@/lib/portfolioStorage";
import {
  PORTFOLIO_MORPHO_SUPPLY_NAME,
  PORTFOLIO_MORPHO_SUPPLY_SYMBOL,
} from "@/lib/linkDefi/constants";

export interface LinkDefiExecutionInput {
  supplyLink: number;
  linkPriceUsd: number;
}

const MORPHO_SUPPLY_ASSET_DEF = {
  symbol: PORTFOLIO_MORPHO_SUPPLY_SYMBOL,
  name: PORTFOLIO_MORPHO_SUPPLY_NAME,
  coingeckoId: "chainlink",
  logoUrl:
    "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
  category: "yield" as const,
};

function ensureMorphoSupplyAsset(
  portfolio: PortfolioData,
): { portfolio: PortfolioData; assetId: string } {
  const existing = portfolio.assets.find(
    (a) => a.symbol === PORTFOLIO_MORPHO_SUPPLY_SYMBOL,
  );
  if (existing) return { portfolio, assetId: existing.id };

  const nextAsset = createTrackedAsset(MORPHO_SUPPLY_ASSET_DEF);
  return {
    portfolio: {
      ...portfolio,
      assets: [...portfolio.assets, nextAsset],
    },
    assetId: nextAsset.id,
  };
}

function findLinkAsset(portfolio: PortfolioData) {
  return portfolio.assets.find((a) => a.symbol === "LINK");
}

/**
 * Po potvrdení exekúcie vynuluje surový LINK a vytvorí
 * `LINK (Morpho Supply)` bez akéhokoľvek dlhu (Borrow = 0).
 */
export function applyLinkDefiMozogExecution(
  portfolio: PortfolioData,
  input: LinkDefiExecutionInput,
): PortfolioData {
  const linkAsset = findLinkAsset(portfolio);
  if (!linkAsset || input.supplyLink <= 0) return portfolio;

  const now = new Date().toISOString();
  let next = { ...portfolio };
  const transactions = [...portfolio.transactions];

  transactions.unshift({
    id: createTransactionId(),
    date: now,
    assetId: linkAsset.id,
    symbol: "LINK",
    amount: input.supplyLink,
    priceUsd: input.linkPriceUsd,
    spentUsd: input.supplyLink * input.linkPriceUsd,
    type: "REMOVE",
  });

  const ensured = ensureMorphoSupplyAsset(next);
  next = ensured.portfolio;

  transactions.unshift({
    id: createTransactionId(),
    date: now,
    assetId: ensured.assetId,
    symbol: PORTFOLIO_MORPHO_SUPPLY_SYMBOL,
    amount: input.supplyLink,
    priceUsd: input.linkPriceUsd,
    spentUsd: input.supplyLink * input.linkPriceUsd,
    type: "ADD",
  });

  return { ...next, transactions };
}
