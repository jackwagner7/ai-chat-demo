"use client";
import { createContext, useContext, useState } from "react";

type ThemeContextType = {
  themeColors: string[];
  setThemeColors: (colors: string[]) => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeColors, setThemeColors] = useState<string[]>([
    "#0078d4", // heading
    "#111111", // measure text
    "#ffffff", // background
  ]);

  return (
    <ThemeContext.Provider value={{ themeColors, setThemeColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
