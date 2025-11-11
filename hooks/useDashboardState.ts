import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  Card,
  CardsReport,
  Msg,
  PreviewState,
  StoredDataset,
  UploadedTableInfo,
} from "@/types";
import { extractReferencedTables } from "@/lib/sqlValidation";
import { ensureCardLayout } from "@/lib/cardLayout";
import {
  getErrorFromResult,
  toNonEmptyString,
  toRowsArray,
  toStringArray,
} from "@/lib/resultParsers";

const CARD_STORAGE_KEY = "aidata.cards-report.v2";
const LEGACY_CARD_STORAGE_KEY = "aidata.cards-report.v1";
const CARD_STORAGE_VERSION = "cards-v2";
const LEGACY_CARD_STORAGE_VERSION = "cards-v1";
const MAX_STORED_DATASETS = 10;
const MAX_PREVIEW_ROWS = 50;

type DataRow = Record<string, unknown>;

export type UploadPayload = {
  file: File;
  tableId: string;
  displayName: string;
  columns: string[];
  previewRows: DataRow[];
  sourceFilename?: string;
};

type DatasetSummary = Pick<StoredDataset, "displayName" | "columns" | "sourceFilename">;

type EnqueueMessages = (updater: Msg[] | ((prev: Msg[]) => Msg[])) => void;

type UseDashboardStateArgs = {
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  setSelectedCardId: Dispatch<SetStateAction<string | null>>;
  enqueueMessages: EnqueueMessages;
  themeColors: string[];
  setThemeColors: Dispatch<SetStateAction<string[]>>;
  backgroundColor: string;
  setBackgroundColor: Dispatch<SetStateAction<string>>;
};

export type UseDashboardStateResult = {
  datasets: StoredDataset[];
  setDatasets: Dispatch<SetStateAction<StoredDataset[]>>;
  uploadedTables: UploadedTableInfo[];
  preview: PreviewState;
  hasHydratedState: boolean;
  handleDatasetDelete: (dataset: StoredDataset) => Promise<boolean>;
  handleCsvUpload: (payload: UploadPayload) => void;
};

const formatDatasetSummary = (dataset: DatasetSummary): string => {
  const heading = dataset.sourceFilename
    ? `${dataset.sourceFilename} (as ${dataset.displayName})`
    : dataset.displayName;
  const columnsText = dataset.columns.join(", ");
  return `Dataset: ${heading}\nColumns: ${columnsText}`;
};

const buildSchemaText = (datasets: DatasetSummary[]): string => {
  if (!datasets.length) return "";
  return datasets.map((dataset) => formatDatasetSummary(dataset)).join("\n\n");
};

const sanitizeDatasets = (
  list: (StoredDataset | Record<string, unknown>)[] | undefined,
): StoredDataset[] => {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_STORED_DATASETS).map((dataset) => {
    const record = dataset as Record<string, unknown>;
    const tableId =
      toNonEmptyString(record["tableId"]) ??
      toNonEmptyString(record["name"]) ??
      `tbl_${Date.now().toString(36)}`;
    const displayName =
      toNonEmptyString(record["displayName"]) ??
      toNonEmptyString(record["name"]) ??
      tableId;
    const columns = toStringArray(record["columns"]);
    const rows = toRowsArray(record["rows"], MAX_PREVIEW_ROWS);
    const expandedValue = record["expanded"];
    const expanded = typeof expandedValue === "boolean" ? expandedValue : false;
    const sourceFilename = toNonEmptyString(record["sourceFilename"]);
    return {
      tableId,
      displayName,
      columns,
      rows,
      expanded,
      sourceFilename,
    };
  });
};

const sanitizePreview = (
  preview: PreviewState | Record<string, unknown> | undefined,
): PreviewState => {
  if (!preview) {
    return { columns: [], rows: [], tableId: undefined, sourceFilename: undefined };
  }
  const record = preview as Record<string, unknown>;
  const columns = toStringArray(record["columns"]);
  const rows = toRowsArray(record["rows"], MAX_PREVIEW_ROWS);
  const tableId =
    toNonEmptyString(record["tableId"]) ?? toNonEmptyString(record["table"]);
  const sourceFilename = toNonEmptyString(record["sourceFilename"]);
  return { columns, rows, tableId, sourceFilename };
};

