"use client";

import { useEffect } from "react";
import {
  applyThemePreference,
  getStoredTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme/client";

/**
 * Keeps the document theme in sync when the OS preference changes (system mode)
 * or when another tab updates localStorage.
 */
export default function ThemeSync() {
  useEffect(() => {
    applyThemePreference(getStoredTheme());

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsThemeChange = () => {
      if (getStoredTheme() === "system") {
        applyThemePreference("system");
      }
    };
    mq.addEventListener("change", onOsThemeChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        applyThemePreference(getStoredTheme());
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onOsThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
