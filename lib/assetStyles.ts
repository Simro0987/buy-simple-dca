export const CATEGORY_COLORS = {
  core: "#F7931A",
  satellite: "#8B5CF6",
  yield: "#10B981",
} as const;

export type AssetCategory = "core" | "satellite" | "yield";

export interface CategoryStyles {
  color: string;
  dot: string;
  ring: string;
  bg: string;
  label: string;
}

const CATEGORY_STYLES: Record<AssetCategory, CategoryStyles> = {
  core: {
    color: CATEGORY_COLORS.core,
    dot: "bg-[#F7931A]",
    ring: "ring-[#F7931A]/30",
    bg: "bg-[#F7931A]",
    label: "text-[#F7931A]",
  },
  satellite: {
    color: CATEGORY_COLORS.satellite,
    dot: "bg-[#8B5CF6]",
    ring: "ring-[#8B5CF6]/30",
    bg: "bg-[#8B5CF6]",
    label: "text-[#8B5CF6]",
  },
  yield: {
    color: CATEGORY_COLORS.yield,
    dot: "bg-[#10B981]",
    ring: "ring-[#10B981]/30",
    bg: "bg-[#10B981]",
    label: "text-[#10B981]",
  },
};

export function getCategoryStyles(category: AssetCategory): CategoryStyles {
  return CATEGORY_STYLES[category];
}

export function getCategoryColor(category: AssetCategory): string {
  return CATEGORY_COLORS[category];
}
