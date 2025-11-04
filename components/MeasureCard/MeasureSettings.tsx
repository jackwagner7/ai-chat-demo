"use client";
import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Trash2,
  ChevronRight,
} from "lucide-react";
import ColorSwatches from "../ColorSwatches";
import { SqlRunner, TitleInput } from "../Card/Settings/Components";
import styles from "../Settings/SettingsShared.module.css";

export default function MeasureSettings({
  localMeasure,
  setLocalMeasure,
  setSelectedId,
  onDelete,
}: {
  localMeasure: any;
  setLocalMeasure: (m: any) => void;
  setSelectedId: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const { themeColors } = useTheme();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    title: true,
    measure: true,
    sql: false,
  });

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const SectionHeader = ({
    name,
    label,
  }: {
    name: string;
    label: string;
  }) => (
    <summary
      className={`${styles.sectionHeader} ${
        openSections[name] ? styles.open : ""
      }`}
      onClick={(e) => {
        e.preventDefault();
        toggleSection(name);
      }}
    >
      <ChevronRight
        size={16}
        className={`${styles.chevron} ${
          openSections[name] ? styles.rotate : ""
        }`}
      />
      <span>{label}</span>
    </summary>
  );

  return (
    <div className={styles.sidebar} onClick={(e) => e.stopPropagation()}>
      {/* 🗑 Delete (Top Right) */}
      <div className={styles.deleteTop}>
        <button
          onClick={() => {
            if (window.confirm("Delete this measure?")) onDelete(localMeasure.id);
          }}
          title="Delete measure"
          className={styles.deleteIconBtn}
        >
          <Trash2 size={18} />
        </button>
      </div>

      <h2>Measure Settings</h2>

      {/* ===== TITLE & BACKGROUND ===== */}
      <details open={openSections.title}>
        <SectionHeader name="title" label="Title & Background" />
        {openSections.title && (
          <div className={styles.sectionBody}>
            <TitleInput
              value={localMeasure.title}
              size={localMeasure.titleSize ?? 1.25}
              onChange={({ title, size }) =>
                setLocalMeasure({
                  ...localMeasure,
                  ...(title !== undefined && { title }),
                  ...(size !== undefined && { titleSize: size }),
                })
              }
            />

            {/* 🧭 Title Alignment */}
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
                      (localMeasure.titleAlign || "center") === pos
                        ? styles.active
                        : ""
                    }`}
                    onClick={() =>
                      setLocalMeasure({ ...localMeasure, titleAlign: pos })
                    }
                    title={`Align ${pos}`}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>

            {/* 🎨 Title Colour */}
            <ColorSwatches
              label="Title Colour"
              selectedRef={localMeasure.titleColorRef}
              onSelect={(idx) =>
                setLocalMeasure({
                  ...localMeasure,
                  titleColorRef: idx,
                  titleColor: undefined,
                })
              }
              onCustom={(color) =>
                setLocalMeasure({
                  ...localMeasure,
                  titleColorRef: undefined,
                  titleColor: color,
                })
              }
            />

            {/* 🎨 Background Colour */}
            <ColorSwatches
              label="Background Colour"
              selectedRef={localMeasure.bgColorRef}
              onSelect={(idx) =>
                setLocalMeasure({
                  ...localMeasure,
                  bgColorRef: idx,
                  bgColor: undefined,
                })
              }
              onCustom={(color) =>
                setLocalMeasure({
                  ...localMeasure,
                  bgColorRef: undefined,
                  bgColor: color,
                })
              }
            />
          </div>
        )}
      </details>

      {/* ===== MEASURE APPEARANCE ===== */}
      <details open={openSections.measure}>
        <SectionHeader name="measure" label="Measure Appearance" />
        {openSections.measure && (
          <div className={styles.sectionBody}>
            {/* 🔢 Measure Size */}
            <div className={styles.sliderLabel}>
              <div className={styles.sliderHeader}>
                <span>Measure Size (rem)</span>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="6"
                  value={Number(localMeasure.fontSize ?? 3).toFixed(1)}
                  onChange={(e) =>
                    setLocalMeasure({
                      ...localMeasure,
                      fontSize: parseFloat(e.target.value) || 0,
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
                value={localMeasure.fontSize ?? 3}
                onChange={(e) =>
                  setLocalMeasure({
                    ...localMeasure,
                    fontSize: Number(e.target.value),
                  })
                }
              />
            </div>

            {/* 🧭 Measure Alignment */}
            <div className={styles.alignmentGroup}>
              <span className={styles.sectionTitle}>Measure Alignment</span>
              <div className={styles.align2D}>
              <div className={styles.alignButtons}>
                {[
                  { pos: "left", Icon: AlignLeft },
                  { pos: "center", Icon: AlignCenter },
                  { pos: "right", Icon: AlignRight },
                ].map(({ pos, Icon }) => (
                  <button
                    key={pos}
                    className={`${styles.alignBtn} ${
                        (localMeasure.measureAlignX || "center") === pos
                          ? styles.active
                          : ""
                    }`}
                    onClick={() =>
                        setLocalMeasure({
                          ...localMeasure,
                        measureAlignX: pos,
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
                        (localMeasure.measureAlignY || "center") === pos
                          ? styles.active
                          : ""
                    }`}
                    onClick={() =>
                        setLocalMeasure({
                          ...localMeasure,
                        measureAlignY: pos,
                      })
                    }
                    title={`Align ${pos}`}
                  >
                    <Icon size={16} />
                  </button>
                ))}
                </div>
              </div>
            </div>

            {/* 🎨 Measure Colour */}
            <ColorSwatches
              label="Measure Colour"
              selectedRef={localMeasure.colorRef}
              onSelect={(idx) =>
                setLocalMeasure({
                  ...localMeasure,
                  colorRef: idx,
                  color: undefined,
                })
              }
              onCustom={(color) =>
                setLocalMeasure({
                  ...localMeasure,
                  colorRef: undefined,
                  color,
                })
              }
            />
          </div>
        )}
      </details>

      {/* ===== SQL ===== */}
      <details open={openSections.sql}>
        <SectionHeader name="sql" label="SQL" />
        {openSections.sql && (
          <div className={styles.sectionBody}>
            <SqlRunner
              code={localMeasure.code}
              onRunSuccess={(rows, newSql) => {
                const firstValue = Object.values(rows[0])[0];
                setLocalMeasure((prev: any) => ({
                  ...prev,
                  code: newSql,
                  value: String(firstValue),
                }));
              }}
            />
          </div>
        )}
      </details>
    </div>
  );
}
