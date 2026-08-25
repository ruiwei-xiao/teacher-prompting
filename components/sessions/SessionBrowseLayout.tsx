import type { ReactNode } from "react";

export default function SessionBrowseLayout({
  ariaLabel,
  isEmpty,
  empty,
  list,
  detail,
}: {
  ariaLabel: string;
  isEmpty: boolean;
  empty: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}) {
  if (isEmpty) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center" aria-label={ariaLabel}>
        {empty}
      </div>
    );
  }

  return (
    <div
      className="mt-5 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-5"
      aria-label={ariaLabel}
    >
      <section
        aria-label="Sessions"
        className="min-h-0 max-h-[38%] overflow-y-auto py-1 lg:max-h-none lg:w-80 lg:shrink-0"
      >
        {list}
      </section>
      <section
        aria-label="Transcript"
        className="pane-surface min-h-0 flex-1 overflow-y-auto rounded-[1.35rem] border border-slate-200 p-5 sm:p-6 dark:border-zinc-600"
      >
        {detail}
      </section>
    </div>
  );
}

export function SessionEmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="max-w-md px-4 text-center">
      <p className="type-title text-lg text-slate-800 dark:text-zinc-100">
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-zinc-400">
        {message}
      </p>
    </div>
  );
}

export function SessionDetailHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center">
      <p className="max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-zinc-400">
        {children}
      </p>
    </div>
  );
}
