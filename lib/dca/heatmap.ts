/** Visual-only heatmap. Does not change scores, splits, or live data. */

export type HeatmapScale = "standard" | "inverse";

export const HEAT = {
  blood: "#FF2A6D",
  bear: "#FF9900",
  yellow: "#FFD700",
  green: "#00FFA3",
  cyan: "#00FFFF",
  purple: "#B026FF",
  grey: "#808080",
} as const;

export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw.length === 3 ? raw.replace(/(.)/g, "$1$1") : raw, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getHeatmapColor(
  value: number,
  scale: HeatmapScale = "standard",
): string {
  const v = Number.isFinite(value) ? value : 50;
  if (scale === "inverse") {
    if (v <= 30) return HEAT.green;
    if (v <= 45) return HEAT.cyan;
    if (v <= 60) return HEAT.yellow;
    if (v <= 75) return HEAT.bear;
    return HEAT.blood;
  }
  if (v <= 25) return HEAT.blood;
  if (v <= 45) return HEAT.bear;
  if (v <= 55) return HEAT.yellow;
  if (v <= 75) return HEAT.green;
  return HEAT.cyan;
}

export function getHeatmapGlow(value: number, scale: HeatmapScale = "standard"): string {
  return hexToRgba(getHeatmapColor(value, scale), 0.5);
}

export function heatTextStyle(
  value: number,
  scale: HeatmapScale = "standard",
): { color: string; textShadow: string } {
  const hex = getHeatmapColor(value, scale);
  return {
    color: hex,
    textShadow: `0 0 8px ${hexToRgba(hex, 0.72)}, 0 0 2px ${hex}`,
  };
}

export function heatFillStyle(
  value: number,
  scale: HeatmapScale = "standard",
): { background: string; boxShadow: string } {
  const hex = getHeatmapColor(value, scale);
  return {
    background: `linear-gradient(90deg, ${hexToRgba(hex, 0.45)}, ${hex})`,
    boxShadow: `0 0 10px ${hex}`,
  };
}

export const RSI_INVERSE_GRADIENT =
  "linear-gradient(90deg, #00FFA3 0%, #00FFA3 30%, #00FFFF 45%, #FFD700 60%, #FF9900 75%, #FF2A6D 100%)";
