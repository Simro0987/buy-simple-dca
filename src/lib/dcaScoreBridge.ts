/** Most recent Monday Controller factor score — shared between DCA page and MarketContext. */
let latestMarketScore = 50;

export function setLatestMarketScore(score: number): void {
  if (Number.isFinite(score)) latestMarketScore = score;
}

export function getLatestMarketScore(): number {
  return latestMarketScore;
}
