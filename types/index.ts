export type Msg = { role: string; content: string };

export interface Measure {
  title: string;
  value: string;
  code: string;
}

export interface Chart {
  title: string;
  type: string;
  color: string;
  series: string[];
  seriesColors: string[];
  data: Record<string, unknown>[];
  code: string;
  xKey?: string;
}
