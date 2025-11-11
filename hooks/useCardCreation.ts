import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { validateSqlAgainstTables, rewriteSqlTables } from "@/lib/sqlValidation";
import { getRowsFromResult, getErrorFromResult } from "@/lib/resultParsers";
import { computeCardPlacement, getViewportBoardRect } from "@/lib/cardPlacement";
import { seedCardFormatting } from "@/lib/cardFormatting";
import { applyPatchInstructionToCard, computeInitialLayout } from "@/lib/cardLayout";
import { generatePalette, normalizeType, prepareChartRows } from "@/lib/chartHelpers";
import type { Card, Msg } from "@/types";
import type { MeasureCreationRequest, ChartCreationRequest } from "@/hooks/useChatOrchestrator";
import type { BoardState } from "@/hooks/useBoardViewport";

type EnqueueMessages = (updater: Msg[] | ((prev: Msg[]) => Msg[])) => void;
type ReportValidationError = (scope: "measure" | "chart", message: string, sqlText: string) => void;

type UseCardCreationArgs = {
  allowedTableLabels: string[];
  tableAliasMap: Record<string, string>;
  dataEngineBaseUrl: string;
  enqueueMessages: EnqueueMessages;
  reportValidationError: ReportValidationError;
  setCards: Dispatch<SetStateAction<Card[]>>;
  themeColors: string[];
  boardState: BoardState;
  boardViewportRef: MutableRefObject<HTMLDivElement | null>;
};

const themeColorToken = (themeColors: string[], index: number, fallback: string) => {
  const color = themeColors[index];
  return {
    ref: color !== undefined ? index : undefined,
    color: color !== undefined ? undefined : fallback,
    value: color ?? fallback,
  };
};

const assignSeriesColors = (
  themeColors: string[],
  count: number,
  backgroundRef?: number,
  avoidColorValue?: string,
) => {
  const avoidColorNorm = avoidColorValue?.toLowerCase();
  const availableIndices = Array.from({ length: themeColors.length }, (_, idx) => idx).filter(
    (idx) => {
      const color = themeColors[idx];
      if (color === undefined) return false;
      if (idx === backgroundRef) return false;
      if (avoidColorNorm && color.toLowerCase() === avoidColorNorm) return false;
      return true;
    },
  );
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

const assignSegmentColors = (themeColors: string[], categories: string[], avoidColors: string[]) => {
  const avoidSet = new Set(
    avoidColors.filter((color) => Boolean(color)).map((color) => color.toLowerCase()),
  );
  const refs: Record<string, number> = {};
  const colors: Record<string, string> = {};
  const candidates = themeColors
    .map((color, idx) => ({ color, idx }))
    .filter(({ color }) => color !== undefined && !avoidSet.has(color.toLowerCase()));
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
      while (avoidSet.has(color.toLowerCase()) && guard < fallbackPalette.length) {
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

export function useCardCreation({
  allowedTableLabels,
  tableAliasMap,
  dataEngineBaseUrl,
  enqueueMessages,
  reportValidationError,
  setCards,
  themeColors,
  boardState,
  boardViewportRef,
}: UseCardCreationArgs) {
  const runMeasureCreation = useCallback(
    async ({ title, sqlCode, promptOverride, overrides }: MeasureCreationRequest) => {
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
      } catch {
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
      const titleTheme = themeColorToken(themeColors, 0, "#111111");
      const measureTheme = themeColorToken(themeColors, 1, "#0078d4");
      const backgroundTheme = themeColorToken(themeColors, 2, "#ffffff");
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
      boardState,
      boardViewportRef,
      dataEngineBaseUrl,
      enqueueMessages,
      reportValidationError,
      setCards,
      tableAliasMap,
      themeColors,
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
      } catch {
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
      const legendSeriesKey = overrides?.legend?.seriesKey;
      const {
        rows: normalizedRows,
        rawRows,
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

      const requested =
        (overrides?.graph?.chartType ?? requestedType ?? "bar").toString();
      const finalType = normalizeType(requested, yKeys.length);
      const titleTheme = themeColorToken(themeColors, 0, "#111111");
      const backgroundTheme = themeColorToken(themeColors, 2, "#ffffff");
      const { refs: initialSeriesRefs, colors: initialSeriesColors } = assignSeriesColors(
        themeColors,
        yKeys.length,
        backgroundTheme.ref,
        backgroundTheme.value,
      );
      const segmentCategories = xKey
        ? Array.from(new Set(normalizedRows.map((row) => String(row?.[xKey] ?? ""))))
        : [];
      const segmentConfig =
        finalType === "pie"
          ? assignSegmentColors(
              themeColors,
              segmentCategories,
              backgroundTheme.value ? [backgroundTheme.value] : [],
            )
          : { refs: {}, colors: {} };
      const viewportRect = getViewportBoardRect(boardViewportRef.current, boardState);

      setCards((prev) => {
        const baseCard: Card = {
          id: crypto.randomUUID(),
          kind: "chart",
          data: { rows: normalizedRows, rawRows, xKey, series: yKeys },
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
              seriesKey: legendSeriesKey,
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
        if (!legendSeriesKey && detectedSeriesKey) {
          baseCard.settings.legend.seriesKey = detectedSeriesKey;
        }
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
      boardState,
      boardViewportRef,
      dataEngineBaseUrl,
      enqueueMessages,
      reportValidationError,
      setCards,
      tableAliasMap,
      themeColors,
    ],
  );

  return { runMeasureCreation, runChartCreation };
}
