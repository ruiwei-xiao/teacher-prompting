"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ChatSessionRecord,
  SessionSummary,
} from "@/lib/chat-session-store/types";
import {
  activityFilterQueryFromSearchParams,
  buildActivitySearch,
  isActivityFilterActive,
  parseActivityFilter,
} from "@/lib/chat-session-ui/activity-filter";
import { activityExportHref, activityHrefForApp } from "@/lib/chat-session-ui/nav";
import ActivityFilters from "./ActivityFilters";
import SessionBrowseLayout, {
  SessionDetailHint,
  SessionEmptyState,
} from "./SessionBrowseLayout";
import SessionList from "./SessionList";
import SessionTranscript from "./SessionTranscript";
import {
  DEFAULT_SESSION_PAGE_LIMIT,
  fetchOwnerSessions,
  fetchTranscript,
} from "./session-client";

const EMPTY_MESSAGE = "Sessions will appear once the bot is used.";
const FILTER_EMPTY_MESSAGE = "No sessions match these filters.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function BotActivityViewInner({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = (searchParams.get("session") ?? "").trim() || null;
  const filterValue = activityFilterQueryFromSearchParams(searchParams);
  const parsedFilter = parseActivityFilter(filterValue);
  const filterActive =
    parsedFilter.ok && isActivityFilterActive(parsedFilter.filter);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [transcript, setTranscript] = useState<ChatSessionRecord | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");
  const [transcriptNonce, setTranscriptNonce] = useState(0);

  const listOpts = useMemo(
    () => ({
      surface: filterValue.surface || undefined,
      from: filterValue.from || undefined,
      to: filterValue.to || undefined,
    }),
    [filterValue.from, filterValue.surface, filterValue.to]
  );

  const loadList = useCallback(
    async (offset: number, append: boolean) => {
      setListLoading(true);
      setListError("");
      try {
        const page = await fetchOwnerSessions(appId, {
          limit: DEFAULT_SESSION_PAGE_LIMIT,
          offset,
          ...listOpts,
        });
        setSessions((prev) =>
          append ? [...prev, ...page.sessions] : page.sessions
        );
        setHasMore(page.hasMore);
      } catch (error) {
        setListError(errorMessage(error));
        if (!append) {
          setSessions([]);
          setHasMore(false);
        }
      } finally {
        setListLoading(false);
      }
    },
    [appId, listOpts]
  );

  useEffect(() => {
    void loadList(0, false);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setTranscript(null);
      setTranscriptError("");
      setTranscriptLoading(false);
      return;
    }

    let cancelled = false;
    setTranscriptLoading(true);
    setTranscriptError("");
    setTranscript(null);

    void fetchTranscript(selectedId)
      .then((session) => {
        if (cancelled) return;
        if (session.appId !== appId) {
          setTranscriptError("Session not found");
          return;
        }
        setTranscript(session);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTranscriptError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setTranscriptLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appId, selectedId, transcriptNonce]);

  function replaceParams(next: {
    session?: string | null;
    surface?: string;
    from?: string;
    to?: string;
  }) {
    router.replace(
      `${activityHrefForApp(appId)}${buildActivitySearch({
        session: next.session === undefined ? selectedId : next.session,
        surface: next.surface ?? filterValue.surface,
        from: next.from ?? filterValue.from,
        to: next.to ?? filterValue.to,
      })}`,
      { scroll: false }
    );
  }

  function selectSession(sessionId: string) {
    replaceParams({ session: sessionId });
  }

  const exportFilter = {
    surface: filterValue.surface,
    from: filterValue.from,
    to: filterValue.to,
  };

  let detail: ReactNode;
  if (!selectedId) {
    detail = (
      <SessionDetailHint>Select a session to read the transcript.</SessionDetailHint>
    );
  } else if (transcriptLoading) {
    detail = <SessionDetailHint>Loading transcript…</SessionDetailHint>;
  } else if (transcriptError) {
    detail = (
      <div className="space-y-3 px-5 py-4">
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {transcriptError}
        </p>
        <button
          type="button"
          onClick={() => setTranscriptNonce((value) => value + 1)}
          className="pressable inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover-ok:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover-ok:bg-zinc-800"
        >
          Try again
        </button>
      </div>
    );
  } else if (transcript) {
    detail = <SessionTranscript session={transcript} nameMode="participant" />;
  }

  const isBare =
    sessions.length === 0 && !listError && !selectedId && !filterActive;
  const emptyMessage = filterActive ? FILTER_EMPTY_MESSAGE : EMPTY_MESSAGE;

  const list =
    listError && sessions.length === 0 && !listLoading ? (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {listError}
        </p>
        <button
          type="button"
          onClick={() => void loadList(0, false)}
          className="pressable mt-4 inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover-ok:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover-ok:bg-zinc-800"
        >
          Try again
        </button>
      </div>
    ) : (
      <SessionList
        sessions={sessions}
        hasMore={hasMore}
        loading={listLoading}
        selectedId={selectedId}
        onLoadMore={() => void loadList(sessions.length, true)}
        onSelect={selectSession}
        emptyMessage={emptyMessage}
        nameMode="participant"
      />
    );

  const downloadClassName =
    "pressable inline-flex h-9 items-center rounded-lg px-2 text-sm font-medium text-sky-700 hover-ok:bg-sky-50 dark:text-sky-400 dark:hover-ok:bg-sky-950/40";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-20 mt-3 shrink-0">
        <ActivityFilters
          value={filterValue}
          onChange={(next) =>
            replaceParams({
              surface: next.surface,
              from: next.from,
              to: next.to,
            })
          }
          trailing={
            <div className="flex items-center gap-1">
              <a
                href={activityExportHref(appId, "csv", exportFilter)}
                download
                className={downloadClassName}
              >
                Download CSV
              </a>
              <a
                href={activityExportHref(appId, "json", exportFilter)}
                download
                className={downloadClassName}
              >
                Download JSON
              </a>
              <span className="hidden pl-1 text-xs text-slate-500 sm:inline dark:text-zinc-400">
                Shared sessions only
                {filterActive ? " · filtered" : ""}
              </span>
            </div>
          }
        />
      </div>
      <SessionBrowseLayout
        ariaLabel={`${appName} activity`}
        isEmpty={isBare}
        empty={
          listLoading ? (
            <p className="py-16 text-center text-sm text-slate-500 dark:text-zinc-400">
              Loading sessions…
            </p>
          ) : (
            <SessionEmptyState
              title="No sessions yet"
              message={EMPTY_MESSAGE}
            />
          )
        }
        list={list}
        detail={detail}
      />
    </div>
  );
}

export default function BotActivityView({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={
          <p className="mt-10 text-center text-sm text-slate-500 dark:text-zinc-400">
            Loading sessions…
          </p>
        }
      >
        <BotActivityViewInner appId={appId} appName={appName} />
      </Suspense>
    </div>
  );
}
