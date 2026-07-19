import type { AssetAccent } from "@/lib/data";

const ACCENT_PALETTE: { accent: AssetAccent; ring: string; bg: string }[] = [
  { accent: "orange", ring: "ring-orange-500/30", bg: "bg-orange-500" },
  { accent: "purple", ring: "ring-purple-400/30", bg: "bg-purple-500" },
  {
    accent: "cyan",
    ring: "ring-cyan-400/30",
    bg: "bg-gradient-to-br from-cyan-400 to-purple-500",
  },
];

const YIELD_PALETTE = [
  { ring: "ring-blue-500/30", bg: "bg-blue-500" },
  { ring: "ring-sky-500/30", bg: "bg-sky-500" },
  { ring: "ring-fuchsia-500/30", bg: "bg-fuchsia-500" },
  { ring: "ring-teal-500/30", bg: "bg-teal-500" },
  { ring: "ring-purple-500/30", bg: "bg-purple-500" },
  { ring: "ring-pink-500/30", bg: "bg-pink-500" },
  { ring: "ring-indigo-500/30", bg: "bg-indigo-500" },
  { ring: "ring-amber-500/30", bg: "bg-amber-500" },
  { ring: "ring-emerald-500/30", bg: "bg-emerald-500" },
  { ring: "ring-rose-500/30", bg: "bg-rose-500" },
];

export function getCoreAccentStyles(accent: AssetAccent) {
  const match = ACCENT_PALETTE.find((item) => item.accent === accent);
  return match ?? ACCENT_PALETTE[0];
}

export function getYieldAccentStyles(index: number) {
  return YIELD_PALETTE[index % YIELD_PALETTE.length];
}

export function getAccentForIndex(index: number): AssetAccent {
  return ACCENT_PALETTE[index % ACCENT_PALETTE.length].accent;
}
