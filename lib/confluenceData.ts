import type { ConfluenceMetric } from "@/lib/confluenceOctagon";

export type { ConfluenceMetric };

/** @deprecated Use live data from useConfluenceOctagon / lib/confluenceOctagon */
export const confluenceMetrics: ConfluenceMetric[] = [
  { subject: "W-RSI", shortLabel: "W-RSI", value: 42, fullMark: 100 },
  { subject: "Macro MFI", shortLabel: "Macro", value: 53, fullMark: 100 },
  { subject: "Bollinger", shortLabel: "Bollinger", value: 61, fullMark: 100 },
  { subject: "Fear/Greed", shortLabel: "F&G", value: 27, fullMark: 100 },
  { subject: "Funding", shortLabel: "Funding", value: 38, fullMark: 100 },
  { subject: "MVRV", shortLabel: "MVRV", value: 72, fullMark: 100 },
  { subject: "Vol. Mom.", shortLabel: "Vol. Mom.", value: 49, fullMark: 100 },
  { subject: "200WMA", shortLabel: "200WMA", value: 84, fullMark: 100 },
];

export const confluenceScore = Math.round(
  confluenceMetrics.reduce((sum, metric) => sum + metric.value, 0) /
    confluenceMetrics.length,
);
