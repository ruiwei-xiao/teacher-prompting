"use client";

import type { SessionSummary } from "@/lib/chat-session-store/types";
import {
  formatSessionStartTime,
  sessionBadges,
  sessionBadgeClassName,
  sessionDisplayName,
  sessionListShowsLoadMore,
  sessionListViewState,
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
      <div role="listbox" aria-label="Sessions" className="space-y-0.5">
        {sessions.map((session) => {
          const selected = session.id === selectedId;
          const name = sessionDisplayName(session, nameMode);
          const badges = sessionBadges(session, nameMode);
          return (
            <button
              key={session.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(session.id)}
              className={[
                "pressable w-full rounded-xl px-3 py-2.5 text-left",
                selected
                  ? "bg-sky-50 ring-1 ring-inset ring-sky-300 dark:bg-sky-950/50 dark:ring-sky-500/60"
                  : "hover-ok:bg-slate-50 dark:hover-ok:bg-zinc-800",
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
                    <span key={badge} className={sessionBadgeClassName(badge)}>
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
