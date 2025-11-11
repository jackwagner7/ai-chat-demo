"use client";
import ColorSwatches from "@/components/ColorSwatches";
import styles from "../CardSettings.module.css";
import type { Card } from "@/types";

type ChartCard = Extract<Card, { kind: "chart" }>;

type Props = {
  card: ChartCard;
  onUpdate: (updater: (draft: ChartCard) => void) => void;
};

export default function AxesSection({ card, onUpdate }: Props) {
  const hasAxisTitle = Boolean(card.settings.axes.xLabel?.trim()) || Boolean(card.settings.axes.yLabel?.trim());
  return (
    <div className={styles.sectionBody}>
      <label>
        X Axis Label
        <input
          type="text"
          value={card.settings.axes.xLabel || ""}
          onChange={(e) =>
            onUpdate((draft) => {
              draft.settings.axes.xLabel = e.target.value;
            })
          }
        />
      </label>
      <label>
        Y Axis Label
        <input
          type="text"
          value={card.settings.axes.yLabel || ""}
          onChange={(e) =>
            onUpdate((draft) => {
              draft.settings.axes.yLabel = e.target.value;
            })
          }
        />
      </label>

      {hasAxisTitle && (
        <>
          <div className={styles.sliderLabel}>
            <div className={styles.sliderHeader}>
              <span>Axis Title Size (rem)</span>
              <input
                type="number"
                step="0.1"
                min="0.8"
                max="2"
                value={Number(card.settings.axes.axisTitleSize ?? 1).toFixed(1)}
                onChange={(e) =>
                  onUpdate((draft) => {
                    draft.settings.axes.axisTitleSize = parseFloat(e.target.value) || 0;
                  })
                }
                className={styles.numeric}
              />
            </div>
            <input
              type="range"
              min="0.8"
              max="2"
              step="0.1"
              value={card.settings.axes.axisTitleSize ?? 1}
              onChange={(e) =>
                onUpdate((draft) => {
                  draft.settings.axes.axisTitleSize = Number(e.target.value);
                })
              }
            />
          </div>

          <ColorSwatches
            label="Axis Title Colour"
            selectedRef={card.settings.axes.axisTitleColorRef}
            customValue={card.settings.axes.axisTitleColor}
            onSelect={(idx) =>
              onUpdate((draft) => {
                draft.settings.axes.axisTitleColorRef = idx;
                draft.settings.axes.axisTitleColor = undefined;
              })
            }
            onCustom={(color) =>
              onUpdate((draft) => {
                draft.settings.axes.axisTitleColorRef = undefined;
                draft.settings.axes.axisTitleColor = color;
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
        </>
      )}

      <div className={styles.sliderLabel}>
        <div className={styles.sliderHeader}>
          <span>Tick Label Size (rem)</span>
          <input
            type="number"
            step="0.1"
            min="0.6"
            max="2"
            value={Number(card.settings.axes.labelSize ?? 0.9).toFixed(1)}
            onChange={(e) =>
              onUpdate((draft) => {
                draft.settings.axes.labelSize = parseFloat(e.target.value) || 0;
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
          value={card.settings.axes.labelSize ?? 0.9}
          onChange={(e) =>
            onUpdate((draft) => {
              draft.settings.axes.labelSize = Number(e.target.value);
            })
          }
        />
      </div>

      <ColorSwatches
        label="Tick Label Colour"
        selectedRef={card.settings.axes.labelColorRef}
        customValue={card.settings.axes.labelColor}
        onSelect={(idx) =>
          onUpdate((draft) => {
            draft.settings.axes.labelColorRef = idx;
            draft.settings.axes.labelColor = undefined;
          })
        }
        onCustom={(color) =>
          onUpdate((draft) => {
            draft.settings.axes.labelColorRef = undefined;
            draft.settings.axes.labelColor = color;
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
