"use client";
import { useState, useEffect, useCallback } from "react";
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
}: {
  card: Card;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onChange: (next: Card) => void;
  onDelete: (id: string) => void;
}) {
  const isSelected = selectedId === card.id;
  const [isInteracting, setIsInteracting] = useState(false);
  const { themeColors } = useTheme();

  const bg =
    card.settings.titleBackground.bgColorRef !== undefined
      ? themeColors[card.settings.titleBackground.bgColorRef]
      : card.settings.titleBackground.bgColor || "#fff";

  const defaultMinSize = card.kind === "measure"
    ? { width: 200, height: 120 }
    : { width: 320, height: 220 };

  const [minSize, setMinSize] = useState(defaultMinSize);

  useEffect(() => {
    setMinSize(defaultMinSize);
  }, [card.id]);

  const handleMeasureMinSize = useCallback((next: { width: number; height: number }) => {
    setMinSize((prev) => {
      const width = Math.max(next.width, defaultMinSize.width);
      const height = Math.max(next.height, defaultMinSize.height);
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
        return prev;
      }
      return { width, height };
    });
  }, [defaultMinSize.width, defaultMinSize.height]);


  return (
    <>
      <Rnd
        default={{ x: 240, y: 180, width: 420, height: 320 }}
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
        onDragStop={() => {
          document.body.style.userSelect = "auto";
          setTimeout(() => setIsInteracting(false), 120);
        }}
        onResizeStart={() => {
          setIsInteracting(true);
          document.body.style.userSelect = "none";
        }}
        onResizeStop={() => {
          document.body.style.userSelect = "auto";
          setTimeout(() => setIsInteracting(false), 120);
        }}
        onClick={(e) => {
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
        <CardSettings card={card} onChange={onChange} onDelete={() => onDelete(card.id)} />
      )}
    </>
  );
}
