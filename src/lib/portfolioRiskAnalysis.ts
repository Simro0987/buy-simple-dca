export interface PortfolioRiskInsightInput {
  fearGreedValue: number;
  fearGreedLabel: string;
  totalPnlPct: number;
  lang?: 'sk' | 'en';
}

function normalizeFearGreedLabel(value: number, label: string): string {
  const trimmed = label.trim();
  if (trimmed) return trimmed;
  if (value <= 24) return 'Extreme Fear';
  if (value <= 44) return 'Fear';
  if (value <= 55) return 'Neutral';
  if (value <= 74) return 'Greed';
  return 'Extreme Greed';
}

function portfolioDirection(pnlPct: number, sk: boolean): { word: string; isUp: boolean } {
  if (pnlPct >= 0) {
    return { word: sk ? 'v pluse' : 'up', isUp: true };
  }
  return { word: sk ? 'v mínuse' : 'down', isUp: false };
}

function marketAdvice(value: number, pnlPct: number, sk: boolean): string {
  const greedy = value >= 60;
  const fearful = value <= 40;
  const portfolioUp = pnlPct >= 0;

  if (greedy && portfolioUp) {
    return sk
      ? 'zvážiť čiastočný výber zisku a znížiť expozíciu'
      : 'take some profits and trim exposure';
  }
  if (greedy && !portfolioUp) {
    return sk
      ? 'počkať na lepší vstup a nenakupovať do eufórie'
      : 'wait for a better entry and avoid chasing euphoria';
  }
  if (fearful && portfolioUp) {
    return sk
      ? 'chrániť zisky, ale nepredávať panicky'
      : 'protect gains without panic selling';
  }
  if (fearful && !portfolioUp) {
    return sk
      ? 'počkať na dip a DCA postupne do strachu'
      : 'wait for a dip and DCA gradually into fear';
  }
  return sk
    ? 'držať plán a sledovať alokáciu'
    : 'stay on plan and monitor allocation';
}

/**
 * Simulated AI-style daily risk insight from live PnL % and Fear & Greed.
 */
export function generatePortfolioRiskInsight(input: PortfolioRiskInsightInput): string {
  const sk = input.lang === 'sk';
  const fgLabel = normalizeFearGreedLabel(input.fearGreedValue, input.fearGreedLabel);
  const { word, isUp } = portfolioDirection(input.totalPnlPct, sk);
  const advice = marketAdvice(input.fearGreedValue, input.totalPnlPct, sk);
  const pct = Math.abs(input.totalPnlPct).toFixed(2);

  if (sk) {
    return (
      `Trh je v režime **${fgLabel}** (${input.fearGreedValue}). ` +
      `Vaše portfólio je momentálne **${word}** o **${pct}%**. ` +
      `Môže byť vhodný čas **${advice}**.`
    );
  }

  return (
    `Market is in **${fgLabel}** (${input.fearGreedValue}). ` +
    `Your portfolio is currently **${word}** by **${pct}%**. ` +
    `It might be a good time to **${advice}**.`
  );
}
