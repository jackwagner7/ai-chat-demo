import type { CardLayout } from "@/types";

export const UI_SCALE = 0.8;

export const scaleValue = (value: number): number => Math.round(value * UI_SCALE);

export const SCALED_CARD_POSITION = {
  x: scaleValue(240),
  y: scaleValue(180),
};

export const SCALED_CARD_GAPS = {
  horizontal: scaleValue(40),
  vertical: scaleValue(40),
};

export const SCALED_CARD_SIZES = {
  measure: { width: scaleValue(320), height: scaleValue(220) },
  chart: { width: scaleValue(420), height: scaleValue(320) },
} as const;

export const SCALED_CARD_MIN = {
  measure: { width: scaleValue(200), height: scaleValue(120) },
  chart: { width: scaleValue(320), height: scaleValue(220) },
} as const;

export const SCALED_SETTINGS_WIDTH = scaleValue(320);
export const SCALED_SETTINGS_MARGIN = scaleValue(16);

export const scaleLayout = (layout: CardLayout | undefined | null): CardLayout | undefined => {
  if (!layout) return layout ?? undefined;
  return {
    x: scaleValue(layout.x),
    y: scaleValue(layout.y),
    width: scaleValue(layout.width),
    height: scaleValue(layout.height),
  };
};
