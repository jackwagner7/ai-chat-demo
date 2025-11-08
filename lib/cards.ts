import type { Measure, Chart } from "@/types";
import type {
  Card,
  MeasureCard,
  ChartCard,
  CardsReport,
} from "@/types";
import { SCALED_CARD_SIZES } from "./uiScale";

const CARDS_REPORT_VERSION = "cards-v2";
const SUPPORTED_CARDS_REPORT_VERSIONS = new Set<CardsReport["version"]>([
  "cards-v1",
  CARDS_REPORT_VERSION,
]);

// Mapping helpers: legacy Measure/Chart -> unified Cards

export function measureToCard(m: Measure): MeasureCard {
  return {
    id: m.id,
    kind: "measure",
    data: {
      value: m.value,
    },
    layout: {
      x: 0,
      y: 0,
      width: SCALED_CARD_SIZES.measure.width,
      height: SCALED_CARD_SIZES.measure.height,
    },
    settings: {
      titleBackground: {
        title: m.title,
        titleSize: m.titleSize,
        titleAlign: m.titleAlign,
        titleColor: m.titleColor,
        titleColorRef: m.titleColorRef,
        bgColor: m.bgColor,
        bgColorRef: m.bgColorRef,
      },
      measureAppearance: {
        fontSize: m.fontSize,
        measureAlignX: m.measureAlignX,
        measureAlignY: m.measureAlignY,
        color: m.color,
        colorRef: m.colorRef,
      },
      sql: {
        code: m.code,
      },
    },
  };
}

export function chartToCard(c: Chart): ChartCard {
  return {
    id: c.id,
    kind: "chart",
    data: {
      rows: c.data,
      xKey: c.xKey,
      series: c.series,
    },
    layout: {
      x: 0,
      y: 0,
      width: SCALED_CARD_SIZES.chart.width,
      height: SCALED_CARD_SIZES.chart.height,
    },
    settings: {
      titleBackground: {
        title: c.title,
        titleSize: c.titleSize,
        titleAlign: c.titleAlign,
        titleColor: c.titleColor,
        titleColorRef: c.titleColorRef,
        bgColor: c.bgColor,
        bgColorRef: c.bgColorRef,
      },
      graph: {
        chartType: c.type,
        barLayout: c.barLayout,
      },
      axes: {
        xLabel: c.xLabel,
        yLabel: c.yLabel,
        axisTitleSize: c.axisTitleSize,
        axisTitleColor: c.axisTitleColor,
        axisTitleColorRef: c.axisTitleColorRef,
        labelSize: c.labelSize,
        labelColor: c.labelColor,
        labelColorRef: c.labelColorRef,
      },
      legend: {
        legendSize: c.legendSize,
        seriesDisplayNames: c.seriesDisplayNames,
        seriesColorRefs: c.seriesColorRefs,
        seriesColors: c.seriesColors,
      },
      sql: {
        code: c.code,
      },
    },
  };
}

// Report (serialize/deserialize)

export function serializeReport(
  cards: Card[],
  themeColors: string[],
  backgroundColor?: string,
): CardsReport {
  return {
    version: CARDS_REPORT_VERSION,
    themeColors,
    backgroundColor,
    cards,
  };
}

export function deserializeReport(
  report: CardsReport,
): { cards: Card[]; themeColors: string[]; backgroundColor?: string } {
  if (!report || !SUPPORTED_CARDS_REPORT_VERSIONS.has(report.version)) {
    throw new Error("Unsupported report version");
  }
  return {
    cards: report.cards || [],
    themeColors: report.themeColors || [],
    backgroundColor: report.backgroundColor,
  };
}
