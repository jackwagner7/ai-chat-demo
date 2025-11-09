import type {
  Card,
  CardLayout,
  TitleBackgroundSettings,
  MeasureAppearanceSettings,
  GraphSettings,
  AxesSettings,
  LegendSettings,
} from "@/types";

export type CardPatchDelta = {
  layout?: CardLayout;
  titleBackground?: TitleBackgroundSettings;
  measureAppearance?: MeasureAppearanceSettings;
  graph?: GraphSettings;
  axes?: AxesSettings;
  legend?: LegendSettings;
};

export type CardPatch = {
  cardId: string;
  before: CardPatchDelta;
  after: CardPatchDelta;
};

const clone = <T,>(value: T | undefined): T | undefined =>
  value === undefined ? undefined : (structuredClone ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T));

const applyDelta = (card: Card, delta: CardPatchDelta): Card => {
  const next = { ...card };
  if (delta.layout) {
    next.layout = clone(delta.layout);
  }
  if (delta.titleBackground) {
    next.settings = {
      ...next.settings,
      titleBackground: clone(delta.titleBackground) ?? next.settings.titleBackground,
    };
  }
  if (card.kind === "measure") {
    if (delta.measureAppearance) {
      next.settings = {
        ...next.settings,
        measureAppearance: clone(delta.measureAppearance) ?? next.settings.measureAppearance,
      };
    }
  } else {
    if (delta.graph) {
      next.settings = {
        ...next.settings,
        graph: clone(delta.graph) ?? next.settings.graph,
      };
    }
    if (delta.axes) {
      next.settings = {
        ...next.settings,
        axes: clone(delta.axes) ?? next.settings.axes,
      };
    }
    if (delta.legend) {
      next.settings = {
        ...next.settings,
        legend: clone(delta.legend) ?? next.settings.legend,
      };
    }
  }
  return next;
};

export const applyCardPatch = (
  cards: Card[],
  patch: CardPatch,
  mode: "before" | "after",
): Card[] =>
  cards.map((card) => {
    if (card.id !== patch.cardId) return card;
    const target = mode === "before" ? patch.before : patch.after;
    return applyDelta(card, target);
  });

export const createLayoutPatch = (
  card: Card,
  beforeLayout: CardLayout | undefined,
  afterLayout: CardLayout,
): CardPatch | null => {
  const before = beforeLayout ?? card.layout;
  if (
    before &&
    before.x === afterLayout.x &&
    before.y === afterLayout.y &&
    before.width === afterLayout.width &&
    before.height === afterLayout.height
  ) {
    return null;
  }
  return {
    cardId: card.id,
    before: { layout: before ? clone(before) : undefined },
    after: { layout: clone(afterLayout) },
  };
};

const deepEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export const createSettingsPatch = (beforeCard: Card, afterCard: Card): CardPatch | null => {
  const beforeDelta: CardPatchDelta = {};
  const afterDelta: CardPatchDelta = {};
  let changed = false;

  if (!deepEqual(beforeCard.settings.titleBackground, afterCard.settings.titleBackground)) {
    beforeDelta.titleBackground = clone(beforeCard.settings.titleBackground);
    afterDelta.titleBackground = clone(afterCard.settings.titleBackground);
    changed = true;
  }

  if (beforeCard.kind === "measure" && afterCard.kind === "measure") {
    if (!deepEqual(beforeCard.settings.measureAppearance, afterCard.settings.measureAppearance)) {
      beforeDelta.measureAppearance = clone(beforeCard.settings.measureAppearance);
      afterDelta.measureAppearance = clone(afterCard.settings.measureAppearance);
      changed = true;
    }
  } else if (beforeCard.kind === "chart" && afterCard.kind === "chart") {
    if (!deepEqual(beforeCard.settings.graph, afterCard.settings.graph)) {
      beforeDelta.graph = clone(beforeCard.settings.graph);
      afterDelta.graph = clone(afterCard.settings.graph);
      changed = true;
    }
    if (!deepEqual(beforeCard.settings.axes, afterCard.settings.axes)) {
      beforeDelta.axes = clone(beforeCard.settings.axes);
      afterDelta.axes = clone(afterCard.settings.axes);
      changed = true;
    }
    if (!deepEqual(beforeCard.settings.legend, afterCard.settings.legend)) {
      beforeDelta.legend = clone(beforeCard.settings.legend);
      afterDelta.legend = clone(afterCard.settings.legend);
      changed = true;
    }
  }

  if (!changed) return null;

  return {
    cardId: beforeCard.id,
    before: beforeDelta,
    after: afterDelta,
  };
};
