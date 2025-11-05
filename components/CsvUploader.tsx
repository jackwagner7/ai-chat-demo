"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { StoredDataset } from "@/types";
import styles from "./CsvUploader.module.css";

const MAX_DATASETS = 10;
const MAX_PREVIEW_ROWS = 50;

interface CsvUploaderProps {
  datasets: StoredDataset[];
  setDatasets: React.Dispatch<React.SetStateAction<StoredDataset[]>>;
  onUpload?: (data: {
    file: File;
    tableId: string;
    displayName: string;
    columns: string[];
    previewRows: Record<string, unknown>[];
    sourceFilename?: string;
  }) => void;
  onDeleteDataset?: (dataset: StoredDataset) => Promise<boolean | void> | boolean | void;
}

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
};

export default function CsvUploader({
  datasets,
  setDatasets,
  onUpload,
  onDeleteDataset,
}: CsvUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const activeConfirming = useMemo(() => {
    if (!confirming) return null;
    return datasets.some((dataset) => dataset.tableId === confirming) ? confirming : null;
  }, [confirming, datasets]);

  const normalizeName = useCallback(
    (name: string) =>
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/^_+|_+$/g, ""),
    [],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!fileList || fileList.length === 0) return;

      for (const item of Array.from(fileList)) {
        if (!(item instanceof File)) continue;
        const originalFile = item;
        const lowerName = originalFile.name.toLowerCase();
        const isCsv = lowerName.endsWith(".csv");
        const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");
        if (!isCsv && !isExcel) continue;

        let normalizedFile: File | null = null;
        try {
          let columns: string[] = [];
        let normalizedData: Record<string, unknown>[] = [];
        let csvWithNormalizedHeaders = "";

        if (isExcel) {
          const arrayBuffer = await originalFile.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) {
              console.warn(`No sheets found in workbook ${originalFile.name}`);
            continue;
          }
          const sheet = workbook.Sheets[firstSheetName];
          const excelRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: "",
          });
          const rawColumnOrder: string[] = [];
          excelRows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                if (!rawColumnOrder.includes(key)) rawColumnOrder.push(key);
              });
            });
            const rawColumns = rawColumnOrder;
            columns = rawColumns.map(normalizeName);
            normalizedData = excelRows.map((row) => {
              const nextRow: Record<string, unknown> = {};
              rawColumns.forEach((orig, idx) => {
                nextRow[columns[idx]] = row?.[orig];
              });
              return nextRow;
            });

            csvWithNormalizedHeaders = Papa.unparse(normalizedData);
            const excelBase = originalFile.name.replace(/\.(xlsx|xls)$/i, "");
            normalizedFile = new File([csvWithNormalizedHeaders], `${excelBase}.csv`, {
              type: "text/csv",
            });
          } else {
            const text = await originalFile.text();
            const parsed = Papa.parse<Record<string, unknown>>(text, { header: true });
            if (parsed.errors.length > 0) {
              console.warn("CSV parse warnings:", parsed.errors);
            }

            const rawColumns = parsed.meta.fields || [];
            columns = rawColumns.map(normalizeName);

            normalizedData = parsed.data.map((row) => {
              const nextRow: Record<string, unknown> = {};
              rawColumns.forEach((orig, idx) => {
                nextRow[columns[idx]] = row?.[orig];
              });
              return nextRow;
            });

            csvWithNormalizedHeaders = Papa.unparse(normalizedData);
            normalizedFile = new File([csvWithNormalizedHeaders], originalFile.name, {
              type: "text/csv",
            });
          }

          if (!normalizedFile) continue;

          const formData = new FormData();
          formData.append("file", normalizedFile);

          const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/upload`, {
            method: "POST",
            body: formData,
          });
          const uploadData = await uploadRes.json();
          const fallbackDisplayName = normalizeName(originalFile.name.replace(/\.(csv|xlsx|xls)$/i, ""));
          const tableId =
            typeof uploadData?.tableId === "string"
              ? uploadData.tableId
              : `tbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const displayName =
            typeof uploadData?.displayName === "string" && uploadData.displayName.length
              ? uploadData.displayName
              : fallbackDisplayName || tableId;

          const previewRows = normalizedData.slice(0, MAX_PREVIEW_ROWS);
          const newDataset: StoredDataset = {
            tableId,
            displayName,
            columns,
            rows: previewRows,
            expanded: false,
            sourceFilename: originalFile.name,
          };

          setDatasets((prev) => {
            const filtered = prev.filter((dataset) => dataset.tableId !== tableId);
            const next = [...filtered, newDataset];
            return next.slice(-MAX_DATASETS);
          });

          onUpload?.({
            file: normalizedFile,
            tableId,
            displayName,
            columns,
            previewRows,
            sourceFilename: originalFile.name,
          });
        } catch (error) {
          console.error("Upload failed:", error);
        }
      }
    },
    [normalizeName, onUpload, setDatasets],
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (files && files.length > 0) await handleFiles(files);
  };

  const toggleExpand = (idx: number) => {
    setDatasets((prev) =>
      prev.map((dataset, index) =>
        index === idx ? { ...dataset, expanded: !dataset.expanded } : { ...dataset, expanded: false },
      ),
    );
  };

  useEffect(() => {
    const preventDefaults = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleDrop = async (event: DragEvent) => {
      preventDefaults(event);
      setDragActive(false);

      const files: File[] = [];
      if (event.dataTransfer?.items) {
        for (const item of Array.from(event.dataTransfer.items)) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      } else if (event.dataTransfer?.files) {
        files.push(...Array.from(event.dataTransfer.files));
      }

      if (files.length > 0) await handleFiles(files);
    };

    const handleDragEnter = (event: DragEvent) => {
      preventDefaults(event);
      setDragActive(true);
    };
    const handleDragLeave = (event: DragEvent) => {
      preventDefaults(event);
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
  }, [handleFiles]);

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
                accept=".csv,.xlsx,.xls"
                multiple
                onChange={handleFileUpload}
                className={styles.hiddenInput}
              />
            </label>
          </div>
        ) : (
          <>
            {datasets.map((dataset, idx) => {
              const headerTitle = dataset.sourceFilename ?? dataset.displayName ?? dataset.tableId;
              const subtitle = dataset.sourceFilename
                ? `Alias: ${dataset.displayName}`
                : `Table ID: ${dataset.tableId}`;
              return (
                <div
                  key={`${dataset.tableId}-${idx}`}
                  className={`${styles.uploader} ${
                    dataset.expanded ? styles.expanded : styles.collapsed
                  }`}
                >
                  <div className={styles.header} onClick={() => toggleExpand(idx)}>
                    <div className={styles.headerInfo}>
                      <span className={styles.headerTitle}>{headerTitle}</span>
                      <span className={styles.headerSubtitle}>{subtitle}</span>
                    </div>
                    <div
                      className={styles.actionArea}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {activeConfirming === dataset.tableId ? (
                        <>
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={styles.confirmDeleteButton}
                            onClick={async () => {
                              if (onDeleteDataset) {
                                const result = await onDeleteDataset(dataset);
                                if (result === false) return;
                              } else {
                                setDatasets((prev) =>
                                  prev.filter((entry) => entry.tableId !== dataset.tableId),
                                );
                              }
                              setConfirming(null);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => setConfirming(dataset.tableId)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {dataset.expanded && (
                    <div className={styles.preview}>
                      <div className={styles.tableWrapper}>
                        <table>
                          <thead>
                            <tr>
                              {dataset.columns.map((column) => (
                                <th key={column}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dataset.rows.map((row, rowIdx) => (
                              <tr key={rowIdx}>
                                {dataset.columns.map((column) => {
                                  const cellValue = row?.[column];
                                  return <td key={column}>{formatCellValue(cellValue)}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {datasets.length < MAX_DATASETS && (
              <label className={styles.addAdditionalTile}>
                <span>+</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
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
  )}
