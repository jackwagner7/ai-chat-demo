export type Msg = { role: string; content: string };

export type Measure = {
  id: string;
  title: string;
  value: string | number;
  code?: string;

  // Colors (raw hex or via theme reference)
  titleColor?: string;
  color?: string;
  bgColor?: string;

  titleColorRef?: number; // 0-based index into themeColors
  colorRef?: number;
  bgColorRef?: number;

  // Typography
  titleSize?: number; // in rem
  fontSize?: number;  // in rem

  // Alignment
  titleAlign?: "left" | "center" | "right";
  measureAlignX?: "left" | "center" | "right";
  measureAlignY?: "top" | "center" | "bottom";
};


export interface Chart {
  id: string;
  title: string;
  type: string;
  color?: string;
  xKey?: string;
  series: string[];
  seriesColors?: string[];
  seriesColorRefs?: number[];        // 🆕 theme index references
  seriesDisplayNames?: string[];     // 🆕 editable legend names
  data: Record<string, any>[];
  code: string;

  // Existing fields
  titleSize?: number;
  titleColor?: string;
  titleColorRef?: number;
  bgColor?: string;
  bgColorRef?: number;

  // Axis
  xLabel?: string;
  yLabel?: string;
  axisTitleSize?: number;
  axisTitleColor?: string;
  axisTitleColorRef?: number;

  // Tick labels
  labelSize?: number;
  labelColor?: string;
  labelColorRef?: number;

  // Legend
  legendSize?: number;

  // Internals
  _titleHeight?: number;
  titleAlign?: "left" | "center" | "right"; // ✅ add this

  barLayout?: "stacked" | "grouped"; // 🆕

}

// Re-export unified Card types
export * from "./cards";
