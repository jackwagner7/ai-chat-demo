import type {
  Card,
  CardKind,
  TitleBackgroundSettings,
  MeasureAppearanceSettings,
  GraphSettings,
  AxesSettings,
  LegendSettings,
} from "@/types";
import {
  SCALED_CARD_POSITION,
  SCALED_CARD_SIZES,
} from "@/lib/uiScale";

export type FormattingSnapshot = {
  kind: CardKind;
  titleBackground: TitleBackgroundSettings;
  layoutSize: { width: number; height: number };
  measureAppearance?: MeasureAppearanceSettings;
  chart?: {
    graph: GraphSettings;
    axes: AxesSettings;
    legend: LegendSettings;
  };
};

export type FormatClipboard = {
  sourceCardId: string;
  snapshot: FormattingSnapshot;
};

const deepClone = <T,>(value: T): T =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

const ensureLayoutShape = (card: Card): Card["layout"] => {
  if (card.layout) return { ...card.layout };
  return {
    x: SCALED_CARD_POSITION.x,
    y: SCALED_CARD_POSITION.y,
    width: card.kind === "measure" ? SCALED_CARD_SIZES.measure.width : SCALED_CARD_SIZES.chart.width,
    height: card.kind === "measure" ? SCALED_CARD_SIZES.measure.height : SCALED_CARD_SIZES.chart.height,
  };
};

export function buildFormattingSnapshot(card: Card): FormattingSnapshot {
  const layout = ensureLayoutShape(card);
  const snapshot: FormattingSnapshot = {
    kind: card.kind,
    titleBackground: deepClone(card.settings.titleBackground),
    layoutSize: { width: layout.width, height: layout.height },
  };
  if (card.kind === "measure") {
    snapshot.measureAppearance = deepClone(card.settings.measureAppearance);
  } else {
    snapshot.chart = {
      graph: deepClone(card.settings.graph),
      axes: deepClone(card.settings.axes),
      legend: deepClone(card.settings.legend),
    };
  }
  return snapshot;
}

type ColorInfo = { color?: string; colorRef?: number };

const extractMeasureColor = (
  appearance?: MeasureAppearanceSettings,
): ColorInfo | undefined => {
  if (!appearance) return undefined;
  if (appearance.colorRef !== undefined) return { colorRef: appearance.colorRef };
  if (appearance.color) return { color: appearance.color };
  return undefined;
};

const extractLegendColor = (legend?: LegendSettings): ColorInfo | undefined => {
  if (!legend) return undefined;
  const ref =
    legend.seriesColorRefs?.find(
      (value): value is number => value !== undefined,
    ) ??
    (legend.segmentColorRefs &&
      Object.values(legend.segmentColorRefs).find(
        (value): value is number => value !== undefined,
      ));
  if (ref !== undefined) return { colorRef: ref };
  const color =
    legend.seriesColors?.find((value): value is string => Boolean(value)) ??
    (legend.segmentColors &&
      Object.values(legend.segmentColors).find((value): value is string => Boolean(value)));
  if (color) return { color };
  return undefined;
};

const applyColorToLegend = (
  legend: LegendSettings | undefined,
  info: ColorInfo,
  seriesCount: number,
) => {
  if (!legend || seriesCount <= 0) return;
  if (info.colorRef !== undefined) {
    legend.seriesColorRefs = Array(seriesCount).fill(info.colorRef);
    legend.seriesColors = Array(seriesCount).fill(undefined);
  } else if (info.color) {
    legend.seriesColorRefs = Array(seriesCount).fill(undefined);
    legend.seriesColors = Array(seriesCount).fill(info.color);
  }
};

const applyColorToMeasure = (
  appearance: MeasureAppearanceSettings,
  info: ColorInfo,
) => {
  if (info.colorRef !== undefined) {
    appearance.colorRef = info.colorRef;
    appearance.color = undefined;
  } else if (info.color) {
    appearance.color = info.color;
    appearance.colorRef = undefined;
  }
};

const resizeSeriesArray = <T,>(
  source: Array<T | undefined> | undefined,
  length: number,
): Array<T | undefined> => {
  const result: Array<T | undefined> = [];
  for (let i = 0; i < length; i += 1) {
    result.push(source?.[i]);
  }
  return result;
};

const alignLegendSeries = (legend: LegendSettings, seriesCount: number) => {
  if (!legend || seriesCount < 0) return;
  if (seriesCount === 0) {
    legend.seriesColorRefs = [];
    legend.seriesColors = [];
    legend.seriesDisplayNames = [];
    return;
  }
  if (legend.seriesColorRefs) {
    legend.seriesColorRefs = resizeSeriesArray(legend.seriesColorRefs, seriesCount);
  }
  if (legend.seriesColors) {
    legend.seriesColors = resizeSeriesArray(legend.seriesColors, seriesCount);
  }
  if (legend.seriesDisplayNames) {
    legend.seriesDisplayNames = Array.from(
      { length: seriesCount },
      (_, idx) => legend.seriesDisplayNames?.[idx] ?? "",
    );
  }
};

export function applyFormattingSnapshot(
  target: Card,
  snapshot: FormattingSnapshot,
  options?: { preserveGraphType?: boolean },
): Card {
  const preserveGraphType = options?.preserveGraphType ?? false;
  const next = deepClone(target);

  next.settings.titleBackground = {
    ...deepClone(snapshot.titleBackground),
    title: next.settings.titleBackground.title,
  };

  if (next.kind === "measure") {
    if (snapshot.measureAppearance) {
      next.settings.measureAppearance = deepClone(snapshot.measureAppearance);
    } else if (snapshot.chart?.legend) {
      const info = extractLegendColor(snapshot.chart.legend);
      if (info) {
        next.settings.measureAppearance = next.settings.measureAppearance ?? {};
        applyColorToMeasure(next.settings.measureAppearance, info);
      }
    }
  } else {
    if (snapshot.chart) {
      const originalChartType = next.settings.graph.chartType;
      const originalBarLayout = next.settings.graph.barLayout;
      next.settings.graph = deepClone(snapshot.chart.graph);
      if (preserveGraphType) {
        next.settings.graph.chartType = originalChartType;
        if (originalChartType === "bar") {
          next.settings.graph.barLayout =
            originalBarLayout ?? next.settings.graph.barLayout ?? "grouped";
        } else if ("barLayout" in next.settings.graph) {
          delete (next.settings.graph as Partial<GraphSettings>).barLayout;
        }
      }
      next.settings.axes = deepClone(snapshot.chart.axes);
      const legend = deepClone(snapshot.chart.legend);
      alignLegendSeries(legend, next.data.series.length);
      next.settings.legend = legend;
    } else if (snapshot.measureAppearance) {
      const info = extractMeasureColor(snapshot.measureAppearance);
      if (info) {
        next.settings.legend = next.settings.legend ?? {};
        applyColorToLegend(next.settings.legend, info, next.data.series.length);
      }
    }
  }

  if (snapshot.kind === next.kind) {
    const layout = ensureLayoutShape(next);
    next.layout = {
      ...layout,
      width: snapshot.layoutSize.width,
      height: snapshot.layoutSize.height,
    };
  }

  return next;
}
