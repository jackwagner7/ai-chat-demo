"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { type PatchBlock } from "@/lib/aiHelpers";
import { deriveSeries, normalizeType, generatePalette } from "@/lib/chartHelpers";
import dynamic from "next/dynamic";
import CardContainer from "@/components/Card/CardContainer";
import { validateSqlAgainstTables, rewriteSqlTables } from "@/lib/sqlValidation";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import {
  SCALED_CARD_GAPS,
  SCALED_CARD_MIN,
  SCALED_CARD_POSITION,
  SCALED_CARD_SIZES,
  scaleLayout,
} from "@/lib/uiScale";
import {
  applyFormattingSnapshot,
  buildFormattingSnapshot,
  seedCardFormatting,
  type FormatClipboard,
} from "@/lib/cardFormatting";
import {
  computeCardPlacement,
  getViewportBoardRect,
} from "@/lib/cardPlacement";
import {
  applyCardPatch,
  createLayoutPatch,
  createSettingsPatch,
  type CardPatch,
} from "@/lib/cardPatches";
import { ensureSeriesDisplayNames, ensureSegmentColors } from "@/components/Card/Settings/Components/settingsUtils";
import { useBoardViewport, BOARD_WIDTH, BOARD_HEIGHT } from "@/hooks/useBoardViewport";
import {
  useChatOrchestrator,
  type ChartCreationRequest,
  type MeasureCreationRequest,
} from "@/hooks/useChatOrchestrator";
import { useDashboardState } from "@/hooks/useDashboardState";
import { getRowsFromResult, getErrorFromResult } from "@/lib/resultParsers";
import type {
  Msg,
  Card,
  CardKind,
  CardLayout,
} from "@/types";
import styles from "./page.module.css";

const ThemeManager = dynamic(
  () => import("@/components/ThemeManager"),
  { loading: () => null, ssr: false },
) as typeof import("@/components/ThemeManager").default;

const CsvUploader = dynamic(
  () => import("@/components/CsvUploader"),
  { loading: () => null, ssr: false },
) as typeof import("@/components/CsvUploader").default;

const ChatPanel = dynamic(
  () => import("@/components/ChatPanel"),
  { loading: () => null, ssr: false },
) as typeof import("@/components/ChatPanel").default;

const CARD_GRID_COLUMNS = 3;
const CARD_HORIZONTAL_GAP = SCALED_CARD_GAPS.horizontal;
const CARD_VERTICAL_GAP = SCALED_CARD_GAPS.vertical;
const BLOCKED_KEYWORD_REGEX = /Keyword "([^"]+)"/i;

const DEFAULT_CARD_SIZES: Record<CardKind, { width: number; height: number }> = SCALED_CARD_SIZES;

const DEFAULT_CARD_POSITION = SCALED_CARD_POSITION;
const DEFAULT_COLUMN_WIDTH = DEFAULT_CARD_SIZES.chart.width + CARD_HORIZONTAL_GAP;
const DEFAULT_ROW_HEIGHT = DEFAULT_CARD_SIZES.chart.height + CARD_VERTICAL_GAP;

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

const cloneCard = (card: Card): Card =>
  typeof structuredClone === "function"
    ? structuredClone(card)
    : (JSON.parse(JSON.stringify(card)) as Card);

