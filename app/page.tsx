"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Undo2, Redo2 } from "lucide-react";
import dynamic from "next/dynamic";
import CardContainer from "@/components/Card/CardContainer";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ensureSegmentColors } from "@/components/Card/Settings/utils/settingsUtils";
import {
  applyFormattingSnapshot,
  buildFormattingSnapshot,
  type FormatClipboard,
} from "@/lib/cardFormatting";
import { useBoardViewport, BOARD_WIDTH, BOARD_HEIGHT } from "@/hooks/useBoardViewport";
import { useChatOrchestrator } from "@/hooks/useChatOrchestrator";
import { useDashboardState } from "@/hooks/useDashboardState";
import type { Msg, Card } from "@/types";
import { useCardHistory } from "@/hooks/useCardHistory";
import { useCardSqlActions } from "@/hooks/useCardSqlActions";
import { useCardCreation } from "@/hooks/useCardCreation";
import { useAssistantPatches } from "@/hooks/useAssistantPatches";
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

const BLOCKED_KEYWORD_REGEX = /Keyword "([^"]+)"/i;

function HomeContent() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef<Card[]>([]);
  const [formatClipboard, setFormatClipboard] = useState<FormatClipboard | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const { undoStack, redoStack, handleUndo, handleRedo, handleRecordPatch } = useCardHistory({
    setCards,
    setFormatClipboard,
  });

  const { applyAssistantPatches } = useAssistantPatches({
    cardsRef,
    setCards,
    selectedCardId,
    setFormatClipboard,
    handleRecordPatch,
  });

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

  const { refreshCardsSql } = useCardSqlActions({
    allowedTableLabels,
    tableAliasMap,
    dataEngineBaseUrl,
    enqueueMessages,
    reportValidationError,
    setCards,
    cardsRef,
    selectedCardId,
    themeColors,
  });

  const { runMeasureCreation, runChartCreation } = useCardCreation({
    allowedTableLabels,
    tableAliasMap,
    dataEngineBaseUrl,
    enqueueMessages,
    reportValidationError,
    setCards,
    themeColors,
    boardState,
    boardViewportRef,
  });

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
      <div className={styles.brandAnchor}>
        <div className={styles.brandLogo} aria-label="dvizzi home">
          <span className={styles.brandGlyph}>dv</span>
          <span className={styles.brandWord}>dvizzi</span>
        </div>
      </div>
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
