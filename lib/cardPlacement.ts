import type { Card } from "@/types";
import type { BoardState } from "@/hooks/useBoardViewport";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@/hooks/useBoardViewport";
import { SCALED_CARD_SIZES } from "@/lib/uiScale";

export type Rect = { x: number; y: number; width: number; height: number };

export const CARD_PLACEMENT_GAP = 48;

const getCardRect = (card: Card): Rect => {
  const layout = card.layout ?? {
    x: 0,
    y: 0,
    width: card.kind === "measure" ? SCALED_CARD_SIZES.measure.width : SCALED_CARD_SIZES.chart.width,
    height: card.kind === "measure" ? SCALED_CARD_SIZES.measure.height : SCALED_CARD_SIZES.chart.height,
  };
  return { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
};

const normalizeChartFamily = (chartType?: string) => {
  if (!chartType) return undefined;
  return chartType === "stackedbar" ? "bar" : chartType;
};

const rectanglesOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const isRectFree = (rect: Rect, cards: Card[]) =>
  cards.every((card) => !rectanglesOverlap(rect, getCardRect(card)));

const isWithinViewport = (rect: Rect, viewport?: Rect | null) => {
  if (!viewport) return true;
  return (
    rect.x >= viewport.x &&
    rect.y >= viewport.y &&
    rect.x + rect.width <= viewport.x + viewport.width &&
    rect.y + rect.height <= viewport.y + viewport.height
  );
};

export const getViewportBoardRect = (
  viewport: HTMLDivElement | null,
  state: BoardState,
): Rect | null => {
  if (!viewport) return null;
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  const left = (-state.x) / state.scale;
  const top = (-state.y) / state.scale;
  return {
    x: left,
    y: top,
    width: width / state.scale,
    height: height / state.scale,
  };
};

const directionOffsets: Record<
  "right" | "down" | "left" | "up",
  (ref: Rect, width: number, height: number) => Rect
> = {
  right: (ref, width, height) => ({
    x: ref.x + ref.width + CARD_PLACEMENT_GAP,
    y: ref.y,
    width,
    height,
  }),
  down: (ref, width, height) => ({
    x: ref.x,
    y: ref.y + ref.height + CARD_PLACEMENT_GAP,
    width,
    height,
  }),
  left: (ref, width, height) => ({
    x: ref.x - width - CARD_PLACEMENT_GAP,
    y: ref.y,
    width,
    height,
  }),
  up: (ref, width, height) => ({
    x: ref.x,
    y: ref.y - height - CARD_PLACEMENT_GAP,
    width,
    height,
  }),
};

const tryDirections = (
  reference: Rect,
  order: Array<"right" | "down" | "left" | "up">,
  size: { width: number; height: number },
  cards: Card[],
  viewportRect: Rect | null,
) => {
  for (const dir of order) {
    const rect = directionOffsets[dir](reference, size.width, size.height);
    if (isRectFree(rect, cards) && isWithinViewport(rect, viewportRect)) {
      return rect;
    }
  }
  return null;
};

const computeFallbackPlacement = (
  size: { width: number; height: number },
  cards: Card[],
  viewportRect: Rect | null,
) => {
  const baseX = (viewportRect?.x ?? 0) + CARD_PLACEMENT_GAP;
  const baseY = (viewportRect?.y ?? 0) + CARD_PLACEMENT_GAP;
  const maxRows = 6;
  const maxCols = 6;
  for (let row = 0; row < maxRows; row += 1) {
    for (let col = 0; col < maxCols; col += 1) {
      const rect: Rect = {
        x: baseX + col * (size.width + CARD_PLACEMENT_GAP),
        y: baseY + row * (size.height + CARD_PLACEMENT_GAP),
        width: size.width,
        height: size.height,
      };
      if (isRectFree(rect, cards) && isWithinViewport(rect, viewportRect)) {
        return rect;
      }
    }
  }
  return { x: baseX, y: baseY, width: size.width, height: size.height };
};

const computeFirstCardPlacement = (
  size: { width: number; height: number },
  viewportRect: Rect | null,
) => {
  const boundary = viewportRect ?? { x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT };
  const x =
    boundary.x +
    Math.max(
      CARD_PLACEMENT_GAP,
      boundary.width * 0.25 - size.width / 2,
    );
  const y = boundary.y + CARD_PLACEMENT_GAP;
  return { x, y, width: size.width, height: size.height };
};

export const computeCardPlacement = (
  card: Card,
  cards: Card[],
  viewportRect: Rect | null,
) => {
  const layout = card.layout ?? getCardRect(card);
  const size = { width: layout.width, height: layout.height };

  if (!cards.length) {
    return computeFirstCardPlacement(size, viewportRect);
  }

  const reversed = [...cards].reverse();
  const cardFamily =
    card.kind === "chart" ? normalizeChartFamily(card.settings.graph.chartType) : undefined;

  const referenceCard =
    card.kind === "measure"
      ? reversed.find((entry) => entry.kind === "measure") ?? reversed[0]
      : reversed.find(
          (entry) =>
            entry.kind === "chart" &&
            normalizeChartFamily(entry.settings.graph.chartType) === cardFamily,
        ) ?? reversed[0];
  const referenceFamily =
    referenceCard.kind === "chart"
      ? normalizeChartFamily(referenceCard.settings.graph.chartType)
      : undefined;
  const directionOrder =
    card.kind === referenceCard.kind &&
    (card.kind !== "chart" || referenceFamily === cardFamily)
      ? (["right", "down", "left", "up"] as const)
      : (["down", "left", "up", "right"] as const);

  const referenceRect = getCardRect(referenceCard);
  const placement =
    tryDirections(referenceRect, [...directionOrder], size, cards, viewportRect) ??
    computeFallbackPlacement(size, cards, viewportRect);
  return placement;
};
