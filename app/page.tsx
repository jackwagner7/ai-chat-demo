"use client";
import { useEffect, useMemo, useState } from "react";
import { extractBlock } from "@/lib/aiHelpers";
import { deriveSeries, normalizeType, generatePalette } from "@/lib/chartHelpers";
import CardContainer from "@/components/Card/CardContainer";
import ChatPanel from "@/components/ChatPanel";
import CsvUploader from "@/components/CsvUploader";
import ThemeManager from "@/components/ThemeManager";
import { validateSqlAgainstTables, extractReferencedTables, rewriteSqlTables } from "@/lib/sqlValidation";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import {
  SCALED_CARD_GAPS,
  SCALED_CARD_MIN,
  SCALED_CARD_POSITION,
  SCALED_CARD_SIZES,
  scaleLayout,
} from "@/lib/uiScale";
import type {
  Msg,
  Card,
  CardKind,
  CardLayout,
  CardsReport,
  StoredDataset,
  UploadedTableInfo,
  PreviewState,
} from "@/types";
import styles from "./page.module.css";

const CARD_STORAGE_KEY = "aidata.cards-report.v2";
const LEGACY_CARD_STORAGE_KEY = "aidata.cards-report.v1";
const CARD_STORAGE_VERSION = "cards-v2";
const LEGACY_CARD_STORAGE_VERSION = "cards-v1";
const CARD_GRID_COLUMNS = 3;
const CARD_HORIZONTAL_GAP = SCALED_CARD_GAPS.horizontal;
const CARD_VERTICAL_GAP = SCALED_CARD_GAPS.vertical;

const DEFAULT_CARD_SIZES: Record<CardKind, { width: number; height: number }> = SCALED_CARD_SIZES;

const DEFAULT_CARD_POSITION = SCALED_CARD_POSITION;
const DEFAULT_COLUMN_WIDTH = DEFAULT_CARD_SIZES.chart.width + CARD_HORIZONTAL_GAP;
const DEFAULT_ROW_HEIGHT = DEFAULT_CARD_SIZES.chart.height + CARD_VERTICAL_GAP;

const MAX_STORED_DATASETS = 10;
const MAX_PREVIEW_ROWS = 50;

