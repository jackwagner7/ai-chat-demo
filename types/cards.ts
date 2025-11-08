// Unified Card model and report schema

export type CardKind = "measure" | "chart";

export type AlignX = "left" | "center" | "right";
export type AlignY = "top" | "center" | "bottom";

export interface CardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TitleBackgroundSettings {
  title: string;
  titleSize?: number;
  titleAlign?: AlignX;
  titleColor?: string;
  titleColorRef?: number;
  bgColor?: string;
  bgColorRef?: number;
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
}

export interface MeasureAppearanceSettings {
  fontSize?: number;
  measureAlignX?: AlignX;
  measureAlignY?: AlignY;
  color?: string;
  colorRef?: number;
}

export interface SqlSettings {
  code?: string;
}

export interface GraphSettings {
  chartType: string; // normalized: "line" | "bar" | "stackedbar" | "pie" | ...
  barLayout?: "stacked" | "grouped";
}

export interface AxesSettings {
  xLabel?: string;
  yLabel?: string;
  axisTitleSize?: number;
  axisTitleColor?: string;
  axisTitleColorRef?: number;
  labelSize?: number;
  labelColor?: string;
  labelColorRef?: number;
}

export interface LegendSettings {
  legendSize?: number;
  seriesDisplayNames?: string[];
  seriesColorRefs?: Array<number | undefined>;
  seriesColors?: Array<string | undefined>;
  segmentColorRefs?: Record<string, number | undefined>;
  segmentColors?: Record<string, string | undefined>;
  segmentColorEnabled?: boolean;
}

export interface MeasureCard {
  id: string;
  kind: "measure";
  data: {
    value: string | number;
  };
  settings: {
    titleBackground: TitleBackgroundSettings;
    measureAppearance: MeasureAppearanceSettings;
    sql: SqlSettings;
  };
  layout: CardLayout;
  sourceTables?: string[];
  ui?: {
    settingsOpen?: Record<string, boolean>;
  };
}

export interface ChartCard {
  id: string;
  kind: "chart";
  data: {
    rows: Record<string, unknown>[];
    xKey?: string;
    series: string[];
  };
  settings: {
    titleBackground: TitleBackgroundSettings;
    graph: GraphSettings;
    axes: AxesSettings;
    legend: LegendSettings;
    sql: SqlSettings;
  };
  layout: CardLayout;
  sourceTables?: string[];
  ui?: {
    settingsOpen?: Record<string, boolean>;
  };
}

export type Card = MeasureCard | ChartCard;

export interface StoredDataset {
  tableId: string;
  displayName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  expanded?: boolean;
  sourceFilename?: string;
}

export interface UploadedTableInfo {
  tableId: string;
  displayName: string;
  columns: string[];
  sourceFilename?: string;
}

export interface PreviewState {
  columns: string[];
  rows: Record<string, unknown>[];
  tableId?: string;
  sourceFilename?: string;
}

export interface CardsReport {
  version: "cards-v1" | "cards-v2";
  themeColors: string[];
  backgroundColor?: string;
  cards: Card[];
  uploadedTables?: UploadedTableInfo[];
  datasets?: StoredDataset[];
  preview?: PreviewState;
  schema?: string;
}
