"use client";

import type { SessionSummary } from "@/lib/chat-session-store/types";
import {
  formatSessionStartTime,
  sessionBadges,
  sessionDeletedBotBadge,
  sessionDisplayName,
  sessionListShowsLoadMore,
  sessionListViewState,
  sessionNotSharedBadge,
  sessionSurfaceBadge,
  type SessionNameMode,
} from "./session-display";

export default function SessionList({
  sessions,
  hasMore,
  onLoadMore,
  onSelect,
  emptyMessage,
  nameMode,
  loading = false,
  selectedId = null,
}: {
  sessions: SessionSummary[];
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (sessionId: string) => void;
  emptyMessage: string;
  nameMode: SessionNameMode;
  loading?: boolean;
  selectedId?: string | null;
}) {
  const viewState = sessionListViewState({
    sessionCount: sessions.length,
    loading,
  });
  const showLoadMore = sessionListShowsLoadMore({
    hasMore,
    sessionCount: sessions.length,
  });

  if (viewState === "loading") {
    return (
      <p className="px-2 py-8 text-center text-sm text-slate-500 dark:text-zinc-400">
        Loading sessions…
      </p>
    );
  }

  if (viewState === "empty") {
    return (
      <p className="px-2 py-8 text-center text-sm leading-6 text-slate-500 dark:text-zinc-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div>
      <div role="listbox" aria-label="Sessions" className="space-y-2">
        {sessions.map((session) => {
          const selected = session.id === selectedId;
          const name = sessionDisplayName(session, nameMode);
          const badges = sessionBadges(session, nameMode);
          const surface = sessionSurfaceBadge(session.surface);
          const notShared = sessionNotSharedBadge(session, nameMode);
          const deletedBot = sessionDeletedBotBadge(session);
          return (
            <button
              key={session.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(session.id)}
              className={[
                "pressable w-full rounded-2xl border px-4 py-3 text-left",
                "transition-[transform,border-color,background-color] duration-[var(--duration-ui)] ease-[var(--ease-out)]",
                selected
                  ? "border-sky-300 bg-sky-50 dark:border-sky-500/60 dark:bg-sky-950/50"
                  : "border-slate-200 bg-white hover-ok:border-slate-300 hover-ok:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover-ok:border-zinc-500 dark:hover-ok:bg-zinc-800",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                    {formatSessionStartTime(session.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {badges.map((badge) => (
                    <span
                      key={badge}
                      className={[
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                        badge === surface
                          ? "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                          : badge === notShared
                            ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                            : badge === deletedBot
                              ? "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300"
                              : "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-200",
                      ].join(" ")}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {showLoadMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="pressable mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover-ok:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover-ok:bg-zinc-800"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
