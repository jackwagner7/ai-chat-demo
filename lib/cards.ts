import type { Measure, Chart } from "@/types";
import type {
  Card,
  MeasureCard,
  ChartCard,
  CardsReport,
} from "@/types";

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
      width: 320,
      height: 220,
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
      width: 420,
      height: 320,
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

export function serializeReport(cards: Card[], themeColors: string[]): CardsReport {
  return {
    version: "cards-v1",
    themeColors,
    cards,
  };
}

export function deserializeReport(report: CardsReport): { cards: Card[]; themeColors: string[] } {
  if (!report || report.version !== "cards-v1") {
    throw new Error("Unsupported report version");
  }
  return {
    cards: report.cards || [],
    themeColors: report.themeColors || [],
  };
}
