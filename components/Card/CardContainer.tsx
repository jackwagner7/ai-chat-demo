"use client";
import {
  memo,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { useTheme } from "@/context/ThemeContext";
import type { Card } from "@/types";
import {
  SCALED_CARD_MIN,
  SCALED_CARD_POSITION,
  SCALED_CARD_SIZES,
} from "@/lib/uiScale";
import CardView from "./CardView";
import CardSettings from "./Settings/CardSettings";
import { createLayoutPatch, createSettingsPatch, type CardPatch } from "@/lib/cardPatches";

const layoutsEqual = (a: Card["layout"], b: Card["layout"]) =>
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height;

type CardContainerProps = {
  card: Card;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onChange: (next: Card) => void;
  onDelete: (id: string) => void;
  allowedTables: string[];
  tableNameMap: Record<string, string>;
  boardScale: number;
  onCopyFormatting: () => void;
  onPasteFormatting?: (() => void) | null;
  formatCopied?: boolean;
  onRecordPatch?: (patch: CardPatch) => void;
};

function CardContainer({
  card,
  selectedId,
  setSelectedId,
  onChange,
  onDelete,
  allowedTables,
  tableNameMap,
  boardScale,
  onCopyFormatting,
  onPasteFormatting,
  formatCopied = false,
  onRecordPatch,
}: CardContainerProps) {
  const isSelected = selectedId === card.id;
  const [isInteracting, setIsInteracting] = useState(false);
  const [showSettings, setShowSettings] = useState<boolean>(isSelected);
  const [closingSettings, setClosingSettings] = useState<boolean>(false);
  const { themeColors } = useTheme();
  const dragStartedRef = useRef(false);
  const dragStartLayoutRef = useRef<Card["layout"] | null>(null);
  const scheduleStateUpdate = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
      return;
    }
    Promise.resolve().then(fn);
  }, []);

  const bg =
    card.settings.titleBackground.bgColorRef !== undefined
      ? themeColors[card.settings.titleBackground.bgColorRef] || "#fff"
      : card.settings.titleBackground.bgColor || "#fff";

  type Size = { width: number; height: number };

  const defaultMinSize = useMemo<Size>(
    () => (card.kind === "measure" ? SCALED_CARD_MIN.measure : SCALED_CARD_MIN.chart),
    [card.kind],
  );

  const [customMinSize, setCustomMinSize] = useState<{
    cardId: string;
    size: Size;
  } | null>(null);
  const layoutFallback = useMemo(
    () => ({
      x: SCALED_CARD_POSITION.x,
      y: SCALED_CARD_POSITION.y,
      width: card.kind === "measure" ? SCALED_CARD_SIZES.measure.width : SCALED_CARD_SIZES.chart.width,
      height: card.kind === "measure" ? SCALED_CARD_SIZES.measure.height : SCALED_CARD_SIZES.chart.height,
    }),
    [card.kind],
  );
  const layout = card.layout ?? layoutFallback;

  const didInitLayout = useRef(false);
  useEffect(() => {
    if (didInitLayout.current) return;
    if (!card.layout) {
      didInitLayout.current = true;
      onChange({ ...card, layout: layoutFallback });
    }
  }, [card.id, card.layout, layoutFallback, onChange]);

  const minSize = useMemo<Size>(() => {
    if (customMinSize?.cardId === card.id) {
      const width = Math.max(defaultMinSize.width, customMinSize.size.width);
      const height = Math.max(defaultMinSize.height, customMinSize.size.height);
      return { width, height };
    }
    return defaultMinSize;
  }, [card.id, customMinSize, defaultMinSize]);

  const handleMeasureMinSize = useCallback(
    (next: { width: number; height: number }) => {
      const width = Math.max(next.width, defaultMinSize.width);
      const height = Math.max(next.height, defaultMinSize.height);
      setCustomMinSize((prev) => {
        const isSameCard = prev?.cardId === card.id;
        const prevSize = isSameCard ? prev.size : undefined;
        if (prevSize && Math.abs(prevSize.width - width) < 2 && Math.abs(prevSize.height - height) < 2) {
          return prev;
        }
        return {
          cardId: card.id,
          size: { width, height },
        };
      });
    },
    [card.id, defaultMinSize.height, defaultMinSize.width],
  );

  const emitChange = useCallback(
    (next: Card) => {
      if (next.id !== card.id) {
        onChange(next);
        return;
      }
      const patch = createSettingsPatch(card, next);
      if (patch) onRecordPatch?.(patch);
      onChange(next);
    },
    [card, onChange, onRecordPatch],
  );

  const updateLayout = useCallback(
    (partial: Partial<Card["layout"]>) => {
      const currentLayout = card.layout ?? layoutFallback;
      const nextLayout = { ...currentLayout, ...partial };
      if (layoutsEqual(currentLayout, nextLayout)) return;
      const patch = createLayoutPatch(card, currentLayout, nextLayout);
      if (patch) onRecordPatch?.(patch);
      emitChange({ ...card, layout: nextLayout });
    },
    [card, layoutFallback, emitChange, onRecordPatch],
  );

  // Manage slide-in/out visibility so we can animate on close
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (isSelected) {
      // Mark sidebar open immediately so other UI (dataset panel) can slide with it
      document.body.setAttribute("data-settings-sidebar", "open");
      scheduleStateUpdate(() => {
        setClosingSettings(false);
        setShowSettings(true);
      });
    } else if (showSettings) {
      // Start closing: let others slide back while sidebar animates out
      document.body.removeAttribute("data-settings-sidebar");
      scheduleStateUpdate(() => {
        setClosingSettings(true);
      });
      timeoutId = setTimeout(() => {
        setShowSettings(false);
        setClosingSettings(false);
      }, 250);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isSelected, scheduleStateUpdate, showSettings]);

  // On unmount, ensure attribute is cleared
  useEffect(() => {
    return () => {
      if (document.body.getAttribute("data-settings-sidebar") === "open") {
        document.body.removeAttribute("data-settings-sidebar");
      }
    };
  }, []);


  const baseShadow = isSelected
    ? "0 0 0 2px #0078d4, 0 4px 15px rgba(0,0,0,0.25)"
    : "0 4px 15px rgba(0,0,0,0.25)";
  const highlightShadow = formatCopied ? "0 0 0 2px rgba(16, 185, 129, 0.8)" : null;
  const combinedShadow = highlightShadow ? `${highlightShadow}, ${baseShadow}` : baseShadow;

  return (
    <>
      <Rnd
        position={{ x: layout.x, y: layout.y }}
        size={{ width: layout.width, height: layout.height }}
        bounds="parent"
        scale={boardScale}
        enableResizing={{
          top: true,
          right: true,
          bottom: true,
          left: true,
          topRight: true,
          bottomRight: true,
          bottomLeft: true,
          topLeft: true,
        }}
        minWidth={minSize.width}
        minHeight={minSize.height}
        onPointerDownCapture={(e: ReactPointerEvent<HTMLDivElement>) => e.stopPropagation()}
        onPointerUpCapture={(e: ReactPointerEvent<HTMLDivElement>) => e.stopPropagation()}
        onClickCapture={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}
        onDragStart={() => {
          dragStartedRef.current = true;
          dragStartLayoutRef.current = { ...(card.layout ?? layoutFallback) };
          setIsInteracting(true);
          document.body.style.userSelect = "none";
        }}
        onDragStop={(_event, data) => {
          document.body.style.userSelect = "auto";
          setTimeout(() => {
            setIsInteracting(false);
            dragStartedRef.current = false;
            dragStartLayoutRef.current = null;
          }, 80);
          const startLayout = dragStartLayoutRef.current ?? layoutFallback;
          const didMove = startLayout.x !== data.x || startLayout.y !== data.y;
          updateLayout({ x: data.x, y: data.y });
          if (!didMove) {
            setSelectedId(selectedId === card.id ? null : card.id);
          }
        }}
        onResizeStart={() => {
          setIsInteracting(true);
          dragStartLayoutRef.current = { ...(card.layout ?? layoutFallback) };
          document.body.style.userSelect = "none";
        }}
        onResizeStop={(_event, _direction, ref, _delta, position) => {
          document.body.style.userSelect = "auto";
          setTimeout(() => {
            setIsInteracting(false);
            dragStartedRef.current = false;
            dragStartLayoutRef.current = null;
          }, 80);
          const startLayout = dragStartLayoutRef.current ?? layoutFallback;
          const didResize =
            startLayout.width !== ref.offsetWidth ||
            startLayout.height !== ref.offsetHeight ||
            startLayout.x !== position.x ||
            startLayout.y !== position.y;
          updateLayout({
            width: ref.offsetWidth,
            height: ref.offsetHeight,
            x: position.x,
            y: position.y,
          });
          if (!didResize) {
            setSelectedId(selectedId === card.id ? null : card.id);
          }
        }}
        style={{
          background: bg,
          borderRadius: "0.75rem",
          boxShadow: combinedShadow,
          padding: "1rem",
          position: "absolute",
          zIndex: isSelected ? 80 : 60,
          transition: "box-shadow 0.15s ease",
          cursor: "default",
        }}
      >
        <CardView
          card={card}
          onChange={emitChange}
          isInteracting={isInteracting}
          onMeasureMinSize={card.kind === "measure" ? handleMeasureMinSize : undefined}
        />
      </Rnd>

      {showSettings &&
        typeof document !== "undefined" &&
        createPortal(
          <CardSettings
            card={card}
            onChange={emitChange}
            onDelete={() => onDelete(card.id)}
            allowedTables={allowedTables}
            tableNameMap={tableNameMap}
            closing={closingSettings}
            onCopyFormatting={onCopyFormatting}
            onPasteFormatting={onPasteFormatting}
            formatCopied={formatCopied}
          />,
          document.body,
        )}
    </>
  );
}

const propsAreEqual = (prev: CardContainerProps, next: CardContainerProps) => {
  const prevSelected = prev.selectedId === prev.card.id;
  const nextSelected = next.selectedId === next.card.id;
  return (
    prev.card === next.card &&
    prevSelected === nextSelected &&
    prev.boardScale === next.boardScale &&
    prev.allowedTables === next.allowedTables &&
    prev.tableNameMap === next.tableNameMap &&
    prev.formatCopied === next.formatCopied &&
    prev.onRecordPatch === next.onRecordPatch
  );
};

export default memo(CardContainer, propsAreEqual);