const applyPatchInstructionToCard = (card: Card, instruction: PatchBlock): Card | null => {
  let changed = false;
  const draft = cloneCard(card);

  if (instruction.layout) {
    draft.layout = { ...draft.layout, ...instruction.layout };
    changed = true;
  }

  if (instruction.titleBackground) {
    draft.settings.titleBackground = {
      ...draft.settings.titleBackground,
      ...instruction.titleBackground,
    };
    changed = true;
  }

  if (instruction.measureAppearance && draft.kind === "measure") {
    draft.settings.measureAppearance = {
      ...draft.settings.measureAppearance,
      ...instruction.measureAppearance,
    };
    changed = true;
  }

  if (draft.kind === "chart") {
    if (instruction.graph) {
      draft.settings.graph = {
        ...draft.settings.graph,
        ...instruction.graph,
      };
      changed = true;
    }

    if (instruction.axes) {
      draft.settings.axes = {
        ...draft.settings.axes,
        ...instruction.axes,
      };
      changed = true;
    }

    if (instruction.legend) {
      draft.settings.legend = {
        ...draft.settings.legend,
        ...instruction.legend,
      };
      changed = true;
    }
  }

  if (instruction.sql) {
    draft.settings.sql = {
      ...draft.settings.sql,
      ...instruction.sql,
    };
    changed = true;
  }

  return changed ? draft : null;
};


