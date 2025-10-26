"use client";
import { useState } from "react";
import Papa from "papaparse";
import styles from "./CsvUploader.module.css";

interface Dataset {
  name: string;
  columns: string[];
  rows: any[];
  expanded: boolean;
  table?: string;
}

interface CsvUploaderProps {
  onUpload?: (info: { file: File; table: string; columns: string[]; previewRows: any[] }) => void;
}

export default function CsvUploader({ onUpload }: CsvUploaderProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 🟢 Step 1: send the file to the backend
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/upload`, {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (uploadData.error) {
        console.error("Upload error:", uploadData.error);
        return;
      }

      const tableName = uploadData.table;

      // 🟢 Step 2: parse locally for preview only
      Papa.parse(file, {
        header: true,
        preview: 50,
        complete: (results) => {
          const columns = Object.keys(results.data[0] || {});
          const newDataset = {
            name: file.name,
            table: tableName,
            columns,
            rows: results.data.slice(0, 50),
            expanded: false,
          };

          setDatasets((prev) => [...prev, newDataset].slice(0, 10));

          // Pass info to parent (e.g. page.tsx)
          if (onUpload) {
            onUpload({
              file,
              table: tableName,
              columns,
              previewRows: results.data.slice(0, 50),
            });
          }
        },
      });
    } catch (err) {
      console.error("❌ Upload failed:", err);
    }
  }

  function toggleExpand(idx: number) {
    setDatasets((prev) =>
      prev.map((d, i) =>
        i === idx ? { ...d, expanded: !d.expanded } : { ...d, expanded: false }
      )
    );
  }

  return (
    <div
      className={`${styles.panel} ${
        datasets.length === 0 ? styles.centered : styles.docked
      }`}
    >
      {datasets.map((dataset, idx) => (
        <div
          key={idx}
          className={`${styles.uploader} ${
            dataset.expanded ? styles.expanded : styles.collapsed
          }`}
        >
          <div className={styles.header} onClick={() => toggleExpand(idx)}>
            {dataset.name}
          </div>

          {dataset.expanded && (
            <div className={styles.preview}>
              <div className={styles.tableWrapper}>
                <table>
                  <thead>
                    <tr>
                      {dataset.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.rows.map((row, i) => (
                      <tr key={i}>
                        {dataset.columns.map((c) => (
                          <td key={c}>{row[c]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}

      {datasets.length < 10 && (
        <label className={styles.addTile}>
          <span>+</span>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className={styles.hiddenInput}
          />
        </label>
      )}
    </div>
  );
}
