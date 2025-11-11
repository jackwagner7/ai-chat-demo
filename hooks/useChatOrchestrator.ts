import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  extractBlock,
  extractPatchBlocks,
  parseInstructionPayload,
  type PatchBlock,
} from "@/lib/aiHelpers";
import {
  buildExistingCardsSection,
  buildTableSection,
  estimateTokens,
} from "@/lib/chatPrompt";
import { isRecord, toNonEmptyString } from "@/lib/resultParsers";
import type { Card, Msg, UploadedTableInfo } from "@/types";

type EnqueueMessages = (updater: Msg[] | ((prev: Msg[]) => Msg[])) => void;

export type MeasureCreationRequest = {
  title: string;
  sqlCode: string;
  promptOverride: string;
  overrides?: PatchBlock;
};

export type ChartCreationRequest = {
  title: string;
  sqlCode: string;
  promptOverride: string;
  requestedType?: string;
  overrides?: PatchBlock;
  explicitSeries?: string[];
};

type UseChatOrchestratorArgs = {
  enqueueMessages: EnqueueMessages;
  uploadedTables: UploadedTableInfo[];
  cards: Card[];
  selectedCardId: string | null;
  applyAssistantPatches: (instructions: PatchBlock[]) => boolean | Promise<boolean>;
  refreshCardsSql: (instructions: PatchBlock[]) => Promise<boolean>;
  runMeasureCreation: (options: MeasureCreationRequest) => Promise<boolean>;
  runChartCreation: (options: ChartCreationRequest) => Promise<boolean>;
};

export type UseChatOrchestratorResult = {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  isSending: boolean;
  sendMessage: () => Promise<void>;
  includeAllCards: boolean;
  toggleIncludeAllCards: () => void;
  tokenEstimate: number;
};

const GLOBAL_CONTEXT_KEY = "aidata.chat.global-context";
const TOKEN_ESTIMATE_KEY = "aidata.chat.token-estimate";

const getStringField = (record: Record<string, unknown>, key: string): string | undefined =>
  toNonEmptyString(record[key]);

const extractReply = (payload: unknown) => {
  if (!isRecord(payload)) return "";
  return getStringField(payload, "reply") ?? getStringField(payload, "error") ?? "";
};

