"use client";
import { useState, useEffect } from "react";
import styles from "../CardSettings.module.css";

type SqlStatus = "idle" | "success" | "error";

export default function SqlRunner({
  code,
  onRunSuccess,
}: {
  code: string;
  onRunSuccess: (result: any, newSql: string) => void;
}) {
  const [draftSQL, setDraftSQL] = useState(code || "");
  const [sqlStatus, setSqlStatus] = useState<SqlStatus>("idle");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setDraftSQL(code || "");
    setSqlStatus("idle");
  }, [code]);

  const handleRun = async () => {
    if (!draftSQL.trim()) return;
    setIsRunning(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: draftSQL }),
        }
      );
      const data = await res.json();

      if (data?.rows?.length) {
        setSqlStatus("success");
        onRunSuccess(data.rows, draftSQL);
      } else {
        setSqlStatus("error");
      }
    } catch (e) {
      console.error("SQL error:", e);
      setSqlStatus("error");
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
          onChange={(e) => {
            setDraftSQL(e.target.value);
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
          {isRunning ? "Running..." : "▶ Run SQL"}
        </button>
      </div>
    </div>
  );
}
