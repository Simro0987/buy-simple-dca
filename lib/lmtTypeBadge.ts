import type { SmoothDiscountBlend } from "@/lib/smartTargetSelector";

export type LmtTypeTone = "s1" | "smart" | "deep_wick";

export interface LmtTypeDisplay {
  label: string;
  tone: LmtTypeTone;
}

export const LMT_TYPE_BADGE_STYLES: Record<LmtTypeTone, string> = {
  s1: "border-emerald-500/30 bg-emerald-500/12 text-emerald-300",
  smart: "border-violet-500/35 bg-violet-500/15 text-violet-300",
  deep_wick: "border-orange-500/35 bg-orange-500/15 text-orange-300",
};

/** Dynamic LMT label driven by smooth S1 blend weight (per token). */
export function resolveLmtTypeDisplay(input: {
  smoothBlend: SmoothDiscountBlend | null | undefined;
  limitDepthMode?: "standard" | "deep_wick" | null;
  fallbackBadge?: string | null;
}): LmtTypeDisplay {
  if (input.smoothBlend != null) {
    if (input.smoothBlend.s1Weight < 0.999) {
      return { label: "SMART ZĽAVA", tone: "smart" };
    }
    return { label: "S1 SUPPORT", tone: "s1" };
  }

  if (input.limitDepthMode === "deep_wick") {
    return {
      label: input.fallbackBadge ?? "DEEP WICK",
      tone: "deep_wick",
    };
  }

  return { label: "S1 SUPPORT", tone: "s1" };
}