type DatasetSummary = Pick<StoredDataset, "displayName" | "columns" | "sourceFilename">;
type DataRow = Record<string, unknown>;

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getStringField = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => toNonEmptyString(record[key]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const toRowsArray = (value: unknown, limit?: number): DataRow[] => {
  if (!Array.isArray(value)) return [];
  const source = typeof limit === "number" ? value.slice(0, limit) : value;
  return source.map((entry) => (isRecord(entry) ? entry : {}));
};

const getRowsFromResult = (result: unknown): DataRow[] => {
  if (!isRecord(result)) return [];
  return toRowsArray(result["rows"]);
};

const getErrorFromResult = (result: unknown): string | undefined =>
  isRecord(result) ? toNonEmptyString(result["error"]) : undefined;

function formatDatasetSummary(dataset: DatasetSummary): string {
  const heading = dataset.sourceFilename
    ? `${dataset.sourceFilename} (as ${dataset.displayName})`
    : dataset.displayName;
  const columnsText = dataset.columns.join(", ");
  return `Dataset: ${heading}\nColumns: ${columnsText}`;
}

function buildSchemaText(datasets: DatasetSummary[]): string {
  if (!datasets.length) return "";
  return datasets.map((dataset) => formatDatasetSummary(dataset)).join("\n\n");
}

function sanitizeDatasets(
  list: (StoredDataset | Record<string, unknown>)[] | undefined,
): StoredDataset[] {
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
}

function sanitizePreview(preview: PreviewState | Record<string, unknown> | undefined): PreviewState {
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
}

function sanitizeUploadedTables(
  list: (UploadedTableInfo | Record<string, unknown>)[] | undefined,
): UploadedTableInfo[] {
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
}

type UploadPayload = {
  file: File;
  tableId: string;
  displayName: string;
  columns: string[];
  previewRows: DataRow[];
  sourceFilename?: string;
};

function computeInitialLayout(kind: CardKind, index: number): CardLayout {
  const column = index % CARD_GRID_COLUMNS;
  const row = Math.floor(index / CARD_GRID_COLUMNS);

  const basePosition = {
    x: DEFAULT_CARD_POSITION.x + column * DEFAULT_COLUMN_WIDTH,
    y: DEFAULT_CARD_POSITION.y + row * DEFAULT_ROW_HEIGHT,
  };

  const size = DEFAULT_CARD_SIZES[kind];
  return {
    x: basePosition.x,
    y: basePosition.y,
    width: size.width,
    height: size.height,
  };
}

function ensureCardLayout(card: Card, index: number, options?: { forceScale?: boolean }): Card {
  const fallback = computeInitialLayout(card.kind, index);
  const sizeDefaults = DEFAULT_CARD_SIZES[card.kind];
  const minSize = card.kind === "measure" ? SCALED_CARD_MIN.measure : SCALED_CARD_MIN.chart;
  const scaledLayout = card.layout && options?.forceScale ? scaleLayout(card.layout) : card.layout;
  const base = scaledLayout ?? fallback;

  const toNumber = (value: unknown, fallbackValue: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallbackValue;

  const width = Math.max(toNumber(base.width, sizeDefaults.width), minSize.width);
  const height = Math.max(toNumber(base.height, sizeDefaults.height), minSize.height);
  const x = toNumber(base.x, fallback.x);
  const y = toNumber(base.y, fallback.y);

  return {
    ...card,
    layout: { x, y, width, height },
  } as Card;
}

function HomeContent() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [schema, setSchema] = useState("");
  const [uploadedTables, setUploadedTables] = useState<UploadedTableInfo[]>([]);
  const [preview, setPreview] = useState<PreviewState>({ columns: [], rows: [] });
  const [datasets, setDatasets] = useState<StoredDataset[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [hasHydratedState, setHasHydratedState] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const enqueueMessages = (updater: Msg[] | ((prev: Msg[]) => Msg[])) => {
    const runUpdate = () => setMessages(updater);
    if (typeof queueMicrotask === "function") {
      queueMicrotask(runUpdate);
    } else {
      Promise.resolve().then(runUpdate);
    }
  };

  const { themeColors, setThemeColors, backgroundColor, setBackgroundColor } = useTheme();
  const handleBackgroundClick = () => setSelectedCardId(null);

  useEffect(() => {
    setSchema(buildSchemaText(datasets));
  }, [datasets]);

  const tableAliasMap = useMemo(() => {
    const map: Record<string, string> = {};
    uploadedTables.forEach(({ displayName, tableId, sourceFilename }) => {
      map[displayName.toLowerCase()] = tableId;
      map[tableId.toLowerCase()] = tableId;
      if (sourceFilename) {
        map[sourceFilename.toLowerCase()] = tableId;
      }
    });
    datasets.forEach(({ displayName, tableId, sourceFilename }) => {
      map[displayName.toLowerCase()] = tableId;
      map[tableId.toLowerCase()] = tableId;
      if (sourceFilename) {
        map[sourceFilename.toLowerCase()] = tableId;
      }
    });
    return map;
  }, [datasets, uploadedTables]);

  const allowedTableLabels = useMemo(
    () =>
      Array.from(
        new Set(
          uploadedTables.flatMap(({ displayName, tableId, sourceFilename }) => {
            const labels = [displayName, tableId];
            if (sourceFilename) labels.push(sourceFilename);
            return labels;
          }),
        ),
      ),
    [uploadedTables],
  );

  const themeColorToken = (index: number, fallback: string) => {
    const color = themeColors[index];
    return {
      ref: color !== undefined ? index : undefined,
      color: color !== undefined ? undefined : fallback,
      value: color ?? fallback,
    };
  };

  const assignSeriesColors = (
    count: number,
    backgroundRef?: number,
    avoidColorValue?: string,
  ) => {
    const avoidColorNorm = avoidColorValue?.toLowerCase();
    const availableIndices = Array.from(
      { length: themeColors.length },
      (_, idx) => idx,
    ).filter((idx) => {
      const color = themeColors[idx];
      if (color === undefined) return false;
      if (idx === backgroundRef) return false;
      if (avoidColorNorm && color.toLowerCase() === avoidColorNorm) return false;
      return true;
    });
    const preferredOrder = [
      ...availableIndices.filter((idx) => idx === 1),
      ...availableIndices.filter((idx) => idx !== 1),
    ];
    const fallbackPalette = generatePalette(Math.max(count, 1));
    const refs: number[] = [];
    const colors: string[] = [];
    let ptr = 0;
    for (let i = 0; i < count; i += 1) {
      const candidate = preferredOrder[ptr];
      if (candidate !== undefined) {
        refs[i] = candidate;
        colors[i] = themeColors[candidate]!;
        ptr += 1;
      } else {
        colors[i] = fallbackPalette[i % fallbackPalette.length];
      }
    }
    return { refs, colors };
  };

  const assignSegmentColors = (categories: string[], avoidColors: string[]) => {
    const avoidSet = new Set(
      avoidColors
        .filter((color) => Boolean(color))
        .map((color) => color.toLowerCase()),
    );
    const refs: Record<string, number> = {};
    const colors: Record<string, string> = {};
    const candidates = themeColors
      .map((color, idx) => ({ color, idx }))
      .filter(
        ({ color }) =>
          color !== undefined && !avoidSet.has(color.toLowerCase()),
      );
    const fallbackPalette = generatePalette(Math.max(categories.length, 1));
    let themePtr = 0;
    let fallbackPtr = 0;
    categories.forEach((category) => {
      if (themePtr < candidates.length) {
        refs[category] = candidates[themePtr].idx;
        themePtr += 1;
      } else {
        let color = fallbackPalette[fallbackPtr % fallbackPalette.length];
        let guard = 0;
        while (
          avoidSet.has(color.toLowerCase()) &&
          guard < fallbackPalette.length
        ) {
          fallbackPtr += 1;
          color = fallbackPalette[fallbackPtr % fallbackPalette.length];
          guard += 1;
        }
        colors[category] = color;
        fallbackPtr += 1;
      }
    });
    return { refs, colors };
  };

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
        setThemeColors(parsed.themeColors);
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
  }, [setThemeColors, setBackgroundColor]);

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

  const handleDatasetDelete = async (dataset: StoredDataset) => {
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
  };

  async function handleCsvUpload({
    file,
    tableId,
    displayName,
    columns,
    previewRows,
    sourceFilename,
  }: UploadPayload) {
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
  }

  async function sendMessage() {
    if (isSending) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    const currentMessage = input;
    const userMsg = { role: "user", content: currentMessage };
    enqueueMessages((m) => [...m, userMsg]);
    setIsSending(true);

    let clearInput = false;

    try {
      const tableList = uploadedTables
        .map((t) => `- "${t.displayName}" (${t.columns.join(", ")})`)
        .join("\n");
      const body = uploadedTables.length > 0
        ? { message: `You are an AI SQL assistant for DuckDB.\n\nAvailable tables:\n${tableList}\n\nRules:\n- Only use the tables listed above.\n- NEVER invent table names.\n- Always quote column names with double quotes if needed.\n\nUser question:\n${currentMessage}` }
        : { message: currentMessage };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responsePayload = await res.json();
      const reply = isRecord(responsePayload)
        ? getStringField(responsePayload, "reply") ??
          getStringField(responsePayload, "error") ??
          ""
        : "";

      const mBlock = extractBlock(reply, "measure");
      const cBlock = extractBlock(reply, "chart");

    if (mBlock) {
      const validation = validateSqlAgainstTables(mBlock.code, allowedTableLabels);
      if (!validation.ok) {
        const kw = validation.message.match(/Keyword \"([^\"]+)\"/i)?.[1];
        let context = "";
        if (kw) {
          const lower = mBlock.code.toLowerCase();
          const idx = lower.indexOf(kw.toLowerCase());
          if (idx >= 0) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(mBlock.code.length, idx + kw.length + 40);
            context = mBlock.code.slice(start, end);
          }
        }
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: `Measure SQL blocked: ${validation.message}` },
          { role: "system", content: `SQL (blocked measure): ${mBlock.code}` },
          ...(context ? [{ role: "system", content: `Context around keyword: ${context}` }] : []),
        ] as Msg[]);
        return;
      }
      const tableIds = validation.tables
        .map((name) => tableAliasMap[name.toLowerCase()])
        .filter((id): id is string => Boolean(id));
      if (tableIds.length !== validation.tables.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Measure SQL referenced an unknown table id." },
        ]);
        return;
      }
      const executableSql = rewriteSqlTables(mBlock.code, tableAliasMap);
      // Log executed SQL to chat for debugging
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `SQL (measure): ${executableSql}` },
      ]);
      const queryRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: executableSql }),
      });
      const measureResult = await queryRes.json();
      const measureRows = getRowsFromResult(measureResult);
      const measureError = getErrorFromResult(measureResult);
      if (measureRows.length) {
        const firstRow = measureRows[0];
        const firstValue = firstRow ? Object.values(firstRow)[0] : undefined;
        const valueString = firstValue === undefined ? "" : String(firstValue);
        const titleTheme = themeColorToken(0, "#111111");
        const measureTheme = themeColorToken(1, "#0078d4");
        const backgroundTheme = themeColorToken(2, "#ffffff");

        setCards((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            kind: "measure",
            data: { value: valueString },
            settings: {
              titleBackground: {
                title: mBlock.title,
                titleSize: 1.25,
                titleAlign: "center",
                titleColorRef: titleTheme.ref,
                titleColor: titleTheme.color,
                bgColorRef: backgroundTheme.ref,
                bgColor: backgroundTheme.color,
                titleBold: false,
                titleItalic: false,
                titleUnderline: false,
              },
              measureAppearance: {
                fontSize: 3,
                measureAlignX: "center",
                measureAlignY: "center",
                colorRef: measureTheme.ref,
                color: measureTheme.color,
              },
              sql: { code: mBlock.code },
            },
            layout: computeInitialLayout("measure", prev.length),
            sourceTables: tableIds,
          },
        ]);
        enqueueMessages((m) => [
          ...m,
          { role: "assistant", content: "Created a calculation card for you." },
        ]);
        clearInput = true;
      } else if (measureError) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: `SQL error: ${measureError}` },
        ]);
      } else {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Measure query returned no rows." },
        ]);
      }
      return;
    }

    if (cBlock) {
      const validation = validateSqlAgainstTables(cBlock.code, allowedTableLabels);
      if (!validation.ok) {
        const kw = validation.message.match(/Keyword \"([^\"]+)\"/i)?.[1];
        let context = "";
        if (kw) {
          const lower = cBlock.code.toLowerCase();
          const idx = lower.indexOf(kw.toLowerCase());
          if (idx >= 0) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(cBlock.code.length, idx + kw.length + 40);
            context = cBlock.code.slice(start, end);
          }
        }
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: `Chart SQL blocked: ${validation.message}` },
          { role: "system", content: `SQL (blocked chart): ${cBlock.code}` },
          ...(context ? [{ role: "system", content: `Context around keyword: ${context}` }] : []),
        ] as Msg[]);
        return;
      }
      const tableIds = validation.tables
        .map((name) => tableAliasMap[name.toLowerCase()])
        .filter((id): id is string => Boolean(id));
      if (tableIds.length !== validation.tables.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart SQL referenced an unknown table id." },
        ]);
        return;
      }
      const executableSql = rewriteSqlTables(cBlock.code, tableAliasMap);
      // Log executed SQL to chat for debugging
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `SQL (chart): ${executableSql}` },
      ]);
      const queryRes = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: executableSql }),
      });
      const chartResult = await queryRes.json();
      const chartRows = getRowsFromResult(chartResult);
      const chartError = getErrorFromResult(chartResult);
      if (chartRows.length) {
        const { xKey, yKeys } = deriveSeries(chartRows, cBlock.series);
        const finalType = normalizeType(cBlock.type ?? "bar", yKeys.length);
        const titleTheme = themeColorToken(0, "#111111");
        const backgroundTheme = themeColorToken(2, "#ffffff");
        const {
          refs: initialSeriesRefs,
          colors: initialSeriesColors,
        } = assignSeriesColors(yKeys.length, backgroundTheme.ref, backgroundTheme.value);
        const segmentCategories = xKey
          ? Array.from(new Set(chartRows.map((row) => String(row[xKey] ?? ""))))
          : [];
        const segmentConfig =
          finalType === "pie"
            ? assignSegmentColors(
                segmentCategories,
                backgroundTheme.value ? [backgroundTheme.value] : [],
              )
            : { refs: {}, colors: {} };
        setCards((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            kind: "chart",
            data: { rows: chartRows, xKey, series: yKeys },
            settings: {
              titleBackground: {
                title: cBlock.title,
                titleSize: 1.25,
                titleAlign: "center",
                titleColorRef: titleTheme.ref,
                titleColor: titleTheme.color,
                bgColorRef: backgroundTheme.ref,
                bgColor: backgroundTheme.color,
                titleBold: false,
                titleItalic: false,
                titleUnderline: false,
              },
              graph: {
                chartType: finalType === "stackedbar" ? "bar" : finalType,
                barLayout: finalType === "stackedbar" ? "stacked" : "grouped",
              },
              axes: { axisTitleSize: 1, labelSize: 0.9 },
              legend: {
                legendSize: 0.9,
                seriesDisplayNames: yKeys.map(() => ""),
                seriesColors: initialSeriesColors,
                seriesColorRefs: initialSeriesRefs,
                segmentColorEnabled: finalType === "pie",
                segmentColorRefs: segmentConfig.refs,
                segmentColors: segmentConfig.colors,
              },
              sql: { code: cBlock.code },
            },
            layout: computeInitialLayout("chart", prev.length),
            sourceTables: tableIds,
          },
        ]);
        enqueueMessages((m) => [
          ...m,
          { role: "assistant", content: "Created a chart for you." },
        ]);
        clearInput = true;
      } else if (chartError) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: `SQL error: ${chartError}` },
        ]);
      } else {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart query returned no rows." },
        ]);
      }
      return;
    }

    enqueueMessages((m) => [...m, { role: "assistant", content: reply }]);
      clearInput = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `Request failed: ${message}` },
      ]);
    } finally {
      if (clearInput) setInput("");
      setIsSending(false);
    }
  }

  return (
    <main
      className={styles.main}
      onClick={handleBackgroundClick}
      style={{ backgroundColor }}
    >
      {cards.map((card) => (
        <CardContainer
          key={card.id}
          card={card}
          selectedId={selectedCardId}
          setSelectedId={setSelectedCardId}
          onChange={(next) =>
            queueMicrotask(() =>
              setCards((prev) => prev.map((c) => (c.id === next.id ? next : c))),
            )
          }
          onDelete={(id) =>
            queueMicrotask(() => {
              setCards((prev) => prev.filter((c) => c.id !== id));
              setSelectedCardId((prev) => (prev === id ? null : prev));
            })
          }
          allowedTables={allowedTableLabels}
          tableNameMap={tableAliasMap}
        />
      ))}

      <ThemeManager />
      <CsvUploader
        datasets={datasets}
        setDatasets={setDatasets}
        isHydrating={!hasHydratedState}
        onUpload={handleCsvUpload}
        onDeleteDataset={handleDatasetDelete}
      />
      <ChatPanel
        messages={messages}
        input={input}
        setInput={setInput}
        onSend={sendMessage}
        hasDataset={uploadedTables.length > 0}
        isSending={isSending}
      />
    </main>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <HomeContent />
    </ThemeProvider>
  );
}

