"use client";

import { useCallback, useEffect, useState } from "react";
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

function SunGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/** Monitor + sun: follow system / auto appearance */
function SystemGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

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
      {pref === "light" && <SunGlyph className="h-[18px] w-[18px]" />}
      {pref === "dark" && <MoonGlyph className="h-[18px] w-[18px]" />}
      {pref === "system" && <SystemGlyph className="h-[18px] w-[18px]" />}
    </button>
  );
}
