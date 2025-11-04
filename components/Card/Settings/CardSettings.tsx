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
};

export default function CardSettings({ card, onChange, onDelete }: CardSettingsProps) {
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
  const chartSeriesCount = isChart ? card.data.series.length : 0;
  const normalizedChartType = isChart
    ? card.settings.graph.chartType === "stackedbar"
      ? "bar"
      : (card.settings.graph.chartType as "line" | "bar" | "pie")
    : undefined;
  const currentBarLayout = isChart
    ? card.settings.graph.barLayout || (card.settings.graph.chartType === "stackedbar" ? "stacked" : "grouped")
    : "grouped";
  const isStackedLayout = normalizedChartType === "bar" && currentBarLayout === "stacked";
  const canUsePie = !isChart || (chartSeriesCount <= 1 && !isStackedLayout);
  const segmentToggleAvailable = normalizedChartType === "bar" && chartSeriesCount <= 1;
  const segmentColorsEnabled = isChart
    ? normalizedChartType === "pie"
      ? true
      : card.settings.legend.segmentColorEnabled ?? false
    : false;
  const shouldUseSegmentColors =
    normalizedChartType === "pie" ||
    (segmentToggleAvailable && segmentColorsEnabled);

  const segmentCategories = useMemo(() => {
    if (!isChart || !card.data.xKey) return [];
    const key = card.data.xKey;
    return Array.from(
      new Set((card.data.rows || []).map((row: any) => String(row[key]))),
    );
  }, [isChart, card.data.xKey, card.data.rows]);

  const segmentColorRefs = isChart ? card.settings.legend.segmentColorRefs || {} : {};
  const segmentColorMap = isChart ? card.settings.legend.segmentColors || {} : {};
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
    isChart &&
    shouldUseSegmentColors &&
    (hasMissingSegments || hasStaleSegments || hasInvalidRefs);

  useEffect(() => {
    if (!isChart) return;
    const currentLen = card.settings.legend.seriesDisplayNames?.length ?? 0;
    if (currentLen === card.data.series.length) return;
    updateCard((draft) => {
      if (draft.kind === "chart") {
        ensureSeriesDisplayNames(draft, draft.data.series);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.kind, card.data.series, card.settings.legend.seriesDisplayNames?.length]);

  useEffect(() => {
    if (!isChart) return;
    if (normalizedChartType === "bar" && chartSeriesCount <= 1 && currentBarLayout === "stacked") {
      updateCard((draft) => {
        if (draft.kind === "chart") draft.settings.graph.barLayout = "grouped";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChart, normalizedChartType, chartSeriesCount, currentBarLayout]);

  useEffect(() => {
    if (!isChart) return;
    if (normalizedChartType === "bar" && chartSeriesCount > 1 && card.settings.legend.segmentColorEnabled) {
      updateCard((draft) => {
        if (draft.kind === "chart") draft.settings.legend.segmentColorEnabled = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChart, normalizedChartType, chartSeriesCount]);

  useEffect(() => {
    if (!isChart || normalizedChartType !== "pie" || canUsePie) return;
    updateCard((draft) => {
      if (draft.kind === "chart") {
        draft.settings.graph.chartType = "bar";
        draft.settings.graph.barLayout = draft.settings.graph.barLayout || "grouped";
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChart, normalizedChartType, canUsePie]);

  useEffect(() => {
    if (!isChart) return;
    if (normalizedChartType === "pie" && !card.settings.legend.segmentColorEnabled) {
      updateCard((draft) => {
        if (draft.kind === "chart") draft.settings.legend.segmentColorEnabled = true;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChart, normalizedChartType]);

  useEffect(() => {
    if (!needsSegmentSync) return;
    updateCard((draft) => {
      if (draft.kind === "chart") {
        ensureSegmentColors(draft, segmentCategories, themeColors, avoidColors);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    needsSegmentSync,
    card.id,
    segmentCategories.join("|"),
    themeColors,
    backgroundColor,
  ]);

  return (
    <div className={styles.sidebar} onClick={(e) => e.stopPropagation()}>
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
            onRunSuccess={(rows, newSql) =>
              updateCard((draft) => {
                const value = rows?.[0] ? Object.values(rows[0])[0] : "";
                draft.settings.sql.code = newSql;
                if (draft.kind === "measure") {
                  (draft as any).data.value = String(value);
                }
              })
            }
          />
        ) : (
          <ChartSqlRunner card={card} onChange={onChange} themeColors={themeColors} />
        )}
      </SettingsSection>
    </div>
  );
}
