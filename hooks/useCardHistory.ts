import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Card } from "@/types";
import { applyCardPatch, type CardPatch } from "@/lib/cardPatches";
import type { FormatClipboard } from "@/lib/cardFormatting";

type UseCardHistoryArgs = {
  setCards: Dispatch<SetStateAction<Card[]>>;
  setFormatClipboard: Dispatch<SetStateAction<FormatClipboard | null>>;
};

export function useCardHistory({ setCards, setFormatClipboard }: UseCardHistoryArgs) {
  const [undoStack, setUndoStack] = useState<CardPatch[]>([]);
  const [redoStack, setRedoStack] = useState<CardPatch[]>([]);

  const applyPatchToCards = useCallback(
    (patch: CardPatch, mode: "before" | "after") => {
      setCards((prev) => applyCardPatch(prev, patch, mode));
      setFormatClipboard((prev) => (prev?.sourceCardId === patch.cardId ? null : prev));
    },
    [setCards, setFormatClipboard],
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

  const handleRecordPatch = useCallback((patch: CardPatch) => {
    setUndoStack((prev) => [...prev, patch]);
    setRedoStack([]);
  }, []);

  return {
    undoStack,
    redoStack,
    handleUndo,
    handleRedo,
    handleRecordPatch,
  };
}
