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
    <details open={open}>
      <summary
        className={`${styles.sectionHeader} ${open ? styles.open : ""}`}
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
      >
        <ChevronRight size={16} className={`${styles.chevron} ${open ? styles.rotate : ""}`} />
        <span>{label}</span>
      </summary>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </details>
  );
}
