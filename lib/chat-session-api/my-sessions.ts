/**
 * Participant-scoped session list (Task 3.2).
 * Session is resolved by the route wrapper; this accepts userId for testability.
 *
 * GET lists the caller's own session summaries across bots via
 * listSessionsForUser (anonymous rows already excluded by the store).
 * Unauthenticated → 401. Default page size is 20.
 */
import { listSessionsForUser } from "@/lib/chat-session-store/store";
import type { SessionSummary } from "@/lib/chat-session-store/types";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: number; body: ApiError };

export type MySessionListQuery = {
  limit?: string | number | null;
  offset?: string | number | null;
};

export type MySessionListBody = {
  sessions: SessionSummary[];
  hasMore: boolean;
};

export const DEFAULT_MY_SESSION_LIMIT = 20;

export type ListSessionsForUserFn = (
  userId: string,
  opts: { limit: number; offset: number }
) => Promise<{ items: SessionSummary[]; hasMore: boolean }>;

function unauthorized(): ApiResult<never> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function parsePagingInt(
  raw: string | number | null | undefined,
  fallback: number
): number {
  if (typeof raw === "number") {
    if (Number.isInteger(raw) && raw >= 0 && Number.isSafeInteger(raw)) {
      return raw;
    }
    return fallback;
  }
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(n)) return fallback;
  return n;
}

export function parseMySessionPaging(
  query: MySessionListQuery = {}
): { limit: number; offset: number } {
  return {
    limit: parsePagingInt(query.limit, DEFAULT_MY_SESSION_LIMIT),
    offset: parsePagingInt(query.offset, 0),
  };
}

export async function listMySessions(
  userId: string | null,
  query: MySessionListQuery = {},
  deps: {
    listSessionsForUser?: ListSessionsForUserFn;
  } = {}
): Promise<ApiResult<MySessionListBody>> {
  if (!userId) return unauthorized();

  const paging = parseMySessionPaging(query);
  const list = deps.listSessionsForUser ?? listSessionsForUser;
  const page = await list(userId, paging);

  return {
    ok: true,
    status: 200,
    body: { sessions: page.items, hasMore: page.hasMore },
  };
}
