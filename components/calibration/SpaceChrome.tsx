import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { lucideMd } from "./lucide";

export default function SpaceChrome({
  title,
  phaseLabel,
  roleLabel,
  children,
}: {
  title: string;
  phaseLabel: string;
  roleLabel: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 h-16 shrink-0 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <a
              href="/activity"
              className="shrink-0 rounded-lg p-2 text-slate-900 transition-[transform,background-color] duration-150 ease-out hover:bg-slate-100 active:scale-[0.97] dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Back to activities"
            >
              <ChevronLeft {...lucideMd} />
            </a>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-zinc-100">
                {title || "Activity"}
              </h1>
              <p className="truncate text-xs text-slate-500 dark:text-zinc-400">
                {phaseLabel}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {roleLabel ? (
              <p className="hidden rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800 sm:block dark:bg-sky-950/70 dark:text-sky-200">
                You are {roleLabel}
              </p>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
