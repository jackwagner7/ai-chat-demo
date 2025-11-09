"use client";
import ColorSwatches from "@/components/ColorSwatches";
import styles from "../CardSettings.module.css";
import type { Card } from "@/types";
import { useTheme } from "@/context/ThemeContext";
import { ensureSegmentColors } from "./settingsUtils";

type ChartCard = Extract<Card, { kind: "chart" }>;

type Props = {
  card: ChartCard;
  onUpdate: (updater: (draft: ChartCard) => void) => void;
  chartType: "line" | "bar" | "pie";
  segmentToggleAvailable: boolean;
  shouldUseSegmentColors: boolean;
  segmentCategories: string[];
  blockedThemeRefs?: number[];
  blockedColorValues?: string[];
  avoidColors: string[];
};

export default function LegendSection({
  card,
  onUpdate,
  chartType,
  segmentToggleAvailable,
  shouldUseSegmentColors,
  segmentCategories,
  blockedThemeRefs,
  blockedColorValues,
  avoidColors,
}: Props) {
  const { themeColors } = useTheme();
  const legend = card.settings.legend;
  const series = card.data.series;
  const normalizedType = chartType;
  const segmentColorsEnabled =
    normalizedType === "pie" ? true : legend.segmentColorEnabled ?? false;

  const hasSegmentControls =
    segmentCategories.length > 0 && shouldUseSegmentColors;

  return (
    <div className={styles.sectionBody}>
      <div className={styles.sliderLabel}>
        <div className={styles.sliderHeader}>
          <span>Legend Size (rem)</span>
          <input
            type="number"
            step="0.1"
            min="0.6"
            max="2"
            value={Number(legend.legendSize ?? 0.9).toFixed(1)}
            onChange={(e) =>
              onUpdate((draft) => {
                draft.settings.legend.legendSize = parseFloat(e.target.value) || 0;
              })
            }
            className={styles.numeric}
          />
        </div>
        <input
          type="range"
          min="0.6"
          max="2"
          step="0.1"
          value={legend.legendSize ?? 0.9}
          onChange={(e) =>
            onUpdate((draft) => {
              draft.settings.legend.legendSize = Number(e.target.value);
            })
          }
        />
      </div>

      {normalizedType !== "pie" && (
        <>
          <h4 className={styles.seriesHeading}>Series</h4>
          {series.map((s, i) => (
            <div
              key={s}
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "6px",
                padding: "0.5rem 0.75rem",
                marginBottom: "0.5rem",
              }}
            >
              <div className={styles.seriesMeta} style={{ opacity: 0.7 }}>
                SQL Name: <code>{s}</code>
              </div>
              <label style={{ marginTop: "0.25rem" }}>
                Display Name
                <input
                  type="text"
                  value={legend.seriesDisplayNames?.[i] || ""}
                  onChange={(e) =>
                    onUpdate((draft) => {
                      const names: string[] = [
                        ...(draft.settings.legend.seriesDisplayNames ?? []),
                      ];
                      names[i] = e.target.value;
                      draft.settings.legend.seriesDisplayNames = names;
                    })
                  }
                />
              </label>

              <ColorSwatches
                label="Colour"
                selectedRef={legend.seriesColorRefs?.[i]}
                customValue={legend.seriesColors?.[i]}
                onSelect={(idx) =>
                  onUpdate((draft) => {
                    const refs: Array<number | undefined> = [
                      ...(draft.settings.legend.seriesColorRefs ?? []),
                    ];
                    const cols: Array<string | undefined> = [
                      ...(draft.settings.legend.seriesColors ?? []),
                    ];
                    refs[i] = idx;
                    cols[i] = themeColors[idx];
                    draft.settings.legend.seriesColorRefs = refs;
                    draft.settings.legend.seriesColors = cols;
                  })
                }
                onCustom={(color) =>
                  onUpdate((draft) => {
                    const refs: Array<number | undefined> = [
                      ...(draft.settings.legend.seriesColorRefs ?? []),
                    ];
                    const cols: Array<string | undefined> = [
                      ...(draft.settings.legend.seriesColors ?? []),
                    ];
                    refs[i] = undefined;
                    cols[i] = color;
                    draft.settings.legend.seriesColorRefs = refs;
                    draft.settings.legend.seriesColors = cols;
                  })
                }
                disabledRefs={blockedThemeRefs}
                blockedValues={blockedColorValues}
              />
            </div>
          ))}
        </>
      )}

      {segmentToggleAvailable && normalizedType !== "pie" && (
        <label className={styles.segmentToggle}>
          <input
            type="checkbox"
            className={styles.segmentToggleInput}
            checked={segmentColorsEnabled}
            onChange={(e) =>
              onUpdate((draft) => {
                draft.settings.legend.segmentColorEnabled = e.target.checked;
                if (e.target.checked) {
                  ensureSegmentColors(draft, segmentCategories, themeColors, avoidColors);
                }
              })
            }
          />
          <span className={styles.segmentToggleVisual} aria-hidden="true" />
          <span className={styles.segmentToggleCopy}>
            <span className={styles.segmentToggleTitle}>Segment-specific colours</span>
            <span className={styles.segmentToggleHint}>
              Automatically assigns distinct colours to each series.
            </span>
          </span>
        </label>
      )}

      {hasSegmentControls && (
        <>
          <h4 className={styles.segmentHeading}>Segment Colours</h4>
          {segmentCategories.map((category) => (
            <div
              key={category}
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "6px",
                padding: "0.5rem 0.75rem",
                marginBottom: "0.5rem",
              }}
            >
              <div className={styles.segmentMeta}>
                Category: <code>{category}</code>
              </div>
              <ColorSwatches
                label="Colour"
                selectedRef={legend.segmentColorRefs?.[category]}
                customValue={legend.segmentColors?.[category]}
                disabledRefs={blockedThemeRefs}
                blockedValues={blockedColorValues}
                onSelect={(idx) =>
                  onUpdate((draft) => {
                    ensureSegmentColors(draft, segmentCategories, themeColors, avoidColors);
                    const refs =
                      draft.settings.legend.segmentColorRefs ??
                      (draft.settings.legend.segmentColorRefs = {});
                    const colors =
                      draft.settings.legend.segmentColors ??
                      (draft.settings.legend.segmentColors = {});
                    refs[category] = idx;
                    delete colors[category];
                  })
                }
                onCustom={(color) =>
                  onUpdate((draft) => {
                    ensureSegmentColors(draft, segmentCategories, themeColors, avoidColors);
                    const refs =
                      draft.settings.legend.segmentColorRefs ??
                      (draft.settings.legend.segmentColorRefs = {});
                    const colors =
                      draft.settings.legend.segmentColors ??
                      (draft.settings.legend.segmentColors = {});
                    delete refs[category];
                    colors[category] = color;
                  })
                }
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
