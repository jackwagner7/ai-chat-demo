"use client";
import { useState, useEffect } from "react";
import Papa from "papaparse";
import styles from "./CsvUploader.module.css";

interface Dataset {
  name: string;
  columns: string[];
  rows: any[];
  expanded: boolean;
}

interface CsvUploaderProps {
  onUpload?: (data: {
    file: File;
    table: string;
    columns: string[];
    previewRows: any[];
  }) => void;
}

export default function CsvUploader({ onUpload }: CsvUploaderProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // 🧩 Helper — normalize column names
  const normalizeName = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "");

  // --- 1️⃣ Core upload logic ---
  async function handleFiles(fileList: FileList | File[]) {
    if (!fileList || fileList.length === 0) return;

    for (const f of Array.from(fileList)) {
      if (!(f instanceof File)) continue;
      const file = f;
      if (!file.name.toLowerCase().endsWith(".csv")) continue;

      try {
        // --- 🧩 Normalize CSV headers before uploading ---
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true });
        if (parsed.errors.length > 0)
          console.warn("CSV parse warnings:", parsed.errors);

        const rawColumns = parsed.meta.fields || [];
        const columns = rawColumns.map(normalizeName);

        const normalizedData = parsed.data.map((row: any) => {
          const newRow: any = {};
          rawColumns.forEach((orig, i) => {
            newRow[columns[i]] = row[orig];
          });
          return newRow;
        });

        const csvWithNormalizedHeaders = Papa.unparse(normalizedData);
        const normalizedFile = new File(
          [csvWithNormalizedHeaders],
          file.name,
          { type: "text/csv" }
        );

        // Upload to backend
        const formData = new FormData();
        formData.append("file", normalizedFile);

        const uploadRes = await fetch(
          `${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/upload`,
          { method: "POST", body: formData }
        );

        const uploadData = await uploadRes.json();
        const tableName = uploadData?.table || file.name.replace(/\.csv$/i, "");

        // --- 🧩 Use normalized columns for preview ---
        const previewRows = normalizedData.slice(0, 50);

        const newDataset = {
          name: tableName,
          columns,
          rows: previewRows,
          expanded: false,
        };

        setDatasets((prev) => [...prev, newDataset].slice(0, 10));

        // ✅ Notify parent
        onUpload?.({
          file: normalizedFile,
          table: tableName,
          columns,
          previewRows,
        });
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
  }

  // --- 2️⃣ Manual upload via input ---
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const { files } = e.target;
    if (files && files.length > 0) await handleFiles(files);
  }

  // --- 3️⃣ Expand/collapse dataset preview ---
  function toggleExpand(idx: number) {
    setDatasets((prev) =>
      prev.map((d, i) =>
        i === idx ? { ...d, expanded: !d.expanded } : { ...d, expanded: false }
      )
    );
  }

  // --- 4️⃣ Global drag-and-drop support ---
  useEffect(() => {
    const preventDefaults = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      preventDefaults(e);
      setDragActive(false);

      const files: File[] = [];
      if (e.dataTransfer?.items) {
        for (const item of Array.from(e.dataTransfer.items)) {
          if (item.kind === "file") {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      } else if (e.dataTransfer?.files) {
        files.push(...Array.from(e.dataTransfer.files));
      }

      if (files.length > 0) await handleFiles(files);
    };

    const handleDragEnter = (e: DragEvent) => {
      preventDefaults(e);
      setDragActive(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      preventDefaults(e);
      setDragActive(false);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  // --- 5️⃣ UI rendering ---
  return (
    <>
      {dragActive && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropMessage}>Drop CSV files to upload</div>
        </div>
      )}

      <div
        className={`${styles.panel} ${
          datasets.length === 0 ? styles.centered : styles.docked
        }`}
      >
        {datasets.length === 0 ? (
          <div className={styles.emptyState}>
            <h2 className={styles.title}>Upload your first dataset</h2>
            <label className={styles.addTile}>
              <span>+</span>
              <input
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileUpload}
                className={styles.hiddenInput}
              />
            </label>
          </div>
        ) : (
          <>
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
              <label className={styles.addAdditionalTile}>
                <span>+</span>
                <input
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={handleFileUpload}
                  className={styles.hiddenInput}
                />
              </label>
            )}
          </>
        )}
      </div>
    </>
  );
}
