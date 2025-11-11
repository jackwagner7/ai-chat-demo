import type { CardKind } from "@/types";

export type CardSettingsSectionKey = "title" | "measure" | "graph" | "axes" | "legend";

export const CARD_SETTINGS_LAYOUT: Record<Extract<CardKind, "measure" | "chart">, CardSettingsSectionKey[]> = {
  measure: ["title", "measure"],
  chart: ["title", "graph", "axes", "legend"],
};

export const CARD_SETTINGS_LABELS: Record<CardSettingsSectionKey, string> = {
  title: "Title and Background",
  measure: "Measure Appearance",
  graph: "Graph",
  axes: "Axes",
  legend: "Legend & Series",
};
