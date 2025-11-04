"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { HexColorPicker } from "react-colorful";
import { useTheme } from "@/context/ThemeContext";
import { Palette } from "lucide-react";
import styles from "./ColorSwatches.module.css";

export default function ColorSwatches({
  label,
  selectedRef,
  onSelect,
  onCustom,
  disabledRefs,
  blockedValues,
}: {
  label: string;
  selectedRef?: number;
  onSelect: (idx: number) => void;
  onCustom: (color: string) => void;
  disabledRefs?: number[];
  blockedValues?: string[];
}) {
  const { themeColors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customColor, setCustomColor] = useState("#888");
  const [isCustomActive, setIsCustomActive] = useState(false);
  const lastAllowedCustom = useRef("#888");

  const blockedValueSet = useMemo(
    () =>
      new Set(
        (blockedValues || [])
          .filter(Boolean)
          .map((value) => value.toLowerCase()),
      ),
    [blockedValues],
  );

  const isColorBlocked = (color?: string) => {
    if (!color) return false;
    return blockedValueSet.has(color.toLowerCase());
  };

  useEffect(() => {
    setIsCustomActive(selectedRef === undefined);
  }, [selectedRef]);

  return (
    <div className={styles.colorSection}>
      <span className={styles.colorLabel}>{label}</span>

      <div className={styles.swatchRow}>
        {themeColors.map((c, idx) => {
          const blocked = isColorBlocked(c);
          const disabled = disabledRefs?.includes(idx) || blocked;
          return (
            <button
              key={idx}
              className={`${styles.swatch} ${selectedRef === idx ? styles.swatchActive : ""} ${
                blocked ? styles.swatchBlocked : ""
              }`}
              style={{ background: c, opacity: disabled ? 0.35 : 1 }}
              onClick={() => {
                if (disabled) return;
                setPickerOpen(false);
                setIsCustomActive(false);
                onSelect(idx);
              }}
              title={
                blocked ? "Colour already in use" : `Use Theme Colour ${idx + 1}`
              }
              disabled={disabled}
            />
          );
        })}

        <button
          className={`${styles.swatch} ${styles.customSwatch} ${
            isCustomActive ? styles.swatchActive : ""
          }`}
          onClick={() => setPickerOpen((p) => !p)}
          title="Custom Colour"
        >
          <Palette size={18} />
        </button>
      </div>

      {pickerOpen && (
        <div className={styles.customPickerRow}>
          <HexColorPicker
            color={customColor}
            onChange={(c) => {
              if (isColorBlocked(c)) {
                // revert picker to last allowed shade and keep it open
                setCustomColor(lastAllowedCustom.current);
                return;
              }
              setCustomColor(c);
              lastAllowedCustom.current = c;
              setIsCustomActive(true);
              onCustom(c);
            }}
          />
        </div>
      )}
    </div>
  );
}
