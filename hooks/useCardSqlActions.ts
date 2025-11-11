import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PatchBlock } from "@/lib/aiHelpers";
import { validateSqlAgainstTables, rewriteSqlTables } from "@/lib/sqlValidation";
import { getRowsFromResult, getErrorFromResult } from "@/lib/resultParsers";
import { prepareChartRows } from "@/lib/chartHelpers";
import { ensureSeriesDisplayNames, ensureSegmentColors } from "@/components/Card/Settings/utils/settingsUtils";
import type { Card, Msg } from "@/types";

type EnqueueMessages = (updater: Msg[] | ((prev: Msg[]) => Msg[])) => void;
type ReportValidationError = (scope: "measure" | "chart", message: string, sqlText: string) => void;

type UseCardSqlActionsArgs = {
  allowedTableLabels: string[];
  tableAliasMap: Record<string, string>;
  dataEngineBaseUrl: string;
  enqueueMessages: EnqueueMessages;
  reportValidationError: ReportValidationError;
  setCards: Dispatch<SetStateAction<Card[]>>;
  cardsRef: MutableRefObject<Card[]>;
  selectedCardId: string | null;
  themeColors: string[];
};

export function useCardSqlActions({
  allowedTableLabels,
  tableAliasMap,
  dataEngineBaseUrl,
  enqueueMessages,
  reportValidationError,
  setCards,
  cardsRef,
  selectedCardId,
  themeColors,
}: UseCardSqlActionsArgs) {
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
      } catch {
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
    [
      allowedTableLabels,
      dataEngineBaseUrl,
      enqueueMessages,
      reportValidationError,
      setCards,
      tableAliasMap,
    ],
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
      } catch {
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
      const legendSeriesKey = card.settings.legend.seriesKey;
      const {
        rows: normalizedRows,
        xKey,
        yKeys,
        detectedSeriesKey,
      } = prepareChartRows(
        chartRows,
        legendSeriesKey,
        explicitSeries ?? [],
      );
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
            data: { rows: normalizedRows, rawRows: chartRows, xKey, series: yKeys },
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
          if (!updated.settings.legend.seriesKey && detectedSeriesKey) {
            updated.settings.legend.seriesKey = detectedSeriesKey;
          }
          ensureSeriesDisplayNames(updated as Extract<Card, { kind: "chart" }>, yKeys);
          if (updated.settings.legend.segmentColorEnabled) {
            const categories = xKey
              ? Array.from(new Set(normalizedRows.map((row) => String(row?.[xKey] ?? ""))))
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
    [
      allowedTableLabels,
      dataEngineBaseUrl,
      enqueueMessages,
      reportValidationError,
      setCards,
      tableAliasMap,
      themeColors,
    ],
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
    [cardsRef, selectedCardId, updateChartCardSql, updateMeasureCardSql],
  );

  return { refreshCardsSql };
}
