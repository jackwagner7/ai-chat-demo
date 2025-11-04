"use client";
import { useState, useEffect } from "react";
import { runChartSQL } from "@/lib/chartSqlHelpers";
import styles from "../CardSettings.module.css";
import type { Card } from "@/types";
import { ensureSeriesDisplayNames, ensureSegmentColors } from "./settingsUtils";

type ChartCard = Extract<Card, { kind: "chart" }>;

type Props = {
  card: ChartCard;
  onChange: (next: Card) => void;
  themeColors: string[];
};

export default function ChartSqlRunner({ card, onChange, themeColors }: Props) {
  const [draft, setDraft] = useState(card.settings.sql.code || "");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    setDraft(card.settings.sql.code || "");
    setStatus("idle");
  }, [card.id, card.settings.sql.code]);

  const run = async () => {
    setIsRunning(true);
    const result = await runChartSQL(draft);
    setIsRunning(false);
    if (result.error) {
      setStatus("error");
      return;
    }

    setStatus("success");
    const rows = result.rows || [];
    const keys = rows[0] ? Object.keys(rows[0]) : [];
    const xKey = keys[0];
    const series = keys.slice(1).filter((k) => typeof rows[0]?.[k] === "number");

    const copy: Card = JSON.parse(JSON.stringify(card));
    copy.settings.sql.code = draft;
    (copy as any).data.rows = rows;
    (copy as any).data.xKey = xKey;
    (copy as any).data.series = series;
    ensureSeriesDisplayNames(copy, series);

    const categories = rows.map((row) => String(row[xKey]));
    const pieResult = copy.settings.graph.chartType === "pie";
    const avoid = (() => {
      const bg = copy.settings.titleBackground.bgColorRef !== undefined
        ? themeColors[copy.settings.titleBackground.bgColorRef]
        : copy.settings.titleBackground.bgColor;
      return bg ? [bg.toLowerCase()] : [];
    })();

    if (pieResult || copy.settings.legend.segmentColorEnabled) {
      ensureSegmentColors(copy, Array.from(new Set(categories)), themeColors, avoid);
    } else {
      copy.settings.legend.segmentColorRefs = copy.settings.legend.segmentColorRefs || {};
      copy.settings.legend.segmentColors = copy.settings.legend.segmentColors || {};
    }
    copy.settings.legend.segmentColorEnabled = pieResult
      ? true
      : copy.settings.legend.segmentColorEnabled ?? false;

    onChange(copy);
  };

  return (
    <div className={styles.sqlBlock}>
      <label className={styles.sqlLabel}>
        SQL
        <textarea
          className={`${styles.sqlBox} ${
            status === "success"
              ? styles["sql-success"]
              : status === "error"
              ? styles["sql-error"]
              : ""
          }`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (status !== "success") setStatus("idle");
          }}
          rows={6}
        />
      </label>
      <div className={styles.runSection}>
        <button
          className={styles.runBtn}
          onClick={run}
          disabled={isRunning || !draft.trim()}
          title="Run SQL"
        >
          {isRunning ? "Running..." : "Run SQL"}
        </button>
      </div>
    </div>
  );
}
