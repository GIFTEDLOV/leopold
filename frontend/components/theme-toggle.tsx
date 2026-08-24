"use client";

import { useSyncExternalStore } from "react";
import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";

const THEME_EVENT = "leopold-theme-change";

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.leopoldTheme === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.leopoldTheme = next;
    window.localStorage.setItem("leopold-theme", next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      className={`${styles.toggle} ${className}`.trim()}
      type="button"
      aria-pressed={theme === "dark"}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={toggleTheme}
    >
      <span className={theme === "light" ? styles.activeLabel : styles.label}>Light</span>
      <span className={styles.track} aria-hidden="true"><i>{theme === "dark" ? "☾" : "☀"}</i></span>
      <span className={theme === "dark" ? styles.activeLabel : styles.label}>Dark</span>
    </button>
  );
}
