"use client";
import { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react";

type ThemeContextType = {
  themeColors: string[];
  setThemeColors: Dispatch<SetStateAction<string[]>>;
  backgroundColor: string;
  setBackgroundColor: Dispatch<SetStateAction<string>>;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeColors, setThemeColors] = useState<string[]>([
    "#0078d4", // heading
    "#111111", // measure text
    "#ffffff", // accent
  ]);
  const [backgroundColor, setBackgroundColor] = useState("#f0e7d5");

  return (
    <ThemeContext.Provider
      value={{ themeColors, setThemeColors, backgroundColor, setBackgroundColor }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
