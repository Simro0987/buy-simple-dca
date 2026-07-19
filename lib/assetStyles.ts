import type { AssetAccent } from "@/lib/data";
import type { AssetCategory } from "@/lib/portfolioStorage";

export interface CategoryStyles {
  dot: string;
  ring: string;
  bg: string;
  bubble: string;
  bubbleGlow: string;
  label: string;
}

const CATEGORY_STYLES: Record<AssetCategory, CategoryStyles> = {
  core: {
    dot: "bg-orange-400",
    ring: "ring-orange-500/30",
    bg: "bg-orange-500",
    bubble: "bg-gradient-to-br from-orange-400 to-amber-500",
    bubbleGlow: "shadow-[0_0_24px_rgba(251,146,60,0.35)]",
    label: "text-orange-400",
  },
  yield: {
    dot: "bg-emerald-400",
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500",
    bubble: "bg-gradient-to-br from-emerald-400 to-teal-500",
    bubbleGlow: "shadow-[0_0_24px_rgba(52,211,153,0.35)]",
    label: "text-emerald-400",
  },
  satellite: {
    dot: "bg-violet-400",
    ring: "ring-violet-500/30",
    bg: "bg-gradient-to-br from-violet-500 to-blue-500",
    bubble: "bg-gradient-to-br from-violet-400 to-blue-500",
    bubbleGlow: "shadow-[0_0_24px_rgba(139,92,246,0.35)]",
    label: "text-violet-400",
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

export function getCategoryStyles(category: AssetCategory): CategoryStyles {
  return CATEGORY_STYLES[category];
}

export function getCategoryDotClass(category: AssetCategory): string {
  return CATEGORY_STYLES[category].dot;
}

export function getCategoryLabel(category: AssetCategory): string {
  if (category === "core") return "Core";
  if (category === "yield") return "Yield";
  return "Satellites";
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
