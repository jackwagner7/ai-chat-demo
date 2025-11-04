"use client";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from "lucide-react";
import ColorSwatches from "@/components/ColorSwatches";
import styles from "../CardSettings.module.css";
import type { Card } from "@/types";
import { useTheme } from "@/context/ThemeContext";

type MeasureCard = Extract<Card, { kind: "measure" }>;

type Props = {
  card: MeasureCard;
  onUpdate: (updater: (draft: MeasureCard) => void) => void;
};

export default function MeasureAppearanceSection({ card, onUpdate }: Props) {
  const { themeColors } = useTheme();
  const appearance = card.settings.measureAppearance;

  return (
    <div className={styles.sectionBody}>
      <div className={styles.sliderLabel}>
        <div className={styles.sliderHeader}>
          <span>Measure Size (rem)</span>
          <input
            type="number"
            step="0.1"
            min="1"
            max="6"
            value={Number(appearance.fontSize ?? 3).toFixed(1)}
            onChange={(e) =>
              onUpdate((draft) => {
                draft.settings.measureAppearance.fontSize = parseFloat(e.target.value) || 0;
              })
            }
            className={styles.numeric}
          />
        </div>
        <input
          type="range"
          min="1"
          max="6"
          step="0.1"
          value={appearance.fontSize ?? 3}
          onChange={(e) =>
            onUpdate((draft) => {
              draft.settings.measureAppearance.fontSize = Number(e.target.value);
            })
          }
        />
      </div>

      <div className={styles.alignmentGroup}>
        <span className={styles.sectionTitle}>Measure Alignment</span>
        <div className={styles.alignButtons}>
          {[
            { pos: "left", Icon: AlignLeft },
            { pos: "center", Icon: AlignCenter },
            { pos: "right", Icon: AlignRight },
          ].map(({ pos, Icon }) => (
            <button
              key={pos}
              className={`${styles.alignBtn} ${
                (appearance.measureAlignX || "center") === pos ? styles.active : ""
              }`}
              onClick={() =>
                onUpdate((draft) => {
                  draft.settings.measureAppearance.measureAlignX = pos as any;
                })
              }
              title={`Align ${pos}`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        <div className={styles.alignButtons}>
          {[
            { pos: "top", Icon: AlignVerticalJustifyStart },
            { pos: "center", Icon: AlignVerticalJustifyCenter },
            { pos: "bottom", Icon: AlignVerticalJustifyEnd },
          ].map(({ pos, Icon }) => (
            <button
              key={pos}
              className={`${styles.alignBtn} ${
                (appearance.measureAlignY || "center") === pos ? styles.active : ""
              }`}
              onClick={() =>
                onUpdate((draft) => {
                  draft.settings.measureAppearance.measureAlignY = pos as any;
                })
              }
              title={`Align ${pos}`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      <ColorSwatches
        label="Measure Colour"
        selectedRef={appearance.colorRef}
        onSelect={(idx) =>
          onUpdate((draft) => {
            draft.settings.measureAppearance.colorRef = idx;
            draft.settings.measureAppearance.color = undefined;
          })
        }
        onCustom={(color) =>
          onUpdate((draft) => {
            draft.settings.measureAppearance.colorRef = undefined;
            draft.settings.measureAppearance.color = color;
          })
        }
        disabledRefs={card.settings.titleBackground.bgColorRef !== undefined
          ? [card.settings.titleBackground.bgColorRef]
          : undefined}
        blockedValues={
          card.settings.titleBackground.bgColor
            ? [card.settings.titleBackground.bgColor]
            : undefined
        }
      />
    </div>
  );
}
