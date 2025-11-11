import { generatePalette } from "@/lib/chartHelpers";
import type { ChartCard } from "@/types";

export function ensureSeriesDisplayNames(target: ChartCard, series: string[]) {
  const legend = target.settings.legend;
  const existing = legend.seriesDisplayNames || [];
  if (existing.length === series.length) return;
  const next = series.map((_, idx) => existing[idx] ?? "");
  legend.seriesDisplayNames = next;
}

export function ensureSegmentColors(
  target: ChartCard,
  categories: string[],
  themePalette: string[],
  avoidColors: string[],
) {
  const avoidSet = new Set(
    avoidColors
      .filter((color) => Boolean(color))
      .map((color) => color.toLowerCase()),
  );
  const legend = target.settings.legend;
  legend.segmentColorRefs = legend.segmentColorRefs || {};
  legend.segmentColors = legend.segmentColors || {};
  const refs = legend.segmentColorRefs;
  const colors = legend.segmentColors;

  Object.keys(refs).forEach((key) => {
    const idx = refs[key];
    const keep =
      categories.includes(key) &&
      typeof idx === "number" &&
      idx >= 0 &&
      idx < themePalette.length &&
      !avoidSet.has((themePalette[idx] || "").toLowerCase());
    if (!keep) {
      delete refs[key];
    }
  });

  Object.keys(colors).forEach((key) => {
    const color = colors[key];
    const keep =
      categories.includes(key) &&
      color &&
      !avoidSet.has(color.toLowerCase());
    if (!keep) {
      delete colors[key];
    }
  });

  const usedThemeIndices = new Set<number>(
    Object.values(refs).filter((value): value is number => typeof value === "number"),
  );

  const themeCandidates = themePalette
    .map((color, idx) => ({ color, idx }))
    .filter(
      ({ color }) => color && !avoidSet.has(color.toLowerCase()),
    );

  const fallbackPalette = generatePalette(Math.max(categories.length, 1));
  let fallbackPtr = 0;

  categories.forEach((key) => {
    if (refs[key] !== undefined || colors[key]) return;

    const themeOption = themeCandidates.find(({ idx }) => !usedThemeIndices.has(idx));
    if (themeOption) {
      refs[key] = themeOption.idx;
      delete colors[key];
      usedThemeIndices.add(themeOption.idx);
      return;
    }

    let color = fallbackPalette[fallbackPtr % fallbackPalette.length];
    let guard = 0;
    while (avoidSet.has(color.toLowerCase()) && guard < fallbackPalette.length) {
      fallbackPtr += 1;
      color = fallbackPalette[fallbackPtr % fallbackPalette.length];
      guard += 1;
    }
    fallbackPtr += 1;
    colors[key] = color;
  });
}
