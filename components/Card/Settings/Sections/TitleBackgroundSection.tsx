"use client";
import type { CSSProperties } from "react";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ColorSwatches from "@/components/ColorSwatches";
import { TitleInput } from "@/components/Card/Settings/Inputs";
import styles from "../CardSettings.module.css";
import type { AlignX, Card, TitleBackgroundSettings } from "@/types";
import { useTheme } from "@/context/ThemeContext";

type Props = {
  card: Card;
  onUpdate: (updater: (draft: Card) => void) => void;
  blockedThemeRefs?: number[];
  blockedColorValues?: string[];
};

export default function TitleBackgroundSection({
  card,
  onUpdate,
  blockedThemeRefs,
  blockedColorValues,
}: Props) {
  const { themeColors } = useTheme();
  type StyleKey = "titleBold" | "titleItalic" | "titleUnderline";
  const textStyles: Array<{ key: StyleKey; label: string; title: string; style?: CSSProperties }> = [
    { key: "titleBold", label: "B", title: "Bold", style: { fontWeight: 700 } },
    { key: "titleItalic", label: "I", title: "Italic", style: { fontStyle: "italic" } },
    { key: "titleUnderline", label: "U", title: "Underline", style: { textDecoration: "underline" } },
  ];
  const alignmentOptions: Array<{ pos: AlignX; Icon: LucideIcon }> = [
    { pos: "left", Icon: AlignLeft },
    { pos: "center", Icon: AlignCenter },
    { pos: "right", Icon: AlignRight },
  ];
  const isStyleActive = (config: TitleBackgroundSettings, key: StyleKey) =>
    Boolean(config[key]);
  const toggleStyle = (config: TitleBackgroundSettings, key: StyleKey) => {
    config[key] = !config[key];
  };

  return (
    <>
      <TitleInput
        value={card.settings.titleBackground.title}
        size={card.settings.titleBackground.titleSize ?? 1.25}
        onChange={({ title, size }) =>
          onUpdate((draft) => {
            if (title !== undefined) draft.settings.titleBackground.title = title;
            if (size !== undefined) draft.settings.titleBackground.titleSize = size;
          })
        }
      />

      <div className={styles.alignmentGroup}>
        <span className={styles.sectionTitle}>Title Alignment</span>
        <div className={styles.alignButtons}>
          {alignmentOptions.map(({ pos, Icon }) => (
            <button
              key={pos}
              className={`${styles.alignBtn} ${
                (card.settings.titleBackground.titleAlign || "center") === pos ? styles.active : ""
              }`}
              onClick={() =>
                onUpdate((draft) => {
                  draft.settings.titleBackground.titleAlign = pos;
                })
              }
              title={`Align ${pos}`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className={styles.alignmentGroup}>
        <span className={styles.sectionTitle}>Title Style</span>
        <div className={styles.alignButtons}>
          {textStyles.map(({ key, label, title, style }) => {
            const isActive = isStyleActive(card.settings.titleBackground, key);
            return (
              <button
                key={key}
                className={`${styles.alignBtn} ${isActive ? styles.active : ""}`}
                onClick={() =>
                  onUpdate((draft) => {
                    toggleStyle(draft.settings.titleBackground, key);
                  })
                }
                title={title}
                aria-pressed={isActive}
                style={style}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <ColorSwatches
        label="Title Colour"
        selectedRef={card.settings.titleBackground.titleColorRef}
        customValue={card.settings.titleBackground.titleColor}
        onSelect={(idx) =>
          onUpdate((draft) => {
            draft.settings.titleBackground.titleColorRef = idx;
            draft.settings.titleBackground.titleColor = undefined;
          })
        }
        onCustom={(color) =>
          onUpdate((draft) => {
            draft.settings.titleBackground.titleColorRef = undefined;
            draft.settings.titleBackground.titleColor = color;
          })
        }
        disabledRefs={blockedThemeRefs}
        blockedValues={blockedColorValues}
      />

      <ColorSwatches
        label="Background Colour"
        selectedRef={card.settings.titleBackground.bgColorRef}
        customValue={card.settings.titleBackground.bgColor}
        onSelect={(idx) =>
          onUpdate((draft) => {
            const prevRef = draft.settings.titleBackground.bgColorRef;
            const prevValue =
              prevRef !== undefined ? themeColors[prevRef] : draft.settings.titleBackground.bgColor;
            draft.settings.titleBackground.bgColorRef = idx;
            draft.settings.titleBackground.bgColor = undefined;
            removeConflictingColors(draft, idx, themeColors[idx], {
              ref: prevRef,
              value: prevValue,
            });
          })
        }
        onCustom={(color) =>
          onUpdate((draft) => {
            const prevRef = draft.settings.titleBackground.bgColorRef;
            const prevValue =
              prevRef !== undefined ? themeColors[prevRef] : draft.settings.titleBackground.bgColor;
            draft.settings.titleBackground.bgColorRef = undefined;
            draft.settings.titleBackground.bgColor = color;
            removeConflictingColors(draft, undefined, color, {
              ref: prevRef,
              value: prevValue,
            });
          })
        }
      />
    </>
  );
}

function removeConflictingColors(
  target: Card,
  blockedRef?: number,
  blockedValue?: string,
  fallback?: { ref?: number; value?: string },
) {
  const blockedValueLower = blockedValue?.toLowerCase();
  const matchesRef = (value?: number) =>
    blockedRef !== undefined && value === blockedRef;
  const matchesValue = (value?: string) =>
    Boolean(blockedValueLower && value && value.toLowerCase() === blockedValueLower);
  const fallbackRef =
    fallback?.ref !== undefined && fallback.ref !== blockedRef ? fallback.ref : undefined;
  const fallbackValue =
    fallback?.value &&
    (!blockedValueLower || fallback.value.toLowerCase() !== blockedValueLower)
      ? fallback.value
      : undefined;

  const assignFallback = (
    setRef: (value: number | undefined) => void,
    setValue: (value: string | undefined) => void,
  ) => {
    if (fallbackRef !== undefined) {
      setRef(fallbackRef);
      setValue(undefined);
    } else if (fallbackValue) {
      setRef(undefined);
      setValue(fallbackValue);
    } else {
      setRef(undefined);
      setValue(undefined);
    }
  };

  if (matchesRef(target.settings.titleBackground.titleColorRef)) {
    assignFallback(
      (value) => {
        target.settings.titleBackground.titleColorRef = value;
      },
      (value) => {
        target.settings.titleBackground.titleColor = value;
      },
    );
  }
  if (matchesValue(target.settings.titleBackground.titleColor)) {
    assignFallback(
      (value) => {
        target.settings.titleBackground.titleColorRef = value;
      },
      (value) => {
        target.settings.titleBackground.titleColor = value;
      },
    );
  }

  if (target.kind === "measure") {
    const m = target.settings.measureAppearance;
    if (matchesRef(m.colorRef) || matchesValue(m.color)) {
      assignFallback(
        (value) => {
          m.colorRef = value;
        },
        (value) => {
          m.color = value;
        },
      );
    }
    return;
  }

  const axes = target.settings.axes;
  if (matchesRef(axes.axisTitleColorRef) || matchesValue(axes.axisTitleColor)) {
    assignFallback(
      (value) => {
        axes.axisTitleColorRef = value;
      },
      (value) => {
        axes.axisTitleColor = value;
      },
    );
  }
  if (matchesRef(axes.labelColorRef) || matchesValue(axes.labelColor)) {
    assignFallback(
      (value) => {
        axes.labelColorRef = value;
      },
      (value) => {
        axes.labelColor = value;
      },
    );
  }

  const legend = target.settings.legend;
  const segmentColorRefs = legend.segmentColorRefs;
  const segmentColors = legend.segmentColors;
  const maxSeries = Math.max(
    legend.seriesColorRefs?.length ?? 0,
    legend.seriesColors?.length ?? 0,
  );
  for (let i = 0; i < maxSeries; i += 1) {
    const ref = legend.seriesColorRefs?.[i];
    const color = legend.seriesColors?.[i];
    if (matchesRef(ref) || matchesValue(color)) {
      if (fallbackRef !== undefined) {
        if (legend.seriesColorRefs) legend.seriesColorRefs[i] = fallbackRef;
        if (legend.seriesColors) legend.seriesColors[i] = undefined;
      } else if (fallbackValue) {
        if (legend.seriesColorRefs) legend.seriesColorRefs[i] = undefined;
        if (legend.seriesColors) legend.seriesColors[i] = fallbackValue;
      } else {
        if (legend.seriesColorRefs) legend.seriesColorRefs[i] = undefined;
        if (legend.seriesColors) legend.seriesColors[i] = undefined;
      }
    }
  }
  if (segmentColorRefs) {
    Object.keys(segmentColorRefs).forEach((key) => {
      const ref = segmentColorRefs[key];
      if (matchesRef(ref)) {
        if (fallbackRef !== undefined) {
          segmentColorRefs[key] = fallbackRef;
          if (segmentColors) segmentColors[key] = undefined;
        } else if (fallbackValue) {
          delete segmentColorRefs[key];
          if (segmentColors) segmentColors[key] = fallbackValue;
        } else {
          delete segmentColorRefs[key];
        }
      }
    });
  }
  if (segmentColors) {
    Object.keys(segmentColors).forEach((key) => {
      const color = segmentColors[key];
      if (matchesValue(color)) {
        if (fallbackRef !== undefined) {
          legend.segmentColorRefs = legend.segmentColorRefs ?? {};
          legend.segmentColorRefs[key] = fallbackRef;
          segmentColors[key] = undefined;
        } else if (fallbackValue) {
          segmentColors[key] = fallbackValue;
        } else {
          delete segmentColors[key];
        }
      }
    });
  }
}
