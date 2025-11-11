import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PatchBlock } from "@/lib/aiHelpers";
import { applyPatchInstructionToCard } from "@/lib/cardLayout";
import {
  createLayoutPatch,
  createSettingsPatch,
  type CardPatch,
} from "@/lib/cardPatches";
import type { Card } from "@/types";
import type { FormatClipboard } from "@/lib/cardFormatting";

type UseAssistantPatchesArgs = {
  cardsRef: MutableRefObject<Card[]>;
  setCards: Dispatch<SetStateAction<Card[]>>;
  selectedCardId: string | null;
  setFormatClipboard: Dispatch<SetStateAction<FormatClipboard | null>>;
  handleRecordPatch: (patch: CardPatch) => void;
};

export function useAssistantPatches({
  cardsRef,
  setCards,
  selectedCardId,
  setFormatClipboard,
  handleRecordPatch,
}: UseAssistantPatchesArgs) {
  const applyAssistantPatches = useCallback(
    (instructions: PatchBlock[]) => {
      const targetInstructions = instructions.filter(
        (instruction) =>
          typeof instruction.cardId === "string" && instruction.cardId.trim().length,
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
    [cardsRef, handleRecordPatch, selectedCardId, setCards, setFormatClipboard],
  );

  return { applyAssistantPatches };
}
