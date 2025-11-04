"use client";
import styles from "../CardSettings.module.css";

export default function TitleInput({
  value,
  size,
  onChange,
}: {
  value: string;
  size: number;
  onChange: (v: { title?: string; size?: number }) => void;
}) {
  return (
    <>
      <label>
        Title
        <input
          type="text"
          value={value}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>

      <div className={styles.sliderLabel}>
        <div className={styles.sliderHeader}>
          <span>Title Size (rem)</span>
          <input
            type="number"
            step="0.1"
            min="0.8"
            max="3"
            value={Number(size ?? 1.25).toFixed(1)}
            onChange={(e) =>
              onChange({ size: parseFloat(e.target.value) || 0 })
            }
            className={styles.numeric}
          />
        </div>
        <input
          type="range"
          min="0.8"
          max="3"
          step="0.1"
          value={size ?? 1.25}
          onChange={(e) => onChange({ size: Number(e.target.value) })}
        />
      </div>
    </>
  );
}
