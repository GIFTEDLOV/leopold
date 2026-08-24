"use client";

import { useEffect, useState } from "react";
import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.leopoldTheme === "dark" ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.leopoldTheme = next;
    window.localStorage.setItem("leopold-theme", next);
    setTheme(next);
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