const sanitizeUploadedTables = (
  list: (UploadedTableInfo | Record<string, unknown>)[] | undefined,
): UploadedTableInfo[] => {
  if (!Array.isArray(list)) return [];
  return list.map((table) => {
    const record = table as Record<string, unknown>;
    const tableId =
      toNonEmptyString(record["tableId"]) ??
      toNonEmptyString(record["name"]) ??
      `tbl_${Date.now().toString(36)}`;
    const displayName =
      toNonEmptyString(record["displayName"]) ??
      toNonEmptyString(record["name"]) ??
      tableId;
    const columns = toStringArray(record["columns"]);
    const sourceFilename = toNonEmptyString(record["sourceFilename"]);
    return { tableId, displayName, columns, sourceFilename };
  });
};

export function useDashboardState({
  cards,
  setCards,
  setSelectedCardId,
  enqueueMessages,
  themeColors,
  setThemeColors,
  backgroundColor,
  setBackgroundColor,
}: UseDashboardStateArgs): UseDashboardStateResult {
  const [schema, setSchema] = useState("");
  const [uploadedTables, setUploadedTables] = useState<UploadedTableInfo[]>([]);
  const [preview, setPreview] = useState<PreviewState>({ columns: [], rows: [] });
  const [datasets, setDatasets] = useState<StoredDataset[]>([]);
  const [hasHydratedState, setHasHydratedState] = useState(false);

  useEffect(() => {
    setSchema(buildSchemaText(datasets));
  }, [datasets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored = window.localStorage.getItem(CARD_STORAGE_KEY);
    let usedLegacyKey = false;
    if (!stored) {
      stored = window.localStorage.getItem(LEGACY_CARD_STORAGE_KEY);
      if (!stored) {
        setHasHydratedState(true);
        return;
      }
      usedLegacyKey = true;
    }
    try {
      const parsed = JSON.parse(stored) as CardsReport;
      const version =
        typeof parsed.version === "string" ? parsed.version : LEGACY_CARD_STORAGE_VERSION;
      if (version !== CARD_STORAGE_VERSION && version !== LEGACY_CARD_STORAGE_VERSION) {
        setHasHydratedState(true);
        return;
      }
      const isLegacyPayload = version === LEGACY_CARD_STORAGE_VERSION;
      if (Array.isArray(parsed.themeColors) && parsed.themeColors.length) {
        const sanitizedThemes = parsed.themeColors.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        );
        if (sanitizedThemes.length) {
          setThemeColors(sanitizedThemes);
        }
      }
      if (typeof parsed.backgroundColor === "string" && parsed.backgroundColor.trim().length) {
        setBackgroundColor(parsed.backgroundColor);
      }
      setSchema(typeof parsed.schema === "string" ? parsed.schema : "");
      setUploadedTables(sanitizeUploadedTables(parsed.uploadedTables));
      setPreview(sanitizePreview(parsed.preview));
      setDatasets(sanitizeDatasets(parsed.datasets));
      if (Array.isArray(parsed.cards)) {
        setCards(parsed.cards.map((card, idx) => ensureCardLayout(card, idx, { forceScale: isLegacyPayload })));
        setSelectedCardId((prev) =>
          parsed.cards.some((card) => card.id === prev) ? prev : null,
        );
      }
      if (usedLegacyKey) {
        window.localStorage.removeItem(LEGACY_CARD_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Failed to restore dashboard state", error);
    } finally {
      setHasHydratedState(true);
    }
  }, [setBackgroundColor, setCards, setSelectedCardId, setThemeColors]);

  useEffect(() => {
    if (!hasHydratedState) return;
    if (typeof window === "undefined") return;
    try {
      const report: CardsReport = {
        version: CARD_STORAGE_VERSION,
        themeColors,
        cards: cards.map((card, idx) => ensureCardLayout(card, idx)),
        backgroundColor,
        schema,
        uploadedTables: sanitizeUploadedTables(uploadedTables),
        preview: sanitizePreview(preview),
        datasets: sanitizeDatasets(datasets),
      };
      window.localStorage.setItem(CARD_STORAGE_KEY, JSON.stringify(report));
      window.localStorage.removeItem(LEGACY_CARD_STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to persist dashboard state", error);
    }
  }, [
    backgroundColor,
    cards,
    datasets,
    hasHydratedState,
    preview,
    schema,
    themeColors,
    uploadedTables,
  ]);

  const handleDatasetDelete = useCallback(
    async (dataset: StoredDataset) => {
      const baseUrl = process.env.NEXT_PUBLIC_DATA_ENGINE_API
        ? process.env.NEXT_PUBLIC_DATA_ENGINE_API.replace(/\/$/, "")
        : "";
      let dropped = false;
      let lastError: string | null = null;

      if (baseUrl) {
        const encodedId = encodeURIComponent(dataset.tableId);
        try {
          const resp = await fetch(`${baseUrl}/upload/${encodedId}`, { method: "DELETE" });
          if (resp.ok) {
            dropped = true;
          } else {
            const detail = await resp.text();
            lastError = detail || `Failed to drop table ${dataset.tableId}`;
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Failed to reach data engine.";
        }

        if (!dropped) {
          try {
            const dropSql = `DROP TABLE IF EXISTS "${dataset.tableId}"`;
            const dropRes = await fetch(`${baseUrl}/query`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sql: dropSql }),
            });
            const dropData = await dropRes.json();
            const dropError = getErrorFromResult(dropData);
            if (!dropError) {
              dropped = true;
            } else {
              lastError = dropError;
            }
          } catch (error) {
            lastError = error instanceof Error ? error.message : "Failed to run DROP TABLE query.";
          }
        }

        if (!dropped && dataset.displayName && dataset.displayName !== dataset.tableId) {
          try {
            const dropSql = `DROP TABLE IF EXISTS "${dataset.displayName}"`;
            const dropRes = await fetch(`${baseUrl}/query`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sql: dropSql }),
            });
            const dropData = await dropRes.json();
            const dropError = getErrorFromResult(dropData);
            if (!dropError) {
              dropped = true;
            } else if (!lastError) {
              lastError = dropError;
            }
          } catch (error) {
            if (!lastError) {
              lastError = error instanceof Error ? error.message : "Failed to run DROP TABLE query.";
            }
          }
        }
      } else {
        lastError = "Data engine URL is not configured.";
      }

      if (!dropped) {
        enqueueMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Could not delete dataset ${dataset.displayName}: ${lastError}`,
          },
        ]);
        return false;
      }

      const tableIdLower = dataset.tableId.toLowerCase();
      const displayNameLower = dataset.displayName.toLowerCase();

      setDatasets((prev) => prev.filter((entry) => entry.tableId !== dataset.tableId));
      setUploadedTables((prev) => prev.filter((entry) => entry.tableId !== dataset.tableId));
      if ((preview.tableId || "").toLowerCase() === tableIdLower) {
        setPreview({ columns: [], rows: [], tableId: undefined, sourceFilename: undefined });
      }

      let removedCount = 0;
      setCards((prev) => {
        const next = prev.filter((card) => {
          if (card.sourceTables?.some((table) => table.toLowerCase() === tableIdLower)) {
            removedCount += 1;
            return false;
          }
          const sql = card.settings.sql.code || "";
          if (!sql.trim()) return true;
          const referenced = extractReferencedTables(sql).map((name) => name.toLowerCase());
          if (
            referenced.some(
              (name) => name === displayNameLower || name === tableIdLower,
            )
          ) {
            removedCount += 1;
            return false;
          }
          return true;
        });
        if (next.length !== prev.length) {
          setSelectedCardId((current) =>
            current && !next.some((card) => card.id === current) ? null : current,
          );
        }
        return next;
      });

      const displayLabel = dataset.sourceFilename
        ? `${dataset.sourceFilename} (as ${dataset.displayName})`
        : dataset.displayName;
      const cardNote =
        removedCount > 0
          ? ` Removed ${removedCount} card${removedCount === 1 ? "" : "s"} referencing it.`
          : "";
      enqueueMessages((prev) => [
        ...prev,
        { role: "system", content: `Removed dataset ${displayLabel}.${cardNote}` },
      ]);
      return true;
    },
    [enqueueMessages, preview, setCards, setDatasets, setPreview, setSelectedCardId, setUploadedTables],
  );

  const handleCsvUpload = useCallback(
    ({ tableId, displayName, columns, previewRows, sourceFilename }: UploadPayload) => {
      const viewLabel = sourceFilename ? `${sourceFilename} (as ${displayName})` : displayName;
      setUploadedTables((prev) => {
        const filtered = prev.filter((entry) => entry.tableId !== tableId);
        return [...filtered, { tableId, displayName, columns, sourceFilename }];
      });
      setPreview({
        columns,
        rows: previewRows.slice(0, MAX_PREVIEW_ROWS),
        tableId,
        sourceFilename,
      });
      enqueueMessages((m) => [...m, { role: "system", content: `Loaded dataset ${viewLabel}.` }]);
    },
    [enqueueMessages, setPreview, setUploadedTables],
  );

  return {
    datasets,
    setDatasets,
    uploadedTables,
    preview,
    hasHydratedState,
    handleDatasetDelete,
    handleCsvUpload,
  };
}
