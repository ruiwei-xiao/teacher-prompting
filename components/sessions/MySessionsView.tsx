"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ChatSessionRecord,
  SessionSummary,
} from "@/lib/chat-session-store/types";
import { MY_SESSIONS_HREF } from "@/lib/chat-session-ui/nav";
import SessionBrowseLayout, {
  SessionDetailHint,
  SessionEmptyState,
} from "./SessionBrowseLayout";
import SessionList from "./SessionList";
import SessionTranscript from "./SessionTranscript";
import {
  DEFAULT_SESSION_PAGE_LIMIT,
  fetchMySessions,
  fetchTranscript,
} from "./session-client";

const EMPTY_MESSAGE =
  "You have no sessions yet. Conversations you start with bots will appear here.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function MySessionsViewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = (searchParams.get("session") ?? "").trim() || null;

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [transcript, setTranscript] = useState<ChatSessionRecord | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");
  const [transcriptNonce, setTranscriptNonce] = useState(0);

  const loadList = useCallback(async (offset: number, append: boolean) => {
    setListLoading(true);
    setListError("");
    try {
      const page = await fetchMySessions({
        limit: DEFAULT_SESSION_PAGE_LIMIT,
        offset,
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
  }, []);

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
  }, [selectedId, transcriptNonce]);

  function selectSession(sessionId: string) {
    router.replace(
      `${MY_SESSIONS_HREF}?session=${encodeURIComponent(sessionId)}`,
      { scroll: false }
    );
  }

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
    detail = <SessionTranscript session={transcript} nameMode="bot" />;
  }

  const isBare = sessions.length === 0 && !listError && !selectedId;

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
        emptyMessage={EMPTY_MESSAGE}
        nameMode="bot"
      />
    );

  return (
    <SessionBrowseLayout
      ariaLabel="My sessions"
      isEmpty={isBare}
      empty={
        listLoading ? (
          <p className="text-center text-sm text-slate-500 dark:text-zinc-400">
            Loading sessions…
          </p>
        ) : (
          <SessionEmptyState title="No sessions yet" message={EMPTY_MESSAGE} />
        )
      }
      list={list}
      detail={detail}
    />
  );
}

export default function MySessionsView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={
          <p className="mt-10 text-center text-sm text-slate-500 dark:text-zinc-400">
            Loading sessions…
          </p>
        }
      >
        <MySessionsViewInner />
      </Suspense>
    </div>
  );
}
