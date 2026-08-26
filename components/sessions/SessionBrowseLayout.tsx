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
      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        aria-label={ariaLabel}
      >
        {empty}
      </div>
    );
  }

  return (
    <div
      className="mt-4 flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4"
      aria-label={ariaLabel}
    >
      <section
        aria-label="Sessions"
        className="flex min-h-0 max-h-[38%] flex-col overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white lg:max-h-none lg:w-72 lg:shrink-0 dark:border-zinc-600 dark:bg-zinc-900"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">{list}</div>
      </section>
      <section
        aria-label="Transcript"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white dark:border-zinc-600 dark:bg-zinc-900"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
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
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <p className="max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-zinc-400">
        {children}
      </p>
    </div>
  );
}