function HomeContent() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef<Card[]>([]);
  const [formatClipboard, setFormatClipboard] = useState<FormatClipboard | null>(null);
  const [undoStack, setUndoStack] = useState<CardPatch[]>([]);
  const [redoStack, setRedoStack] = useState<CardPatch[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const {
    boardViewportRef,
    boardSurfaceRef,
    boardState,
    spacePressed,
    isBoardDragging,
    handleBoardPointerDown,
    handleBoardPointerMove,
    handleBoardPointerUp,
    handleZoomIn,
    handleZoomOut,
    zoomPercent,
  } = useBoardViewport();

  const enqueueMessages = (updater: Msg[] | ((prev: Msg[]) => Msg[])) => {
    const runUpdate = () => setMessages(updater);
    if (typeof queueMicrotask === "function") {
      queueMicrotask(runUpdate);
    } else {
      Promise.resolve().then(runUpdate);
    }
  };

  const { themeColors, setThemeColors, backgroundColor, setBackgroundColor } = useTheme();

  const applyPatchToCards = useCallback(
    (patch: CardPatch, mode: "before" | "after") => {
      setCards((prev) => applyCardPatch(prev, patch, mode));
      setFormatClipboard((prev) =>
        prev?.sourceCardId === patch.cardId ? null : prev,
      );
    },
    [setCards],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      const nextUndo = prev.slice(0, -1);
      const patch = prev[prev.length - 1];
      setRedoStack((redo) => [...redo, patch]);
      applyPatchToCards(patch, "before");
      return nextUndo;
    });
  }, [applyPatchToCards]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const nextRedo = prev.slice(0, -1);
      const patch = prev[prev.length - 1];
      setUndoStack((undo) => [...undo, patch]);
      applyPatchToCards(patch, "after");
      return nextRedo;
    });
  }, [applyPatchToCards]);

  const {
    datasets,
    setDatasets,
    uploadedTables,
    hasHydratedState,
    handleDatasetDelete,
    handleCsvUpload,
  } = useDashboardState({
    cards,
    setCards,
    setSelectedCardId,
    enqueueMessages,
    themeColors,
    setThemeColors,
    backgroundColor,
    setBackgroundColor,
    ensureCardLayout,
  });

  useEffect(() => {
    if (!hasHydratedState) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCards((prev) => {
      let changed = false;
      const next = prev.map((card) => {
        if (card.kind !== "chart") return card;
        const chartType = (card.settings.graph.chartType || "").toLowerCase();
        if (chartType !== "pie") return card;
        const legend = card.settings.legend;
        const hasAssignments =
          (legend.segmentColorRefs && Object.keys(legend.segmentColorRefs).length > 0) ||
          (legend.segmentColors && Object.keys(legend.segmentColors).length > 0);
        if (legend.segmentColorEnabled && hasAssignments) return card;

        const xKey = card.data.xKey;
        const categories = xKey
          ? Array.from(new Set(card.data.rows.map((row) => String(row?.[xKey] ?? ""))))
          : card.data.rows.map((_, idx) => idx.toString());

        const bgColor =
          card.settings.titleBackground.bgColorRef !== undefined
            ? themeColors[card.settings.titleBackground.bgColorRef]
            : card.settings.titleBackground.bgColor;
        const avoidColors = bgColor ? [bgColor.toLowerCase()] : [];

        const updated: Card = {
          ...card,
          settings: {
            ...card.settings,
            legend: {
              ...card.settings.legend,
              segmentColorEnabled: true,
              segmentColorRefs: { ...(card.settings.legend.segmentColorRefs ?? {}) },
              segmentColors: { ...(card.settings.legend.segmentColors ?? {}) },
            },
          },
        };

        ensureSegmentColors(
          updated as Extract<Card, { kind: "chart" }>,
          categories,
          themeColors,
          avoidColors,
        );

        changed = true;
        return updated;
      });
      return changed ? next : prev;
    });
  }, [cards, hasHydratedState, setCards, themeColors]);

  const handleBackgroundClick = () => setSelectedCardId(null);

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

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

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

  const dataEngineBaseUrl = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_DATA_ENGINE_API;
    if (!url) return "";
    return url.replace(/\/$/, "");
  }, []);

  const reportValidationError = useCallback(
    (scope: "measure" | "chart", message: string, sqlText: string) => {
      const label = scope === "measure" ? "Measure" : "Chart";
      const kw = message.match(BLOCKED_KEYWORD_REGEX)?.[1];
      let context = "";
      if (kw) {
        const lower = sqlText.toLowerCase();
        const idx = lower.indexOf(kw.toLowerCase());
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(sqlText.length, idx + kw.length + 40);
          context = sqlText.slice(start, end);
        }
      }
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `${label} SQL blocked: ${message}` },
        { role: "system", content: `SQL (blocked ${scope}): ${sqlText}` },
        ...(context ? [{ role: "system", content: `Context around keyword: ${context}` }] : []),
      ] as Msg[]);
    },
    [enqueueMessages],
  );

  const updateMeasureCardSql = useCallback(
    async (card: Card, sqlInstruction: PatchBlock["sql"]) => {
      if (card.kind !== "measure" || !sqlInstruction?.code) return false;
      const sqlCode = sqlInstruction.code;
      const validation = validateSqlAgainstTables(sqlCode, allowedTableLabels);
      if (!validation.ok) {
        reportValidationError("measure", validation.message, sqlCode);
        return false;
      }
      const tableIds = validation.tables
        .map((name) => tableAliasMap[name.toLowerCase()])
        .filter((id): id is string => Boolean(id));
      if (tableIds.length !== validation.tables.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Measure SQL referenced an unknown table id." },
        ]);
        return false;
      }
      if (!dataEngineBaseUrl) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Data engine URL is not configured." },
        ]);
        return false;
      }
      const executableSql = rewriteSqlTables(sqlCode, tableAliasMap);
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `SQL (measure): ${executableSql}` },
      ]);
      let payload: unknown;
      try {
        const queryRes = await fetch(`${dataEngineBaseUrl}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: executableSql }),
        });
        payload = await queryRes.json();
      } catch (error) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Measure SQL execution failed." },
        ]);
        return false;
      }
      const measureRows = getRowsFromResult(payload);
      const measureError = getErrorFromResult(payload);
      if (!measureRows.length) {
        enqueueMessages((m) => [
          ...m,
          {
            role: "system",
            content: measureError ? `SQL error: ${measureError}` : "Measure query returned no rows.",
          },
        ]);
        return false;
      }
      const firstRow = measureRows[0];
      const firstValue = firstRow ? Object.values(firstRow)[0] : undefined;
      const valueString = firstValue === undefined ? "" : String(firstValue);
      setCards((prev) =>
        prev.map((entry) => {
          if (entry.id !== card.id || entry.kind !== "measure") return entry;
          return {
            ...entry,
            data: { value: valueString },
            sourceTables: tableIds,
            settings: {
              ...entry.settings,
              sql: {
                ...entry.settings.sql,
                code: sqlCode,
                prompt: sqlInstruction.prompt ?? entry.settings.sql.prompt,
              },
            },
          };
        }),
      );
      return true;
    },
    [allowedTableLabels, tableAliasMap, dataEngineBaseUrl, enqueueMessages, reportValidationError],
  );

  const updateChartCardSql = useCallback(
    async (card: Card, sqlInstruction: PatchBlock["sql"], explicitSeries?: string[]) => {
      if (card.kind !== "chart" || !sqlInstruction?.code) return false;
      const sqlCode = sqlInstruction.code;
      const validation = validateSqlAgainstTables(sqlCode, allowedTableLabels);
      if (!validation.ok) {
        reportValidationError("chart", validation.message, sqlCode);
        return false;
      }
      const tableIds = validation.tables
        .map((name) => tableAliasMap[name.toLowerCase()])
        .filter((id): id is string => Boolean(id));
      if (tableIds.length !== validation.tables.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart SQL referenced an unknown table id." },
        ]);
        return false;
      }
      if (!dataEngineBaseUrl) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Data engine URL is not configured." },
        ]);
        return false;
      }
      const executableSql = rewriteSqlTables(sqlCode, tableAliasMap);
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `SQL (chart): ${executableSql}` },
      ]);
      let payload: unknown;
      try {
        const queryRes = await fetch(`${dataEngineBaseUrl}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: executableSql }),
        });
        payload = await queryRes.json();
      } catch (error) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart SQL execution failed." },
        ]);
        return false;
      }
      const chartRows = getRowsFromResult(payload);
      const chartError = getErrorFromResult(payload);
      if (!chartRows.length) {
        enqueueMessages((m) => [
          ...m,
          {
            role: "system",
            content: chartError ? `SQL error: ${chartError}` : "Chart query returned no rows.",
          },
        ]);
        return false;
      }
      const { xKey, yKeys } = deriveSeries(chartRows, explicitSeries ?? []);
      if (!yKeys.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart SQL did not return any numeric series." },
        ]);
        return false;
      }
      setCards((prev) =>
        prev.map((entry) => {
          if (entry.id !== card.id || entry.kind !== "chart") return entry;
          const updated: Card = {
            ...entry,
            data: { rows: chartRows, xKey, series: yKeys },
            sourceTables: tableIds,
            settings: {
              ...entry.settings,
              sql: {
                ...entry.settings.sql,
                code: sqlCode,
                prompt: sqlInstruction.prompt ?? entry.settings.sql.prompt,
              },
            },
          };
          ensureSeriesDisplayNames(updated as Extract<Card, { kind: "chart" }>, yKeys);
          if (updated.settings.legend.segmentColorEnabled) {
            const categories = xKey
              ? Array.from(new Set(chartRows.map((row) => String(row?.[xKey] ?? ""))))
              : [];
            const bgColor =
              updated.settings.titleBackground.bgColorRef !== undefined
                ? themeColors[updated.settings.titleBackground.bgColorRef]
                : updated.settings.titleBackground.bgColor;
            const avoidColors = bgColor ? [bgColor.toLowerCase()] : [];
            ensureSegmentColors(
              updated as Extract<Card, { kind: "chart" }>,
              categories,
              themeColors,
              avoidColors,
            );
          }
          return updated;
        }),
      );
      return true;
    },
    [allowedTableLabels, tableAliasMap, dataEngineBaseUrl, enqueueMessages, reportValidationError, themeColors],
  );

  const refreshCardsSql = useCallback(
    async (instructions: PatchBlock[]): Promise<boolean> => {
      const sqlInstructions = instructions.filter((instruction) => instruction.sql?.code);
      if (!sqlInstructions.length) return false;
      let ranAny = false;
      for (const instruction of sqlInstructions) {
        let targetId = instruction.cardId?.trim();
        if (!targetId) continue;
        if (targetId.toLowerCase() === "selected") {
          if (!selectedCardId) continue;
          targetId = selectedCardId;
        }
        const targetCard = cardsRef.current.find((entry) => entry.id === targetId);
        if (!targetCard) continue;
        if (targetCard.kind === "measure") {
          const ran = await updateMeasureCardSql(targetCard, instruction.sql);
          ranAny = ran || ranAny;
        } else {
          const ran = await updateChartCardSql(targetCard, instruction.sql, instruction.series);
          ranAny = ran || ranAny;
        }
      }
      return ranAny;
    },
    [selectedCardId, updateMeasureCardSql, updateChartCardSql],
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


  const handleRecordPatch = useCallback((patch: CardPatch) => {
    setUndoStack((prev) => [...prev, patch]);
    setRedoStack([]);
  }, []);

  const applyAssistantPatches = useCallback(
    (instructions: PatchBlock[]) => {
      const targetInstructions = instructions.filter(
        (instruction) => typeof instruction.cardId === "string" && instruction.cardId.trim().length,
      );
      if (!targetInstructions.length) return false;

      const layoutPatches: CardPatch[] = [];
      const settingsPatches: CardPatch[] = [];
      const touchedIds = new Set<string>();

      const resolveTargetCard = (stateCards: Card[], instruction: PatchBlock): Card | undefined => {
        const idToken = instruction.cardId?.trim();
        if (idToken) {
          if (idToken.toLowerCase() === "selected" && selectedCardId) {
            const selected = stateCards.find((entry) => entry.id === selectedCardId);
            if (selected) return selected;
          }
          const direct = stateCards.find((entry) => entry.id === idToken);
          if (direct) return direct;
        }

        const titleToken = instruction.cardTitle?.trim().toLowerCase();
        if (titleToken) {
          const byTitle = stateCards.find(
            (entry) =>
              (entry.settings.titleBackground.title || "").trim().toLowerCase() === titleToken,
          );
          if (byTitle) return byTitle;
        }

        if (selectedCardId) {
          return stateCards.find((entry) => entry.id === selectedCardId);
        }
        return undefined;
      };

      setCards((prev) => {
        let changed = false;
        const next = [...prev];

        targetInstructions.forEach((instruction) => {
          const target = resolveTargetCard(next, instruction);
          if (!target) return;
          const updated = applyPatchInstructionToCard(target, instruction);
          if (!updated) return;

          const layoutPatch = createLayoutPatch(target, target.layout, updated.layout);
          const settingsPatch = createSettingsPatch(target, updated);
          if (layoutPatch) layoutPatches.push(layoutPatch);
          if (settingsPatch) settingsPatches.push(settingsPatch);

          if (layoutPatch || settingsPatch) {
            const idx = next.findIndex((entry) => entry.id === target.id);
            if (idx !== -1) {
              next[idx] = updated;
              touchedIds.add(target.id);
              changed = true;
            }
          }
        });

        if (changed) {
          cardsRef.current = next;
          return next;
        }
        return prev;
      });

      if (!touchedIds.size) return false;

      setFormatClipboard((prev) =>
        prev && touchedIds.has(prev.sourceCardId) ? null : prev,
      );

      [...layoutPatches, ...settingsPatches].forEach((patch) => {
        if (patch) handleRecordPatch(patch);
      });

      return true;
    },
    [handleRecordPatch, selectedCardId, setFormatClipboard],
  );

  const deleteCardById = useCallback((id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
    setSelectedCardId((prev) => (prev === id ? null : prev));
    setFormatClipboard((prev) => (prev?.sourceCardId === id ? null : prev));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      if (selectedCardId) {
        event.preventDefault();
        deleteCardById(selectedCardId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCardId, deleteCardById]);

  const runMeasureCreation = useCallback(
    async ({
      title,
      sqlCode,
      promptOverride,
      overrides,
    }: MeasureCreationRequest) => {
      const validation = validateSqlAgainstTables(sqlCode, allowedTableLabels);
      if (!validation.ok) {
        reportValidationError("measure", validation.message, sqlCode);
        return false;
      }
      const tableIds = validation.tables
        .map((name) => tableAliasMap[name.toLowerCase()])
        .filter((id): id is string => Boolean(id));
      if (tableIds.length !== validation.tables.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Measure SQL referenced an unknown table id." },
        ]);
        return false;
      }
      if (!dataEngineBaseUrl) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Data engine URL is not configured." },
        ]);
        return false;
      }

      const executableSql = rewriteSqlTables(sqlCode, tableAliasMap);
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `SQL (measure): ${executableSql}` },
      ]);

      let measureResult: unknown;
      try {
        const queryRes = await fetch(`${dataEngineBaseUrl}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: executableSql }),
        });
        measureResult = await queryRes.json();
      } catch (error) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Measure SQL execution failed." },
        ]);
        return false;
      }

      const measureRows = getRowsFromResult(measureResult);
      const measureError = getErrorFromResult(measureResult);
      if (!measureRows.length) {
        enqueueMessages((m) => [
          ...m,
          {
            role: "system",
            content: measureError ? `SQL error: ${measureError}` : "Measure query returned no rows.",
          },
        ]);
        return false;
      }

      const firstRow = measureRows[0];
      const firstValue = firstRow ? Object.values(firstRow)[0] : undefined;
      const valueString = firstValue === undefined ? "" : String(firstValue);
      const titleTheme = themeColorToken(0, "#111111");
      const measureTheme = themeColorToken(1, "#0078d4");
      const backgroundTheme = themeColorToken(2, "#ffffff");
      const viewportRect = getViewportBoardRect(boardViewportRef.current, boardState);

      setCards((prev) => {
        const baseCard: Card = {
          id: crypto.randomUUID(),
          kind: "measure",
          data: { value: valueString },
          settings: {
            titleBackground: {
              title,
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
            sql: { code: sqlCode, prompt: promptOverride },
          },
          layout: computeInitialLayout("measure", prev.length),
          sourceTables: tableIds,
        };
        let composed = seedCardFormatting(baseCard, prev);
        if (overrides) {
          const patched = applyPatchInstructionToCard(composed, overrides);
          if (patched) composed = patched;
        }
        const placement = computeCardPlacement(composed, prev, viewportRect);
        const layoutOverride = overrides?.layout ?? {};
        composed.layout = {
          ...composed.layout,
          x: layoutOverride.x ?? placement.x,
          y: layoutOverride.y ?? placement.y,
          width: layoutOverride.width ?? placement.width,
          height: layoutOverride.height ?? placement.height,
        };
        return [...prev, composed];
      });

      enqueueMessages((m) => [
        ...m,
        { role: "assistant", content: "Created a calculation card for you." },
      ]);
      return true;
    },
    [
      allowedTableLabels,
      applyPatchInstructionToCard,
      boardState,
      boardViewportRef,
      computeCardPlacement,
      enqueueMessages,
      reportValidationError,
      rewriteSqlTables,
      seedCardFormatting,
      tableAliasMap,
      themeColorToken,
      dataEngineBaseUrl,
      setCards,
    ],
  );

  const runChartCreation = useCallback(
    async ({
      title,
      requestedType,
      sqlCode,
      promptOverride,
      overrides,
      explicitSeries,
    }: ChartCreationRequest) => {
      const validation = validateSqlAgainstTables(sqlCode, allowedTableLabels);
      if (!validation.ok) {
        reportValidationError("chart", validation.message, sqlCode);
        return false;
      }
      const tableIds = validation.tables
        .map((name) => tableAliasMap[name.toLowerCase()])
        .filter((id): id is string => Boolean(id));
      if (tableIds.length !== validation.tables.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart SQL referenced an unknown table id." },
        ]);
        return false;
      }
      if (!dataEngineBaseUrl) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Data engine URL is not configured." },
        ]);
        return false;
      }

      const executableSql = rewriteSqlTables(sqlCode, tableAliasMap);
      enqueueMessages((m) => [
        ...m,
        { role: "system", content: `SQL (chart): ${executableSql}` },
      ]);

      let chartResult: unknown;
      try {
        const queryRes = await fetch(`${dataEngineBaseUrl}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: executableSql }),
        });
        chartResult = await queryRes.json();
      } catch (error) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart SQL execution failed." },
        ]);
        return false;
      }

      const chartRows = getRowsFromResult(chartResult);
      const chartError = getErrorFromResult(chartResult);
      if (!chartRows.length) {
        enqueueMessages((m) => [
          ...m,
          {
            role: "system",
            content: chartError ? `SQL error: ${chartError}` : "Chart query returned no rows.",
          },
        ]);
        return false;
      }

      const { xKey, yKeys } = deriveSeries(chartRows, explicitSeries ?? []);
      if (!yKeys.length) {
        enqueueMessages((m) => [
          ...m,
          { role: "system", content: "Chart query did not yield any numeric series." },
        ]);
        return false;
      }

      const requested = (overrides?.graph?.chartType ?? requestedType ?? "bar") as string;
      const finalType = normalizeType(requested, yKeys.length);
      const titleTheme = themeColorToken(0, "#111111");
      const backgroundTheme = themeColorToken(2, "#ffffff");
      const {
        refs: initialSeriesRefs,
        colors: initialSeriesColors,
      } = assignSeriesColors(yKeys.length, backgroundTheme.ref, backgroundTheme.value);
      const segmentCategories = xKey
        ? Array.from(new Set(chartRows.map((row) => String(row?.[xKey] ?? ""))))
        : [];
      const segmentConfig =
        finalType === "pie"
          ? assignSegmentColors(
              segmentCategories,
              backgroundTheme.value ? [backgroundTheme.value] : [],
            )
          : { refs: {}, colors: {} };
      const viewportRect = getViewportBoardRect(boardViewportRef.current, boardState);

      setCards((prev) => {
        const baseCard: Card = {
          id: crypto.randomUUID(),
          kind: "chart",
          data: { rows: chartRows, xKey, series: yKeys },
          settings: {
            titleBackground: {
              title,
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
            sql: { code: sqlCode, prompt: promptOverride },
          },
          layout: computeInitialLayout("chart", prev.length),
          sourceTables: tableIds,
        };
        let composed = seedCardFormatting(baseCard, prev);
        if (overrides) {
          const patched = applyPatchInstructionToCard(composed, overrides);
          if (patched) composed = patched;
        }
        const placement = computeCardPlacement(composed, prev, viewportRect);
        const layoutOverride = overrides?.layout ?? {};
        composed.layout = {
          ...composed.layout,
          x: layoutOverride.x ?? placement.x,
          y: layoutOverride.y ?? placement.y,
          width: layoutOverride.width ?? placement.width,
          height: layoutOverride.height ?? placement.height,
        };
        return [...prev, composed];
      });

      enqueueMessages((m) => [
        ...m,
        { role: "assistant", content: "Created a chart for you." },
      ]);
      return true;
    },
    [
      allowedTableLabels,
      applyPatchInstructionToCard,
      assignSegmentColors,
      assignSeriesColors,
      boardState,
      boardViewportRef,
      computeCardPlacement,
      deriveSeries,
      enqueueMessages,
      normalizeType,
      reportValidationError,
      rewriteSqlTables,
      seedCardFormatting,
      tableAliasMap,
      themeColorToken,
      dataEngineBaseUrl,
      setCards,
    ],
  );

  const {
    input,
    setInput,
    isSending,
    sendMessage,
    includeAllCards,
    toggleIncludeAllCards,
    tokenEstimate,
  } = useChatOrchestrator({
    enqueueMessages,
    uploadedTables,
    cards,
    selectedCardId,
    applyAssistantPatches,
    refreshCardsSql,
    runMeasureCreation,
    runChartCreation,
  });

  const handleCopyFormatting = useCallback((cardToCopy: Card) => {
    setFormatClipboard({
      sourceCardId: cardToCopy.id,
      snapshot: buildFormattingSnapshot(cardToCopy),
    });
  }, []);

  const handlePasteFormatting = useCallback(
    (targetCard: Card) => {
      if (!formatClipboard) return;
      const updated = applyFormattingSnapshot(targetCard, formatClipboard.snapshot);
      queueMicrotask(() =>
        setCards((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry))),
      );
    },
    [formatClipboard],
  );

  const boardSurfaceClassName = [
    styles.boardSurface,
    spacePressed && !isBoardDragging ? styles.boardSurfaceGrab : "",
    isBoardDragging ? styles.boardSurfaceGrabbing : "",
  ]
    .filter(Boolean)
    .join(" ");

  const boardBaseColor = backgroundColor || "#f7f4ee";

  return (
    <main
      className={styles.main}
      onClick={handleBackgroundClick}
    >
      <div
        className={styles.boardViewport}
        ref={boardViewportRef}
      >
        <div
          ref={boardSurfaceRef}
          className={boardSurfaceClassName}
          style={{
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            transform: `translate3d(${boardState.x}px, ${boardState.y}px, 0) scale(${boardState.scale})`,
            backgroundColor: boardBaseColor,
            "--board-base-color": boardBaseColor,
          } as CSSProperties}
          onPointerDown={handleBoardPointerDown}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handleBoardPointerUp}
          onPointerCancel={handleBoardPointerUp}
        >
          {cards.map((card) => (
      <CardContainer
        key={card.id}
        card={card}
        selectedId={selectedCardId}
        setSelectedId={setSelectedCardId}
              onChange={(next) =>
                queueMicrotask(() => {
                  setCards((prev) => prev.map((c) => (c.id === next.id ? next : c)));
                  setFormatClipboard((prev) =>
                    prev?.sourceCardId === next.id ? null : prev,
                  );
                })
              }
        onDelete={deleteCardById}
              allowedTables={allowedTableLabels}
              tableNameMap={tableAliasMap}
              boardScale={boardState.scale}
              onCopyFormatting={() => handleCopyFormatting(card)}
              onPasteFormatting={
                formatClipboard && formatClipboard.sourceCardId !== card.id
                  ? () => handlePasteFormatting(card)
                  : null
              }
              formatCopied={formatClipboard?.sourceCardId === card.id}
              onRecordPatch={handleRecordPatch}
            />
          ))}
        </div>
        <div className={styles.zoomIndicator}>
          <div className={styles.zoomBox} aria-label="Zoom controls">
            <button
              type="button"
              className={styles.zoomButton}
              onClick={handleZoomOut}
              aria-label="Zoom out"
            >
              &minus;
            </button>
            <span className={styles.zoomValue}>{zoomPercent}%</span>
            <button
              type="button"
              className={styles.zoomButton}
              onClick={handleZoomIn}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <div className={styles.historyBox} aria-label="History controls">
            <button
              type="button"
              className={styles.historyButton}
              onClick={handleUndo}
              aria-label="Undo"
              disabled={!undoStack.length}
            >
              <Undo2 size={18} />
            </button>
            <button
              type="button"
              className={styles.historyButton}
              onClick={handleRedo}
              aria-label="Redo"
              disabled={!redoStack.length}
            >
              <Redo2 size={18} />
            </button>
          </div>
        </div>
      </div>

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
        globalContextEnabled={includeAllCards}
        onToggleGlobalContext={toggleIncludeAllCards}
        tokenEstimate={tokenEstimate}
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
