"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type SessionUser = {
  name?: string | null;
  email?: string | null;
};

export default function TopNav() {
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
    <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-7xl h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-black tracking-tight text-sky-600">Pedagogical Prompting Tutor</span>
          <span className="hidden sm:inline text-sm text-slate-500">
            My bots
          </span>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-slate-600">
              {user.name || user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/" })}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        ) : (
          <a
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}
