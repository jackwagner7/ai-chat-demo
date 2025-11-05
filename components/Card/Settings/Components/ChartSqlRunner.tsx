"use client";
import { useState, useEffect } from "react";
import styles from "../CardSettings.module.css";
import type { Card } from "@/types";
import { ensureSeriesDisplayNames, ensureSegmentColors } from "./settingsUtils";
import { validateSqlAgainstTables, rewriteSqlTables } from "@/lib/sqlValidation";

type DataRow = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRowsArray = (value: unknown): DataRow[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (isRecord(entry) ? entry : {}))
    .map((entry) => ({ ...entry }));
};

const getRowsFromResult = (result: unknown): DataRow[] =>
  isRecord(result) ? toRowsArray(result.rows) : [];

const getErrorFromResult = (result: unknown): string | undefined =>
  isRecord(result) && typeof result.error === "string" ? result.error : undefined;

type ChartCard = Extract<Card, { kind: "chart" }>;

type Props = {
  card: ChartCard;
  onChange: (next: Card) => void;
  themeColors: string[];
  allowedTables: string[];
  tableNameMap: Record<string, string>;
};

export default function ChartSqlRunner({
  card,
  onChange,
  themeColors,
  allowedTables,
  tableNameMap,
}: Props) {
  const [draft, setDraft] = useState(card.settings.sql.code || "");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    setDraft(card.settings.sql.code || "");
    setStatus("idle");
  }, [card.id, card.settings.sql.code]);

  const run = async () => {
    setIsRunning(true);
    const validation = validateSqlAgainstTables(draft, allowedTables);
    if (!validation.ok) {
      setStatus("error");
      setIsRunning(false);
      window.alert(validation.message);
      return;
    }

    const tableIds = validation.tables
      .map((name) => tableNameMap[name.toLowerCase()])
      .filter((id): id is string => Boolean(id));
    if (tableIds.length !== validation.tables.length) {
      setStatus("error");
      setIsRunning(false);
      window.alert("SQL references an unknown table.");
      return;
    }

    const executableSql = rewriteSqlTables(draft, tableNameMap);

    let rawResult: unknown;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: executableSql }),
      });
      rawResult = await res.json();
    } catch (error) {
      console.error("SQL error:", error);
      setStatus("error");
      setIsRunning(false);
      window.alert("SQL execution failed.");
      return;
    } finally {
      setIsRunning(false);
    }

    const resultError = getErrorFromResult(rawResult);
    if (resultError) {
      setStatus("error");
      window.alert(resultError || "SQL error");
      return;
    }

    const rows = getRowsFromResult(rawResult);
    if (!rows.length) {
      setStatus("error");
      window.alert("Query returned no rows.");
      return;
    }
    setStatus("success");
    const firstRow = rows[0] ?? {};
    const keys = Object.keys(firstRow);
    const xKey = keys[0];
    const series = keys.slice(1).filter((k) => {
      const value = (firstRow as Record<string, unknown>)[k];
      return typeof value === "number";
    });

    const copy: ChartCard = JSON.parse(JSON.stringify(card)) as ChartCard;
    copy.settings.sql.code = draft;
    copy.data.rows = rows;
    copy.data.xKey = xKey;
    copy.data.series = series;
    copy.sourceTables = tableIds;
    ensureSeriesDisplayNames(copy, series);

    const categories = rows.map((row) => String(row[xKey] ?? ""));
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
