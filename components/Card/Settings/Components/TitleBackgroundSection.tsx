"use client";
import type { CSSProperties } from "react";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import ColorSwatches from "@/components/ColorSwatches";
import { TitleInput } from ".";
import styles from "../CardSettings.module.css";
import type { Card } from "@/types";
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
          {[
            { pos: "left", Icon: AlignLeft },
            { pos: "center", Icon: AlignCenter },
            { pos: "right", Icon: AlignRight },
          ].map(({ pos, Icon }) => (
            <button
              key={pos}
              className={`${styles.alignBtn} ${
                (card.settings.titleBackground.titleAlign || "center") === pos ? styles.active : ""
              }`}
              onClick={() =>
                onUpdate((draft) => {
                  draft.settings.titleBackground.titleAlign = pos as any;
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
            const isActive = Boolean((card.settings.titleBackground as any)[key]);
            return (
              <button
                key={key}
                className={`${styles.alignBtn} ${isActive ? styles.active : ""}`}
                onClick={() =>
                  onUpdate((draft) => {
                    const current = Boolean((draft.settings.titleBackground as any)[key]);
                    (draft.settings.titleBackground as any)[key] = !current;
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

  if (matchesRef(target.settings.titleBackground.titleColorRef)) {
    if (fallbackRef !== undefined) {
      target.settings.titleBackground.titleColorRef = fallbackRef;
      target.settings.titleBackground.titleColor = undefined;
    } else if (fallbackValue) {
      target.settings.titleBackground.titleColorRef = undefined;
      target.settings.titleBackground.titleColor = fallbackValue;
    } else {
      target.settings.titleBackground.titleColorRef = undefined;
    }
  }
  if (matchesValue(target.settings.titleBackground.titleColor)) {
    if (fallbackRef !== undefined) {
      target.settings.titleBackground.titleColorRef = fallbackRef;
      target.settings.titleBackground.titleColor = undefined;
    } else if (fallbackValue) {
      target.settings.titleBackground.titleColor = fallbackValue;
    } else {
      target.settings.titleBackground.titleColor = undefined;
    }
  }

  if (target.kind === "measure") {
    const m = target.settings.measureAppearance;
    if (matchesRef(m.colorRef)) m.colorRef = undefined;
    if (matchesValue(m.color)) m.color = undefined;
    return;
  }

  const axes = target.settings.axes;
  if (matchesRef(axes.axisTitleColorRef)) axes.axisTitleColorRef = undefined;
  if (matchesValue(axes.axisTitleColor)) axes.axisTitleColor = undefined;
  if (matchesRef(axes.labelColorRef)) axes.labelColorRef = undefined;
  if (matchesValue(axes.labelColor)) axes.labelColor = undefined;

  const legend = target.settings.legend;
  if (legend.seriesColorRefs) {
    legend.seriesColorRefs = legend.seriesColorRefs.map((ref) =>
      matchesRef(ref) ? (undefined as any) : ref,
    );
  }
  if (legend.seriesColors) {
    legend.seriesColors = legend.seriesColors.map((color) =>
      matchesValue(color) ? undefined : color,
    );
  }
  if (legend.segmentColorRefs) {
    Object.keys(legend.segmentColorRefs).forEach((key) => {
      const ref = legend.segmentColorRefs![key];
      if (matchesRef(ref)) {
        delete legend.segmentColorRefs![key];
      }
    });
  }
  if (legend.segmentColors) {
    Object.keys(legend.segmentColors).forEach((key) => {
      const color = legend.segmentColors![key];
      if (matchesValue(color)) {
        delete legend.segmentColors![key];
      }
    });
  }
}
