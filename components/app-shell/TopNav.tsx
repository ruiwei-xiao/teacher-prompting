"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import ThemeToggle from "@/components/theme/ThemeToggle";

type SessionUser = {
  name?: string | null;
  email?: string | null;
};

export default function TopNav({
  menuButton,
  locationLabel,
}: {
  menuButton?: ReactNode;
  /** PC wayfinding — only when it adds real context (e.g. Workspace name). */
  locationLabel?: string | null;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session");
        const body = await res.json();
        setUser(body?.user ?? null);
      } catch {
        setUser(null);
      }
    }

    void loadSession();
  }, []);

  return (
    <header className="app-chrome sticky top-0 z-50">
      <div className="flex h-16 w-full items-center justify-between px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {menuButton}
          <span className="type-title truncate text-xl text-sky-600 dark:text-sky-400">
            Pedagogical Agent Builder
          </span>
          {locationLabel ? (
            <>
              <span
                aria-hidden
                className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block dark:bg-zinc-700"
              />
              <span
                className="hidden min-w-0 truncate text-sm font-medium text-slate-600 sm:inline dark:text-zinc-300"
                title={locationLabel}
              >
                {locationLabel}
              </span>
            </>
          ) : null}
        </div>

        {user ? (
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline dark:text-zinc-300">
              {user.name || user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/" })}
              className="pressable inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover-ok:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover-ok:bg-zinc-800"
            >
              Sign out
            </button>
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-3">
            <a
              href="/"
              className="pressable inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover-ok:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover-ok:bg-zinc-800"
            >
              Sign in
            </a>
            <ThemeToggle />
          </div>
        )}
      </div>
    </header>
  );
}
