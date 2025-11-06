"use client";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import {
  SqlRunner,
  SettingsSection,
  TitleBackgroundSection,
  MeasureAppearanceSection,
  GraphSection,
  AxesSection,
  LegendSection,
  ChartSqlRunner,
  ensureSeriesDisplayNames,
  ensureSegmentColors,
} from "@/components/Card/Settings/Components";
import styles from "./CardSettings.module.css";
import { Trash2 } from "lucide-react";
import type { Card } from "@/types";

type CardSettingsProps = {
  card: Card;
  onChange: (next: Card) => void;
  onDelete: () => void;
  allowedTables: string[];
  tableNameMap: Record<string, string>;
};

export default function CardSettings({
  card,
  onChange,
  onDelete,
  allowedTables,
  tableNameMap,
  closing = false,
}: CardSettingsProps & { closing?: boolean }) {
  const { themeColors } = useTheme();

  const backgroundColor =
    card.settings.titleBackground.bgColorRef !== undefined
      ? themeColors[card.settings.titleBackground.bgColorRef]
      : card.settings.titleBackground.bgColor;

  const blockedThemeRefs =
    card.settings.titleBackground.bgColorRef !== undefined
      ? [card.settings.titleBackground.bgColorRef]
      : undefined;

  const blockedColorValues = backgroundColor ? [backgroundColor] : undefined;
  const avoidColors = backgroundColor ? [backgroundColor.toLowerCase()] : [];

  const defaultOpen: Record<string, boolean> = {
    title: true,
    measure: card.kind === "measure",
    graph: card.kind === "chart",
    axes: card.kind === "chart",
    legend: false,
    sql: false,
  };

  const [open, setOpen] = useState<Record<string, boolean>>(
    card.ui?.settingsOpen ? { ...defaultOpen, ...card.ui.settingsOpen } : defaultOpen,
  );

  useEffect(() => {
    setOpen(card.ui?.settingsOpen ? { ...defaultOpen, ...card.ui.settingsOpen } : defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);


  // Defer applying the .open class by a frame so the transition runs
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const copy: Card = JSON.parse(JSON.stringify(card));
      copy.ui = copy.ui || {};
      copy.ui.settingsOpen = next;
      onChange(copy);
      return next;
    });
  };

  const updateCard = (updater: (draft: Card) => void) => {
    const copy: Card = JSON.parse(JSON.stringify(card));
    updater(copy);
    onChange(copy);
  };

  const isChart = card.kind === "chart";
  const chartCard = isChart ? card : undefined;
  const legendSettings = chartCard?.settings.legend;
  const chartId = chartCard?.id ?? "";
  const chartXKey = chartCard?.data.xKey;
  const chartRows = chartCard?.data.rows ?? [];
  const chartSeries = chartCard?.data.series ?? [];
  const chartSeriesCount = chartSeries.length;
  const chartSeriesKey = chartSeries.join("|");
  const normalizedChartType = chartCard
    ? chartCard.settings.graph.chartType === "stackedbar"
      ? "bar"
      : (chartCard.settings.graph.chartType as "line" | "bar" | "pie")
    : undefined;
  const currentBarLayout = chartCard
    ? chartCard.settings.graph.barLayout ||
      (chartCard.settings.graph.chartType === "stackedbar" ? "stacked" : "grouped")
    : "grouped";
  const isStackedLayout = normalizedChartType === "bar" && currentBarLayout === "stacked";
  const canUsePie = !isChart || (chartSeriesCount <= 1 && !isStackedLayout);
  const segmentToggleAvailable = chartCard
    ? normalizedChartType === "bar" && chartSeriesCount <= 1
    : false;
  const segmentColorsEnabled = chartCard
    ? normalizedChartType === "pie"
      ? true
      : legendSettings?.segmentColorEnabled ?? false
    : false;
  const shouldUseSegmentColors =
    normalizedChartType === "pie" ||
    (segmentToggleAvailable && segmentColorsEnabled);

  const segmentCategories = useMemo(() => {
    if (!chartCard || !chartXKey) return [];
    return Array.from(
      new Set(
        chartRows.map((row) => {
          const value = row[chartXKey];
          if (value === null || value === undefined) return "";
          return String(value);
        }),
      ),
    );
  }, [chartId, chartXKey, chartRows]);
  const segmentCategoriesKey = segmentCategories.join("|");

  const segmentColorRefs = legendSettings?.segmentColorRefs || {};
  const segmentColorMap = legendSettings?.segmentColors || {};
  const segmentKeys = new Set<string>([
    ...Object.keys(segmentColorRefs),
    ...Object.keys(segmentColorMap),
  ]);

  const hasMissingSegments = segmentCategories.some(
    (cat) =>
      segmentColorRefs[cat] === undefined && segmentColorMap[cat] === undefined,
  );
  const hasStaleSegments = Array.from(segmentKeys).some(
    (key) => !segmentCategories.includes(key),
  );
  const hasInvalidRefs = segmentCategories.some((cat) => {
    const ref = segmentColorRefs[cat];
    if (typeof ref !== "number") return false;
    if (ref < 0 || ref >= themeColors.length) return true;
    const refColor = themeColors[ref];
    if (!refColor) return true;
    return avoidColors.includes(refColor.toLowerCase());
  });

  const needsSegmentSync =
    Boolean(
      chartCard &&
      shouldUseSegmentColors &&
      (hasMissingSegments || hasStaleSegments || hasInvalidRefs),
    );

  useEffect(() => {
    if (!chartCard) return;
    const currentLen = legendSettings?.seriesDisplayNames?.length ?? 0;
    if (currentLen === chartSeries.length) return;
    updateCard((draft) => {
      if (draft.kind === "chart") {
        ensureSeriesDisplayNames(draft, draft.data.series);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, chartSeriesKey, legendSettings?.seriesDisplayNames?.length]);

  useEffect(() => {
    if (!chartCard) return;
    if (normalizedChartType === "bar" && chartSeriesCount <= 1 && currentBarLayout === "stacked") {
      updateCard((draft) => {
        if (draft.kind === "chart") draft.settings.graph.barLayout = "grouped";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, normalizedChartType, chartSeriesCount, currentBarLayout]);

  useEffect(() => {
    if (!chartCard) return;
    if (normalizedChartType === "bar" && chartSeriesCount > 1 && legendSettings?.segmentColorEnabled) {
      updateCard((draft) => {
        if (draft.kind === "chart") draft.settings.legend.segmentColorEnabled = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, normalizedChartType, chartSeriesCount]);

  useEffect(() => {
    if (!chartCard || normalizedChartType !== "pie" || canUsePie) return;
    updateCard((draft) => {
      if (draft.kind === "chart") {
        draft.settings.graph.chartType = "bar";
        draft.settings.graph.barLayout = draft.settings.graph.barLayout || "grouped";
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, normalizedChartType, canUsePie]);

  useEffect(() => {
    if (!chartCard) return;
    if (normalizedChartType === "pie" && !legendSettings?.segmentColorEnabled) {
      updateCard((draft) => {
        if (draft.kind === "chart") draft.settings.legend.segmentColorEnabled = true;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, normalizedChartType]);

  useEffect(() => {
    if (!needsSegmentSync || !chartCard) return;
    updateCard((draft) => {
      if (draft.kind === "chart") {
        ensureSegmentColors(draft, segmentCategories, themeColors, avoidColors);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    needsSegmentSync,
    chartId,
    segmentCategoriesKey,
    themeColors,
    backgroundColor,
  ]);

  return (
    <div
      className={`${styles.sidebar} ${closing ? styles.closing : entered ? styles.open : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.deleteTop}>
        <button
          onClick={() => {
            if (window.confirm("Delete this card?")) onDelete();
          }}
          title="Delete card"
          className={styles.deleteIconBtn}
        >
          <Trash2 size={18} />
        </button>
      </div>

      <h2>{card.kind === "measure" ? "Measure" : "Chart"} Settings</h2>

      <SettingsSection
        label="Title & Background"
        open={open.title}
        onToggle={() => toggle("title")}
      >
        <TitleBackgroundSection
          card={card}
          onUpdate={updateCard}
          blockedThemeRefs={blockedThemeRefs}
          blockedColorValues={blockedColorValues}
        />
      </SettingsSection>

      {card.kind === "measure" && (
        <SettingsSection
          label="Measure Appearance"
          open={open.measure}
          onToggle={() => toggle("measure")}
        >
          <MeasureAppearanceSection
            card={card}
            onUpdate={(updater) => updateCard((draft) => {
              if (draft.kind === "measure") updater(draft);
            })}
          />
        </SettingsSection>
      )}

      {card.kind === "chart" && (
        <>
          <SettingsSection
            label="Graph"
            open={open.graph}
            onToggle={() => toggle("graph")}
          >
            <GraphSection
              card={card}
              onUpdate={(updater) => updateCard((draft) => {
                if (draft.kind === "chart") updater(draft);
              })}
              normalizedChartType={normalizedChartType || "bar"}
              canUsePie={canUsePie}
              chartSeriesCount={chartSeriesCount}
              currentBarLayout={currentBarLayout}
            />
          </SettingsSection>

          <SettingsSection
            label="Axes"
            open={open.axes}
            onToggle={() => toggle("axes")}
          >
            <AxesSection
              card={card}
              onUpdate={(updater) => updateCard((draft) => {
                if (draft.kind === "chart") updater(draft);
              })}
            />
          </SettingsSection>

          <SettingsSection
            label="Legend & Series"
            open={open.legend}
            onToggle={() => toggle("legend")}
          >
            <LegendSection
              card={card}
              onUpdate={(updater) => updateCard((draft) => {
                if (draft.kind === "chart") updater(draft);
              })}
              chartType={(normalizedChartType || "bar")}
              segmentToggleAvailable={Boolean(segmentToggleAvailable)}
              shouldUseSegmentColors={shouldUseSegmentColors}
              segmentCategories={segmentCategories}
              blockedThemeRefs={blockedThemeRefs}
              blockedColorValues={blockedColorValues}
              avoidColors={avoidColors}
            />
          </SettingsSection>
        </>
      )}

      <SettingsSection
        label="SQL"
        open={open.sql}
        onToggle={() => toggle("sql")}
      >
        {card.kind === "measure" ? (
          <SqlRunner
            code={card.settings.sql.code || ""}
            allowedTables={allowedTables}
            tableNameMap={tableNameMap}
            onRunSuccess={(rows, newSql, tables) =>
              updateCard((draft) => {
                const firstRow = rows[0];
                const firstValue = firstRow ? Object.values(firstRow)[0] : undefined;
                const nextValue: string | number =
                  typeof firstValue === "number"
                    ? firstValue
                    : String(
                        firstValue === undefined || firstValue === null ? "" : firstValue,
                      );
                draft.settings.sql.code = newSql;
                if (draft.kind === "measure") {
                  draft.data.value = nextValue;
                }
                draft.sourceTables = tables;
              })
            }
          />
        ) : (
          <ChartSqlRunner
            card={card}
            onChange={onChange}
            themeColors={themeColors}
            allowedTables={allowedTables}
            tableNameMap={tableNameMap}
          />
        )}
      </SettingsSection>
    </div>
  );
}
