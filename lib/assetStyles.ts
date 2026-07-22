import type { AssetAccent } from "@/lib/data";
import type { AssetCategory } from "@/lib/portfolioStorage";

export const CATEGORY_COLORS = {
  core: "#F7931A",
  satellite: "#8B5CF6",
  yield: "#10B981",
} as const;

export interface CategoryStyles {
  color: string;
  dot: string;
  ring: string;
  bg: string;
  bubble: string;
  bubbleGlow: string;
  label: string;
  chartStroke: string;
}

const CATEGORY_STYLES: Record<AssetCategory, CategoryStyles> = {
  core: {
    color: CATEGORY_COLORS.core,
    dot: "bg-[#F7931A]",
    ring: "ring-[#F7931A]/30",
    bg: "bg-[#F7931A]",
    bubble: "bg-[#F7931A]",
    bubbleGlow: "shadow-[0_0_24px_rgba(247,147,26,0.4)]",
    label: "text-[#F7931A]",
    chartStroke: CATEGORY_COLORS.core,
  },
  satellite: {
    color: CATEGORY_COLORS.satellite,
    dot: "bg-[#8B5CF6]",
    ring: "ring-[#8B5CF6]/30",
    bg: "bg-[#8B5CF6]",
    bubble: "bg-[#8B5CF6]",
    bubbleGlow: "shadow-[0_0_24px_rgba(139,92,246,0.4)]",
    label: "text-[#8B5CF6]",
    chartStroke: CATEGORY_COLORS.satellite,
  },
  yield: {
    color: CATEGORY_COLORS.yield,
    dot: "bg-[#10B981]",
    ring: "ring-[#10B981]/30",
    bg: "bg-[#10B981]",
    bubble: "bg-[#10B981]",
    bubbleGlow: "shadow-[0_0_24px_rgba(16,185,129,0.4)]",
    label: "text-[#10B981]",
    chartStroke: CATEGORY_COLORS.yield,
  },
};

const ACCENT_PALETTE: { accent: AssetAccent; ring: string; bg: string }[] = [
  { accent: "orange", ring: "ring-orange-500/30", bg: "bg-orange-500" },
  { accent: "purple", ring: "ring-purple-400/30", bg: "bg-purple-500" },
  {
    accent: "cyan",
    ring: "ring-cyan-400/30",
    bg: "bg-gradient-to-br from-cyan-400 to-purple-500",
  },
];

export const CATEGORY_DISPLAY_ORDER: AssetCategory[] = [
  "core",
  "satellite",
  "yield",
];

export function getCategoryStyles(category: AssetCategory): CategoryStyles {
  return CATEGORY_STYLES[category];
}

export function getCategoryColor(category: AssetCategory): string {
  return CATEGORY_COLORS[category];
}

export function getCategoryDotClass(category: AssetCategory): string {
  return CATEGORY_STYLES[category].dot;
}

export function getCategoryLabel(category: AssetCategory): string {
  if (category === "core") return "Core";
  if (category === "yield") return "Yield";
  return "Satellite";
}

export function getCoreAccentStyles(accent: AssetAccent) {
  const match = ACCENT_PALETTE.find((item) => item.accent === accent);
  return match ?? ACCENT_PALETTE[0];
}

export function getAccentForIndex(index: number): AssetAccent {
  return ACCENT_PALETTE[index % ACCENT_PALETTE.length].accent;
}

export function resolveAssetCategory(
  symbol: string,
  raw?: string,
): AssetCategory {
  const upper = symbol.toUpperCase();

  if (raw === "core" || raw === "yield" || raw === "satellite") {
    if (raw === "core" && (upper === "ETH" || upper === "SOL")) {
      return "satellite";
    }
    return raw;
  }

  if (upper === "BTC") return "core";
  if (upper === "ETH" || upper === "SOL") return "satellite";
  return "yield";
}
