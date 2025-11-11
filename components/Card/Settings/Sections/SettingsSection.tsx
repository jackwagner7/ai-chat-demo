"use client";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "../CardSettings.module.css";

type Props = {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export default function SettingsSection({ label, open, onToggle, children }: Props) {
  return (
    <details open={open} className={styles.sectionCard}>
      <summary
        className={styles.sectionHeader}
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
      >
        <span>{label}</span>
        <ChevronRight size={18} className={`${styles.chevron} ${open ? styles.rotate : ""}`} />
      </summary>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </details>
  );
}