export function useChatOrchestrator({
  enqueueMessages,
  uploadedTables,
  cards,
  selectedCardId,
  applyAssistantPatches,
  refreshCardsSql,
  runMeasureCreation,
  runChartCreation,
}: UseChatOrchestratorArgs): UseChatOrchestratorResult {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [includeAllCards, setIncludeAllCards] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(GLOBAL_CONTEXT_KEY) === "true";
  });
  const [tokenEstimate, setTokenEstimate] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = window.localStorage.getItem(TOKEN_ESTIMATE_KEY);
    return stored ? Number(stored) : 0;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GLOBAL_CONTEXT_KEY, includeAllCards ? "true" : "false");
  }, [includeAllCards]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOKEN_ESTIMATE_KEY, String(tokenEstimate));
  }, [tokenEstimate]);

  const toggleIncludeAllCards = useCallback(() => {
    setIncludeAllCards((prev) => !prev);
  }, []);

  const sendMessage = useCallback(async () => {
    if (isSending) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    const currentMessage = input;
    const userPrompt = trimmed;
    const userMsg = { role: "user", content: currentMessage };
    enqueueMessages((m) => [...m, userMsg]);
    setIsSending(true);

    let clearInput = false;

    try {
      const tableSection = buildTableSection(uploadedTables);
      const cardsSection = buildExistingCardsSection(cards, selectedCardId, includeAllCards);
      const contextSections = [tableSection, cardsSection].filter(Boolean);
      const contextBlob = contextSections.filter(Boolean).join("\n\n");
      const bodyMessage = `${contextBlob ? `${contextBlob}\n\n` : ""}User question:\n${currentMessage}`;
      const body = { message: bodyMessage };
      const requestTokens = estimateTokens(bodyMessage);
      if (requestTokens) {
        setTokenEstimate((prev) => prev + requestTokens);
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responsePayload = await res.json();
      const reply = extractReply(responsePayload);
      const replyTokens = estimateTokens(reply);
      if (replyTokens) {
        setTokenEstimate((prev) => prev + replyTokens);
      }

      const instructionPayload = parseInstructionPayload(reply);
      if (instructionPayload && instructionPayload.length) {
        instructionPayload.forEach((instruction) => {
          if (!instruction.legend) {
            instruction.legend = {};
          }
        });
        const patchInstructions = instructionPayload.filter((instruction) => instruction.cardId);
        const createInstructions = instructionPayload.filter((instruction) => !instruction.cardId);
        let instructionApplied = false;

        if (patchInstructions.length) {
          const patched = await applyAssistantPatches(patchInstructions);
          const ranSql = await refreshCardsSql(patchInstructions);
          const patchApplied = patched || ranSql;
          enqueueMessages((m) => [
            ...m,
            {
              role: patchApplied ? "assistant" : "system",
              content: patchApplied
                ? "Updated the existing card as requested."
                : "Chatbot returned an update, but it could not be applied.",
            },
          ]);
          if (patchApplied) {
            clearInput = true;
            instructionApplied = true;
          }
        }
        console.log(createInstructions)
        if (createInstructions.length) {
          let createdAny = false;
          for (const instruction of createInstructions) {
            const sqlCode = instruction.sql?.code;
            if (!instruction.kind || !sqlCode) {
              enqueueMessages((m) => [
                ...m,
                { role: "system", content: "AI response for a new card was missing kind or SQL." },
              ]);
              continue;
            }
            if (instruction.kind === "measure") {
              const title =
                instruction.titleBackground?.title?.trim() ||
                instruction.cardTitle ||
                "Measure Card";
              const created = await runMeasureCreation({
                title,
                sqlCode,
                promptOverride: instruction.sql?.prompt ?? userPrompt,
                overrides: instruction,
              });
              createdAny = createdAny || created;
            } else if (instruction.kind === "chart") {
              const title =
                instruction.titleBackground?.title?.trim() ||
                instruction.cardTitle ||
                "Chart Card";
                  console.log(title, sqlCode, instruction)

              const created = await runChartCreation({
                title,
                sqlCode,
                requestedType: instruction.graph?.chartType,
                promptOverride: instruction.sql?.prompt ?? userPrompt,
                overrides: instruction,
                explicitSeries: instruction.series,
              });
              console.log(created)
              createdAny = createdAny || created;
            } else {
              enqueueMessages((m) => [
                ...m,
                { role: "system", content: `Unknown card kind "${instruction.kind}".` },
              ]);
            }
          }
          if (createdAny) {
            clearInput = true;
            instructionApplied = true;
          } else {
            enqueueMessages((m) => [
              ...m,
              { role: "system", content: "Could not create a card from the chatbot response." },
            ]);
          }
        }

        if (!instructionApplied && !createInstructions.length && !patchInstructions.length) {
          enqueueMessages((m) => [
            ...m,
            { role: "system", content: "Chatbot response contained no actionable cards." },
          ]);
        }

        return;
      }

      const patchBlocks = extractPatchBlocks(reply);
      if (patchBlocks.length) {
        const applied = await applyAssistantPatches(patchBlocks);
        const ranSql = await refreshCardsSql(patchBlocks);
        const patchApplied = applied || ranSql;
        enqueueMessages((m) => [
          ...m,
          {
            role: patchApplied ? "assistant" : "system",
            content: patchApplied
              ? "Updated the existing card as requested."
              : "Chatbot returned a patch, but it could not be applied.",
          },
        ]);
        if (patchApplied) {
          clearInput = true;
        }
        return;
      }

      const measureBlock = extractBlock(reply, "measure");
      if (measureBlock) {
        const created = await runMeasureCreation({
          title: measureBlock.title,
          sqlCode: measureBlock.code,
          promptOverride: userPrompt,
        });
        if (created) clearInput = true;
        return;
      }

      const chartBlock = extractBlock(reply, "chart");
      if (chartBlock) {
        const created = await runChartCreation({
          title: chartBlock.title,
          sqlCode: chartBlock.code,
          requestedType: chartBlock.type,
          promptOverride: userPrompt,
          explicitSeries: chartBlock.series,
        });
        if (created) clearInput = true;
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
  }, [
    applyAssistantPatches,
    cards,
    includeAllCards,
    input,
    isSending,
    refreshCardsSql,
    runChartCreation,
    runMeasureCreation,
    selectedCardId,
    enqueueMessages,
    uploadedTables,
  ]);

  return {
    input,
    setInput,
    isSending,
    sendMessage,
    includeAllCards,
    toggleIncludeAllCards,
    tokenEstimate,
  };
}
