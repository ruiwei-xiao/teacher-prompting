/**
 * Client fetch helpers for the session list and transcript APIs.
 */
import type {
  ChatSessionRecord,
  SessionSummary,
} from "@/lib/chat-session-store/types";

export const DEFAULT_SESSION_PAGE_LIMIT = 20;

export type SessionListPage = {
  sessions: SessionSummary[];
  hasMore: boolean;
};

export type SessionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type PagingOpts = {
  limit?: number;
  offset?: number;
  surface?: string;
  from?: string;
  to?: string;
};

function pagingQuery(opts: PagingOpts = {}): string {
  const limit = opts.limit ?? DEFAULT_SESSION_PAGE_LIMIT;
  const offset = opts.offset ?? 0;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const surface = opts.surface?.trim();
  const from = opts.from?.trim();
  const to = opts.to?.trim();
  if (surface) params.set("surface", surface);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
}

export function ownerSessionsUrl(
  appId: string,
  opts: PagingOpts = {}
): string {
  return `/api/apps/${encodeURIComponent(appId)}/sessions?${pagingQuery(opts)}`;
}

export function mySessionsUrl(opts: PagingOpts = {}): string {
  return `/api/sessions?${pagingQuery(opts)}`;
}

export function transcriptUrl(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}`;
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function errorMessage(body: unknown, status: number): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.trim()
  ) {
    return body.error;
  }
  return `Request failed (${status})`;
}

async function getJson(
  url: string,
  fetchImpl: SessionFetch
): Promise<unknown> {
  const res = await fetchImpl(url);
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, res.status));
  }
  return body;
}

export async function fetchOwnerSessions(
  appId: string,
  opts: PagingOpts = {},
  fetchImpl: SessionFetch = fetch
): Promise<SessionListPage> {
  const body = (await getJson(ownerSessionsUrl(appId, opts), fetchImpl)) as {
    sessions?: SessionSummary[];
    hasMore?: boolean;
  };
  return {
    sessions: Array.isArray(body.sessions) ? body.sessions : [],
    hasMore: Boolean(body.hasMore),
  };
}

export async function fetchMySessions(
  opts: PagingOpts = {},
  fetchImpl: SessionFetch = fetch
): Promise<SessionListPage> {
  const body = (await getJson(mySessionsUrl(opts), fetchImpl)) as {
    sessions?: SessionSummary[];
    hasMore?: boolean;
  };
  return {
    sessions: Array.isArray(body.sessions) ? body.sessions : [],
    hasMore: Boolean(body.hasMore),
  };
}

export async function fetchTranscript(
  sessionId: string,
  fetchImpl: SessionFetch = fetch
): Promise<ChatSessionRecord> {
  const body = (await getJson(transcriptUrl(sessionId), fetchImpl)) as {
    session?: ChatSessionRecord;
  };
  if (!body.session) {
    throw new Error("Session not found");
  }
  return body.session;
}
