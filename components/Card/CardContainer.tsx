"use client";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Rnd } from "react-rnd";
import { useTheme } from "@/context/ThemeContext";
import type { Card } from "@/types";
import {
  SCALED_CARD_MIN,
  SCALED_CARD_POSITION,
  SCALED_CARD_SIZES,
  SCALED_SETTINGS_MARGIN,
  SCALED_SETTINGS_WIDTH,
} from "@/lib/uiScale";
import CardView from "./CardView";
import CardSettings from "./Settings/CardSettings";

export default function CardContainer({
  card,
  selectedId,
  setSelectedId,
  onChange,
  onDelete,
  allowedTables,
  tableNameMap,
}: {
  card: Card;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onChange: (next: Card) => void;
  onDelete: (id: string) => void;
  allowedTables: string[];
  tableNameMap: Record<string, string>;
}) {
  const isSelected = selectedId === card.id;
  const [isInteracting, setIsInteracting] = useState(false);
  const [showSettings, setShowSettings] = useState<boolean>(isSelected);
  const [closingSettings, setClosingSettings] = useState<boolean>(false);
  const { themeColors } = useTheme();

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

  const updateLayout = useCallback(
    (partial: Partial<Card["layout"]>) => {
      const currentLayout = card.layout ?? layoutFallback;
      const nextLayout = { ...currentLayout, ...partial };
      if (
        currentLayout.x === nextLayout.x &&
        currentLayout.y === nextLayout.y &&
        currentLayout.width === nextLayout.width &&
        currentLayout.height === nextLayout.height
      ) {
        return;
      }
      onChange({ ...card, layout: nextLayout });
    },
    [card, layoutFallback, onChange],
  );

  // Manage slide-in/out visibility so we can animate on close
  useEffect(() => {
    if (isSelected) {
      // Mark sidebar open immediately so other UI (dataset panel) can slide with it
      document.body.setAttribute("data-settings-sidebar", "open");
      setClosingSettings(false);
      setShowSettings(true);
    } else if (showSettings) {
      // Start closing: let others slide back while sidebar animates out
      document.body.removeAttribute("data-settings-sidebar");
      setClosingSettings(true);
      const t = setTimeout(() => {
        setShowSettings(false);
        setClosingSettings(false);
      }, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isSelected, showSettings]);

  // On unmount, ensure attribute is cleared
  useEffect(() => {
    return () => {
      if (document.body.getAttribute("data-settings-sidebar") === "open") {
        document.body.removeAttribute("data-settings-sidebar");
      }
    };
  }, []);

  // When settings sidebar is visible (card selected), make sure the card
  // isn’t hidden behind it. Shift left if overlapping the right sidebar.
  useEffect(() => {
    if (!isSelected) return;
    if (typeof window === "undefined") return;
    const sidebarWidth = SCALED_SETTINGS_WIDTH; // matches CardSettings.module.css
    const sidebarMargin = SCALED_SETTINGS_MARGIN;

    const viewportWidth = window.innerWidth || 0;
    const rightLimit = Math.max(0, viewportWidth - sidebarWidth - sidebarMargin);
    const current = card.layout ?? layoutFallback;
    const cardRight = current.x + current.width;
    if (cardRight > rightLimit) {
      const delta = cardRight - rightLimit;
      const nextX = Math.max(12, current.x - delta);
      updateLayout({ x: nextX });
    }
    // Re-check on resize while selected
    const onResize = () => {
      const vw = window.innerWidth || 0;
      const rl = Math.max(0, vw - sidebarWidth - sidebarMargin);
      const cur = card.layout ?? layoutFallback;
      const cr = cur.x + cur.width;
      if (cr > rl) {
        const d = cr - rl;
        const nx = Math.max(12, cur.x - d);
        updateLayout({ x: nx });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isSelected, card.layout, layoutFallback, updateLayout]);


  return (
    <>
      <Rnd
        position={{ x: layout.x, y: layout.y }}
        size={{ width: layout.width, height: layout.height }}
        bounds="window"
        dragHandleClassName="drag-handle"
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
        onDragStart={() => {
          setIsInteracting(true);
          document.body.style.userSelect = "none";
        }}
        onDragStop={(_event, data) => {
          document.body.style.userSelect = "auto";
          setTimeout(() => setIsInteracting(false), 120);
          updateLayout({ x: data.x, y: data.y });
        }}
        onResizeStart={() => {
          setIsInteracting(true);
          document.body.style.userSelect = "none";
        }}
        onResizeStop={(_event, _direction, ref, _delta, position) => {
          document.body.style.userSelect = "auto";
          setTimeout(() => setIsInteracting(false), 120);
          updateLayout({
            width: ref.offsetWidth,
            height: ref.offsetHeight,
            x: position.x,
            y: position.y,
          });
        }}
        onClick={(e: ReactMouseEvent<HTMLDivElement>) => {
          e.stopPropagation();
          if (isInteracting) return;
          setSelectedId(isSelected ? null : card.id);
        }}
        style={{
          background: bg,
          borderRadius: "0.75rem",
          boxShadow: isSelected
            ? "0 0 0 2px #0078d4, 0 4px 15px rgba(0,0,0,0.25)"
            : "0 4px 15px rgba(0,0,0,0.25)",
          padding: "1rem",
          position: "absolute",
          zIndex: isSelected ? 80 : 60,
          transition: "box-shadow 0.15s ease",
        }}
      >
        <CardView
          card={card}
          onChange={onChange}
          isInteracting={isInteracting}
          onMeasureMinSize={card.kind === "measure" ? handleMeasureMinSize : undefined}
        />
      </Rnd>

      {showSettings && (
        <CardSettings
          card={card}
          onChange={onChange}
          onDelete={() => onDelete(card.id)}
          allowedTables={allowedTables}
          tableNameMap={tableNameMap}
          closing={closingSettings}
        />
      )}
    </>
  );
}
