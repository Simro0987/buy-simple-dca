import { buildConfluenceBrain, EMPTY_REGIME_METRICS } from "@/lib/dca/confluence";
import { calculateDeploymentScore } from "@/lib/dca/deployment";
import type { MarketRegime, TokenMarketSnapshot } from "@/lib/dca/types";

/** @deprecated Use calculateDeploymentScore + buildConfluenceBrain. */
export function buildMarketRegime(
  btc: TokenMarketSnapshot | undefined,
  moneyMode: boolean,
): MarketRegime {
  const deployment = calculateDeploymentScore(btc, EMPTY_REGIME_METRICS, moneyMode);
  const brain = buildConfluenceBrain(btc, EMPTY_REGIME_METRICS);
  return {
    kind: deployment.kind,
    englishKind: deployment.englishKind,
    label: deployment.label,
    description: deployment.description,
    finalScore: deployment.score,
    allocationPercent: deployment.allocationPercent,
    confidence: deployment.confidence,
    confidenceMultiplier: deployment.confidenceMultiplier,
    confluenceScore: brain.score,
    confluenceIndicators: brain.indicators,
    factors: deployment.factors,
    blend: deployment.blend,
    deploymentBlend: deployment.blend,
    deploymentNotes: deployment.notes,
    basket: brain.basket,
    safeHaven: brain.safeHaven,
  };
}
