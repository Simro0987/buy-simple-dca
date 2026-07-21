export interface ScoreColorSet {
  text: string;
  bg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  icon: string;
  fill: string;
  label: string;
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/**
 * Semantic color psychology for DCA scores (0 = cheap/panic → 100 = expensive/euphoria).
 */
export function getScoreColor(score: number): ScoreColorSet {
  const s = clamp(score);

  if (s <= 30) {
    return {
      text: "text-emerald-500",
      bg: "bg-emerald-500",
      border: "border-emerald-500/35",
      badgeBg: "bg-emerald-500/10",
      badgeText: "text-emerald-500",
      badgeBorder: "border-emerald-500/35",
      icon: "text-emerald-500/80",
      fill: "fill-emerald-500",
      label: "Agresívny nákup",
    };
  }

  if (s <= 50) {
    return {
      text: "text-teal-400",
      bg: "bg-teal-400",
      border: "border-teal-400/35",
      badgeBg: "bg-teal-400/10",
      badgeText: "text-teal-400",
      badgeBorder: "border-teal-400/35",
      icon: "text-teal-400/80",
      fill: "fill-teal-400",
      label: "Podhodnotené",
    };
  }

  if (s <= 70) {
    return {
      text: "text-amber-400",
      bg: "bg-amber-400",
      border: "border-amber-400/35",
      badgeBg: "bg-amber-400/10",
      badgeText: "text-amber-400",
      badgeBorder: "border-amber-400/35",
      icon: "text-amber-400/80",
      fill: "fill-amber-400",
      label: "Férová cena",
    };
  }

  if (s <= 85) {
    return {
      text: "text-orange-500",
      bg: "bg-orange-500",
      border: "border-orange-500/35",
      badgeBg: "bg-orange-500/10",
      badgeText: "text-orange-500",
      badgeBorder: "border-orange-500/35",
      icon: "text-orange-500/80",
      fill: "fill-orange-500",
      label: "Predražené",
    };
  }

  return {
    text: "text-rose-500",
    bg: "bg-rose-500",
    border: "border-rose-500/35",
    badgeBg: "bg-rose-500/10",
    badgeText: "text-rose-500",
    badgeBorder: "border-rose-500/35",
    icon: "text-rose-500/80",
    fill: "fill-rose-500",
    label: "Euforia / Brzda",
  };
}
