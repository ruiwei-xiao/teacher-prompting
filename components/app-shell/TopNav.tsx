"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import ThemeToggle from "@/components/theme/ThemeToggle";

type SessionUser = {
  name?: string | null;
  email?: string | null;
};

export default function TopNav({ menuButton }: { menuButton?: ReactNode }) {
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
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="flex h-16 w-full items-center justify-between px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {menuButton}
          <span className="truncate text-xl font-black tracking-tight text-sky-600 dark:text-sky-400">
            Pedagogical Agent Builder
          </span>
        </div>

        {user ? (
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline dark:text-zinc-300">
              {user.name || user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/" })}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-3">
            <a
              href="/"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
