"use client";
import styles from "../CardSettings.module.css";
import type { Card } from "@/types";

type ChartCard = Extract<Card, { kind: "chart" }>;

type Props = {
  card: ChartCard;
  onUpdate: (updater: (draft: ChartCard) => void) => void;
  normalizedChartType: "line" | "bar" | "pie";
  canUsePie: boolean;
  chartSeriesCount: number;
  currentBarLayout: "grouped" | "stacked";
};

export default function GraphSection({
  card,
  onUpdate,
  normalizedChartType,
  canUsePie,
  chartSeriesCount,
  currentBarLayout,
}: Props) {
  return (
    <div className={styles.sectionBody}>
      <label>
        Graph Type
        <select
          value={normalizedChartType || "bar"}
          onChange={(e) =>
            onUpdate((draft) => {
              const nextType = e.target.value as "line" | "bar" | "pie";
              if (nextType === "pie" && !canUsePie) {
                return;
              }
              draft.settings.graph.chartType = nextType;
              if (nextType !== "bar") {
                draft.settings.graph.barLayout = "grouped";
              } else {
                draft.settings.graph.barLayout = draft.settings.graph.barLayout || "grouped";
              }
            })
          }
        >
          <option value="line">Line</option>
          <option value="bar">Bar</option>
          <option value="pie" disabled={!canUsePie}>
            Pie
          </option>
        </select>
      </label>

      {normalizedChartType === "bar" && chartSeriesCount > 1 && (
        <label>
          Bar Layout
          <select
            value={currentBarLayout}
            onChange={(e) =>
              onUpdate((draft) => {
                draft.settings.graph.barLayout = e.target.value as "stacked" | "grouped";
              })
            }
          >
            <option value="grouped">Grouped</option>
            <option value="stacked">Stacked</option>
          </select>
        </label>
      )}
    </div>
  );
}
