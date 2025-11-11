import type { PatchBlock } from "@/lib/aiHelpers";
import {
  SCALED_CARD_GAPS,
  SCALED_CARD_MIN,
  SCALED_CARD_POSITION,
  SCALED_CARD_SIZES,
  scaleLayout,
} from "@/lib/uiScale";
import type { Card, CardKind, CardLayout } from "@/types";

const CARD_GRID_COLUMNS = 3;
const CARD_HORIZONTAL_GAP = SCALED_CARD_GAPS.horizontal;
const CARD_VERTICAL_GAP = SCALED_CARD_GAPS.vertical;

const DEFAULT_CARD_SIZES: Record<CardKind, { width: number; height: number }> = SCALED_CARD_SIZES;
const DEFAULT_CARD_POSITION = SCALED_CARD_POSITION;
const DEFAULT_COLUMN_WIDTH = DEFAULT_CARD_SIZES.chart.width + CARD_HORIZONTAL_GAP;
const DEFAULT_ROW_HEIGHT = DEFAULT_CARD_SIZES.chart.height + CARD_VERTICAL_GAP;

const cloneCard = (card: Card): Card =>
  typeof structuredClone === "function"
    ? structuredClone(card)
    : (JSON.parse(JSON.stringify(card)) as Card);

export function computeInitialLayout(kind: CardKind, index: number): CardLayout {
  const column = index % CARD_GRID_COLUMNS;
  const row = Math.floor(index / CARD_GRID_COLUMNS);

  const basePosition = {
    x: DEFAULT_CARD_POSITION.x + column * DEFAULT_COLUMN_WIDTH,
    y: DEFAULT_CARD_POSITION.y + row * DEFAULT_ROW_HEIGHT,
  };

  const size = DEFAULT_CARD_SIZES[kind];
  return {
    x: basePosition.x,
    y: basePosition.y,
    width: size.width,
    height: size.height,
  };
}

export function ensureCardLayout(
  card: Card,
  index: number,
  options?: { forceScale?: boolean },
): Card {
  const fallback = computeInitialLayout(card.kind, index);
  const sizeDefaults = DEFAULT_CARD_SIZES[card.kind];
  const minSize = card.kind === "measure" ? SCALED_CARD_MIN.measure : SCALED_CARD_MIN.chart;
  const scaledLayout = card.layout && options?.forceScale ? scaleLayout(card.layout) : card.layout;
  const base = scaledLayout ?? fallback;

  const toNumber = (value: unknown, fallbackValue: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallbackValue;

  const width = Math.max(toNumber(base.width, sizeDefaults.width), minSize.width);
  const height = Math.max(toNumber(base.height, sizeDefaults.height), minSize.height);
  const x = toNumber(base.x, fallback.x);
  const y = toNumber(base.y, fallback.y);

  return {
    ...card,
    layout: { x, y, width, height },
  } as Card;
}

export const applyPatchInstructionToCard = (
  card: Card,
  instruction: PatchBlock,
): Card | null => {
  let changed = false;
  const draft = cloneCard(card);

  if (instruction.layout) {
    draft.layout = { ...draft.layout, ...instruction.layout };
    changed = true;
  }

  if (instruction.titleBackground) {
    draft.settings.titleBackground = {
      ...draft.settings.titleBackground,
      ...instruction.titleBackground,
    };
    changed = true;
  }

  if (instruction.measureAppearance && draft.kind === "measure") {
    draft.settings.measureAppearance = {
      ...draft.settings.measureAppearance,
      ...instruction.measureAppearance,
    };
    changed = true;
  }

  if (draft.kind === "chart") {
    if (instruction.graph) {
      draft.settings.graph = {
        ...draft.settings.graph,
        ...instruction.graph,
      };
      changed = true;
    }

    if (instruction.axes) {
      draft.settings.axes = {
        ...draft.settings.axes,
        ...instruction.axes,
      };
      changed = true;
    }

    if (instruction.legend) {
      draft.settings.legend = {
        ...draft.settings.legend,
        ...instruction.legend,
      };
      changed = true;
    }
  }

  if (instruction.sql) {
    draft.settings.sql = {
      ...draft.settings.sql,
      ...instruction.sql,
    };
    changed = true;
  }

  return changed ? draft : null;
};
