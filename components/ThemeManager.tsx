"use client";
import { useState, useEffect, useRef } from "react";
import { HexColorPicker } from "react-colorful";
import { Paintbrush } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import styles from "./ThemeManager.module.css";

export default function ThemeManager() {
  const { themeColors, setThemeColors } = useTheme();
  const [localColors, setLocalColors] = useState([...themeColors]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalColors([...themeColors]);
  }, [themeColors]);

  // click-outside handler
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const updateColor = (i: number, newColor: string) => {
    const updated = [...localColors];
    updated[i] = newColor;
    setLocalColors(updated);
    setThemeColors(updated);
  };

  const addColor = () => {
    if (localColors.length < 6) {
      const updated = [...localColors, "#cccccc"];
      setLocalColors(updated);
      setThemeColors(updated);
    }
  };

  const removeColor = (i: number) => {
    const updated = localColors.filter((_, idx) => idx !== i);
    setLocalColors(updated);
    setThemeColors(updated);
  };

  return (
    <>
      {/* 🎨 Floating button */}
      <button
        className={styles.fab}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Edit Theme"
      >
        <Paintbrush size={20} />
      </button>

      {/* ⚙️ Slide-in panel */}
      {open && (
        <div ref={panelRef} className={styles.sidebar}>
          <h2>Theme Colours</h2>
          <p className={styles.subtitle}>
            Define up to 6 colours for your dashboard theme.
          </p>

          <div className={styles.colorList}>
            {localColors.map((c, i) => (
              <div key={i} className={styles.colorItem}>
                <HexColorPicker
                  color={c}
                  onChange={(col) => updateColor(i, col)}
                />
                <input
                  type="text"
                  value={c}
                  onChange={(e) => updateColor(i, e.target.value)}
                />
                {localColors.length > 3 && (
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeColor(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {localColors.length < 6 && (
            <button className={styles.addBtn} onClick={addColor}>
              ➕ Add Colour
            </button>
          )}
        </div>
      )}
    </>
  );
}
