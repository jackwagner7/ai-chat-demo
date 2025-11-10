import type {
  Card,
  CardLayout,
  TitleBackgroundSettings,
  MeasureAppearanceSettings,
  GraphSettings,
  AxesSettings,
  LegendSettings,
  MeasureCard,
  ChartCard,
  SqlSettings,
} from "@/types";

export type CardPatchDelta = {
  layout?: CardLayout;
  titleBackground?: TitleBackgroundSettings;
  measureAppearance?: MeasureAppearanceSettings;
  graph?: GraphSettings;
  axes?: AxesSettings;
  legend?: LegendSettings;
  sql?: SqlSettings;
};

export type CardPatch = {
  cardId: string;
  before: CardPatchDelta;
  after: CardPatchDelta;
};

function clone<T>(value: T): T;
function clone<T>(value: T | undefined): T | undefined;
function clone<T>(value: T | undefined): T | undefined {
  if (value === undefined) return undefined;
  return structuredClone ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}

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
    let measureSettings = next.settings as MeasureCard["settings"];
    if (delta.measureAppearance) {
      measureSettings = {
        ...measureSettings,
        measureAppearance: clone(delta.measureAppearance) ?? measureSettings.measureAppearance,
      };
    }
    next.settings = measureSettings;
  } else {
    let chartSettings = next.settings as ChartCard["settings"];
    if (delta.graph) {
      chartSettings = {
        ...chartSettings,
        graph: clone(delta.graph) ?? chartSettings.graph,
      };
    }
    if (delta.axes) {
      chartSettings = {
        ...chartSettings,
        axes: clone(delta.axes) ?? chartSettings.axes,
      };
    }
    if (delta.legend) {
      chartSettings = {
        ...chartSettings,
        legend: clone(delta.legend) ?? chartSettings.legend,
      };
    }
    next.settings = chartSettings;
  }
  if (delta.sql) {
    next.settings = {
      ...next.settings,
      sql: clone(delta.sql) ?? next.settings.sql,
    };
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

  if (!deepEqual(beforeCard.settings.sql, afterCard.settings.sql)) {
    beforeDelta.sql = clone(beforeCard.settings.sql);
    afterDelta.sql = clone(afterCard.settings.sql);
    changed = true;
  }

  if (!changed) return null;

  return {
    cardId: beforeCard.id,
    before: beforeDelta,
    after: afterDelta,
  };
};
