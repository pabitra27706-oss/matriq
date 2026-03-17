"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════ */
/* THEME CONTEXT                                                     */
/* ══════════════════════════════════════════════════════════════════ */
type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  isDark: boolean;
  isLight: boolean;
}

const ThemeCtx = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  isDark: true,
  isLight: false,
});

export const useTheme = () => useContext(ThemeCtx);

/* ══════════════════════════════════════════════════════════════════ */
/* APPLY THEME TO DOM                                                */
/* ══════════════════════════════════════════════════════════════════ */
function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", t === "dark" ? "#050508" : "#ffffff");
  }
}

/* ══════════════════════════════════════════════════════════════════ */
/* STORAGE KEY                                                       */
/* ══════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = "matriq-theme";

/* ══════════════════════════════════════════════════════════════════ */
/* PROVIDER                                                          */
/* ══════════════════════════════════════════════════════════════════ */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  // CHANGED: Always start with dark, never read from localStorage on init
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Initialize — ALWAYS dark on first load
  useEffect(() => {
    applyTheme("dark");
    setTheme("dark");
    setMounted(true);
  }, []);

  // Listen for system preference changes — disabled since we always default dark
  // Users can still toggle manually via the button

  // Toggle
  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Silently fail if storage is unavailable
    }
  }, [theme]);

  // Derived values
  const isDark = theme === "dark";
  const isLight = theme === "light";

  // Prevent flash
  if (!mounted) {
    return (
      <ThemeCtx.Provider value={{ theme: "dark", toggle, isDark: true, isLight: false }}>
        {children}
      </ThemeCtx.Provider>
    );
  }

  return (
    <ThemeCtx.Provider value={{ theme, toggle, isDark, isLight }}>
      {children}
    </ThemeCtx.Provider>
  );
}