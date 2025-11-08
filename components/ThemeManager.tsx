"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Paintbrush, Plus } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { useTheme } from "@/context/ThemeContext";
import styles from "./ThemeManager.module.css";

const DEFAULT_COLOR = "#cccccc";

type ActiveTarget =
  | { kind: "palette"; index: number }
  | { kind: "background" }
  | null;

const normalizeHex = (value: string): string | null => {
  const trimmed = value.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return null;
};

export default function ThemeManager() {
  const { themeColors, setThemeColors, backgroundColor, setBackgroundColor } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ActiveTarget>(null);
  const [pendingHex, setPendingHex] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.body.getAttribute("data-settings-sidebar") === "open";
  });
  const trayRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const resolvedActiveTarget = useMemo<ActiveTarget>(() => {
    if (activeTarget?.kind === "palette") {
      if (activeTarget.index >= themeColors.length) {
        if (!themeColors.length) return null;
        return { kind: "palette", index: themeColors.length - 1 };
      }
    }
    return activeTarget;
  }, [activeTarget, themeColors.length]);

  const fallbackHex = useMemo(
    () => themeColors[0] ?? backgroundColor ?? DEFAULT_COLOR,
    [themeColors, backgroundColor],
  );

  const derivedHex = useMemo(() => {
    if (!resolvedActiveTarget) {
      return fallbackHex;
    }
    if (resolvedActiveTarget.kind === "background") {
      return backgroundColor ?? DEFAULT_COLOR;
    }
    return themeColors[resolvedActiveTarget.index] ?? DEFAULT_COLOR;
  }, [resolvedActiveTarget, fallbackHex, backgroundColor, themeColors]);

  const openTray = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setPendingHex(null);
    setIsVisible(true);
    setIsOpen(true);
  };

  const closeTray = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    setIsOpen(false);
    setActiveTarget(null);
    setPendingHex(null);
    closeTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      closeTimerRef.current = null;
    }, 350);
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    const update = () => {
      setSidebarOpen(body.getAttribute("data-settings-sidebar") === "open");
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-settings-sidebar") {
          update();
          break;
        }
      }
    });
    observer.observe(body, { attributes: true, attributeFilter: ["data-settings-sidebar"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!resolvedActiveTarget) return;
    const handleClick = (event: MouseEvent) => {
      const tray = trayRef.current;
      if (!tray) return;
      if (!tray.contains(event.target as Node)) {
        setActiveTarget(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [resolvedActiveTarget]);

  const updateColor = (index: number, value: string) => {
    setThemeColors((prev) => {
      if (prev[index] === value) return prev;
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const togglePicker = (idx: number) => {
    setActiveTarget((current) => {
      const same = current?.kind === "palette" && current.index === idx;
      if (!same) {
        setPendingHex(null);
        return { kind: "palette", index: idx };
      }
      return null;
    });
  };

  const toggleBackgroundPicker = () => {
    setActiveTarget((current) => {
      if (current?.kind === "background") {
        return null;
      }
      setPendingHex(null);
      return { kind: "background" };
    });
  };

  const handlePickerChange = (color: string) => {
    if (!resolvedActiveTarget) return;
    if (resolvedActiveTarget.kind === "background") {
      setBackgroundColor(color);
      return;
    }
    updateColor(resolvedActiveTarget.index, color);
    setPendingHex(null);
  };

  const handleHexChange = (value: string) => {
    if (!resolvedActiveTarget) return;
    const formatted = value.startsWith("#") ? value : `#${value}`;
    setPendingHex(formatted.slice(0, 7));
    const normalized = normalizeHex(formatted);
    if (!normalized) return;
    if (resolvedActiveTarget.kind === "background") {
      setBackgroundColor(normalized);
    } else {
      updateColor(resolvedActiveTarget.index, normalized);
    }
    setPendingHex(null);
  };

  const addColor = () => {
    if (themeColors.length >= 6) return;
    const next = [...themeColors, DEFAULT_COLOR];
    setThemeColors(next);
    setActiveTarget({ kind: "palette", index: next.length - 1 });
    setPendingHex(DEFAULT_COLOR);
  };

  const removeColor = (index: number) => {
    if (themeColors.length <= 3) return;
    const next = themeColors.filter((_, idx) => idx !== index);
    setThemeColors(next);
    setActiveTarget((current) => {
      if (current?.kind !== "palette") return current;
      if (current.index === index) return null;
      if (current.index > index) return { kind: "palette", index: current.index - 1 };
      return current;
    });
  };

  const pickerColor = derivedHex ?? DEFAULT_COLOR;
  const inputValue = (pendingHex ?? pickerColor).toUpperCase();

  const isBackgroundActive = resolvedActiveTarget?.kind === "background";

  const renderPopover = (allowRemoval: boolean, removeHandler?: () => void) => (
    <div
      className={styles.popover}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <HexColorPicker color={pickerColor} onChange={handlePickerChange} />
      <label className={styles.hexField}>
        Hex
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleHexChange(e.target.value)}
          spellCheck={false}
        />
      </label>
      {allowRemoval && removeHandler && (
        <button className={styles.removeBtn} onClick={removeHandler} type="button">
          Remove colour
        </button>
      )}
    </div>
  );

  return (
    <>
      {isVisible && (
        <>
          <div
            ref={trayRef}
            className={`${styles.tray} ${sidebarOpen ? styles.trayShift : ""} ${
              isOpen ? styles.trayEntering : styles.trayClosing
            }`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.colorRow}>
              <div className={`${styles.colorCell} ${styles.backgroundCell}`}>
                <button
                  type="button"
                  className={`${styles.colorButton} ${isBackgroundActive ? styles.colorActive : ""}`}
                  style={{ background: backgroundColor }}
                  onClick={toggleBackgroundPicker}
                  aria-pressed={isBackgroundActive}
                  aria-label="Edit background colour"
                >
                  <span className={styles.backgroundBadge}>BG</span>
                  <span className={styles.colorHex}>{backgroundColor?.toUpperCase()}</span>
                </button>
                {isBackgroundActive && renderPopover(false)}
              </div>

              {themeColors.map((color, idx) => {
                const isActive =
                  resolvedActiveTarget?.kind === "palette" &&
                  resolvedActiveTarget.index === idx;
                return (
                  <div key={`palette-${idx}`} className={styles.colorCell}>
                    <button
                      type="button"
                      className={`${styles.colorButton} ${isActive ? styles.colorActive : ""}`}
                      style={{ background: color }}
                      onClick={() => togglePicker(idx)}
                      aria-pressed={isActive}
                      aria-label={`Edit colour ${idx + 1}`}
                    >
                      <span className={styles.colorHex}>{color?.toUpperCase()}</span>
                    </button>
                    {isActive && renderPopover(themeColors.length > 3, () => removeColor(idx))}
                  </div>
                );
              })}
            </div>
          </div>
          {themeColors.length < 6 && (
            <button
              className={`${styles.addButton} ${sidebarOpen ? styles.buttonShift : ""}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                addColor();
              }}
              title="Add colour"
              type="button"
            >
              <Plus size={20} />
            </button>
          )}
        </>
      )}

      <button
        className={`${styles.fab} ${isOpen ? styles.fabActive : ""} ${
          sidebarOpen ? styles.fabShift : ""
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            closeTray();
          } else {
            openTray();
          }
        }}
        title="Toggle Theme Manager"
        aria-pressed={isOpen}
        type="button"
      >
        <Paintbrush size={20} />
      </button>
    </>
  );
}
