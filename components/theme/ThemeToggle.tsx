"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  applyThemePreference,
  getStoredTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme/client";

const CYCLE: ThemePreference[] = ["system", "light", "dark"];

function nextPreference(current: ThemePreference): ThemePreference {
  const i = CYCLE.indexOf(current);
  return CYCLE[(i + 1) % CYCLE.length];
}

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const THEME_ICON = {
  className: "h-[18px] w-[18px] shrink-0",
  strokeWidth: 2,
  "aria-hidden": true,
} as const;

/**
 * Universal nav icon: cycles System → Light → Dark.
 * Matches common OS / app toolbar pattern (outline sun / moon / display).
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    setPref(getStoredTheme());
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setPref(getStoredTheme());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const cycle = useCallback(() => {
    const next = nextPreference(getStoredTheme());
    setPref(next);
    applyThemePreference(next);
  }, []);

  const next = nextPreference(pref);
  const title = `Theme: ${LABELS[pref]}. Click for ${LABELS[next]}.`;

  return (
    <button
      type="button"
      onClick={cycle}
      title={title}
      aria-label={title}
      className={[
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50",
        "dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
        className,
      ].join(" ")}
    >
      {pref === "light" && <Sun {...THEME_ICON} />}
      {pref === "dark" && <Moon {...THEME_ICON} />}
      {pref === "system" && <Monitor {...THEME_ICON} />}
    </button>
  );
}
