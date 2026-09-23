import { describe, expect, it } from "vitest";
import { HEAT, getHeatmapColor } from "@/lib/dca/heatmap";

describe("heatmap scales (visual only)", () => {
  it("standard: higher is greener / more euphoric", () => {
    expect(getHeatmapColor(12, "standard")).toBe(HEAT.blood);
    expect(getHeatmapColor(40, "standard")).toBe(HEAT.bear);
    expect(getHeatmapColor(52, "standard")).toBe(HEAT.yellow);
    expect(getHeatmapColor(70, "standard")).toBe(HEAT.green);
    expect(getHeatmapColor(88, "standard")).toBe(HEAT.cyan);
  });

  it("inverse: low RSI is discount green, high RSI is risk red", () => {
    expect(getHeatmapColor(18, "inverse")).toBe(HEAT.green);
    expect(getHeatmapColor(40, "inverse")).toBe(HEAT.cyan);
    expect(getHeatmapColor(52, "inverse")).toBe(HEAT.yellow);
    expect(getHeatmapColor(70, "inverse")).toBe(HEAT.bear);
    expect(getHeatmapColor(88, "inverse")).toBe(HEAT.blood);
  });
});
