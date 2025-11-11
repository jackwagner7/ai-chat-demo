"use client";
import { useEffect, useState, type ChangeEvent } from "react";
import styles from "../CardSettings.module.css";
import { validateSqlAgainstTables, rewriteSqlTables } from "@/lib/sqlValidation";

type SqlStatus = "idle" | "success" | "error";
type DataRow = Record<string, unknown>;

interface SqlRunnerProps {
  code: string;
  onRunSuccess: (rows: DataRow[], newSql: string, tables: string[]) => void;
  allowedTables: string[];
  tableNameMap: Record<string, string>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRowsArray = (value: unknown): DataRow[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is DataRow => isRecord(entry))
    .map((entry) => ({ ...entry }));
};

const getRowsFromPayload = (payload: unknown): DataRow[] => {
  if (!isRecord(payload)) return [];
  const rowsValue = (payload as { rows?: unknown }).rows;
  return toRowsArray(rowsValue);
};

const getErrorMessage = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) return undefined;
  const errorValue = (payload as { error?: unknown }).error;
  return typeof errorValue === "string" ? errorValue : undefined;
};

export default function SqlRunner({
  code,
  onRunSuccess,
  allowedTables,
  tableNameMap,
}: SqlRunnerProps) {
  const [draftSQL, setDraftSQL] = useState(code || "");
  const [sqlStatus, setSqlStatus] = useState<SqlStatus>("idle");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setDraftSQL(code || "");
    setSqlStatus("idle");
  }, [code]);

  const handleRun = async () => {
    if (!draftSQL.trim()) return;
    const validation = validateSqlAgainstTables(draftSQL, allowedTables);
    if (!validation.ok) {
      setSqlStatus("error");
      window.alert(validation.message);
      return;
    }
    const tableIds = validation.tables
      .map((name) => tableNameMap[name.toLowerCase()])
      .filter((id): id is string => Boolean(id));
    if (tableIds.length !== validation.tables.length) {
      setSqlStatus("error");
      window.alert("SQL references an unknown table.");
      return;
    }
    const executableSql = rewriteSqlTables(draftSQL, tableNameMap);
    setIsRunning(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: executableSql }),
      });
      const payload: unknown = await res.json();

      if (!res.ok) {
        const message = getErrorMessage(payload) ?? "SQL execution failed.";
        setSqlStatus("error");
        window.alert(message);
        return;
      }

      const serverError = getErrorMessage(payload);
      if (serverError) {
        setSqlStatus("error");
        window.alert(serverError);
        return;
      }

      const rows = getRowsFromPayload(payload);
      if (!rows.length) {
        setSqlStatus("error");
        window.alert("Query returned no rows.");
        return;
      }

      setSqlStatus("success");
      onRunSuccess(rows, draftSQL, tableIds);
    } catch (error) {
      console.error("SQL error:", error);
      setSqlStatus("error");
      window.alert("SQL execution failed.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div>
      <label className={styles.sqlLabel}>
        SQL
        <textarea
          className={`${styles.sqlBox} ${
            sqlStatus === "success"
              ? styles["sql-success"]
              : sqlStatus === "error"
              ? styles["sql-error"]
              : ""
          }`}
          value={draftSQL}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setDraftSQL(event.target.value);
            if (sqlStatus !== "success") setSqlStatus("idle");
          }}
          rows={6}
        />
      </label>
      <div className={styles.runSection}>
        <button
          className={styles.runBtn}
          onClick={handleRun}
          disabled={isRunning || !draftSQL.trim()}
        >
          {isRunning ? "Running..." : "Run SQL"}
        </button>
      </div>
    </div>
  );
}
