"use client";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Rnd } from "react-rnd";
import { useTheme } from "@/context/ThemeContext";
import type { Card } from "@/types";
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
  const { themeColors } = useTheme();

  const bg =
    card.settings.titleBackground.bgColorRef !== undefined
      ? themeColors[card.settings.titleBackground.bgColorRef]
      : card.settings.titleBackground.bgColor || "#fff";

  type Size = { width: number; height: number };

  const defaultMinSize = useMemo<Size>(
    () =>
      card.kind === "measure"
        ? { width: 200, height: 120 }
        : { width: 320, height: 220 },
    [card.kind],
  );

  const [customMinSize, setCustomMinSize] = useState<{
    cardId: string;
    size: Size;
  } | null>(null);
  const layoutFallback = useMemo(
    () => ({
      x: 240,
      y: 180,
      width: card.kind === "measure" ? 320 : 420,
      height: card.kind === "measure" ? 220 : 320,
    }),
    [card.kind],
  );
  const layout = card.layout ?? layoutFallback;

  useEffect(() => {
    if (!card.layout) {
      onChange({ ...card, layout: layoutFallback });
    }
  }, [card, layoutFallback, onChange]);

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

      {isSelected && (
        <CardSettings
          card={card}
          onChange={onChange}
          onDelete={() => onDelete(card.id)}
          allowedTables={allowedTables}
          tableNameMap={tableNameMap}
        />
      )}
    </>
  );
}
