/**
 * Owner-scoped session list (Task 3.1).
 * Session is resolved by the route wrapper; this accepts userId for testability.
 *
 * GET lists shared-only summaries via listSessionsForApp after an ownership
 * check with getAppById(appId, userId). Unauthenticated → 401; missing or
 * non-owned app → 404.
 */
import { getAppById } from "@/lib/app-store/store";
import { listSessionsForApp } from "@/lib/chat-session-store/store";
import type { SessionSummary } from "@/lib/chat-session-store/types";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: number; body: ApiError };

export type OwnerSessionListQuery = {
  limit?: string | number | null;
  offset?: string | number | null;
};

export type OwnerSessionListBody = {
  sessions: SessionSummary[];
  hasMore: boolean;
};

export const DEFAULT_OWNER_SESSION_LIMIT = 20;

export type GetAppByIdFn = (
  id: string,
  ownerId?: string
) => Promise<{ id: string } | null | undefined>;

export type ListSessionsForAppFn = (
  appId: string,
  opts: { limit: number; offset: number }
) => Promise<{ items: SessionSummary[]; hasMore: boolean }>;

function unauthorized(): ApiResult<never> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function notFound(): ApiResult<never> {
  return { ok: false, status: 404, body: { error: "App not found" } };
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

export function parseOwnerSessionPaging(
  query: OwnerSessionListQuery = {}
): { limit: number; offset: number } {
  return {
    limit: parsePagingInt(query.limit, DEFAULT_OWNER_SESSION_LIMIT),
    offset: parsePagingInt(query.offset, 0),
  };
}

export async function listOwnerSessions(
  userId: string | null,
  appId: string,
  query: OwnerSessionListQuery = {},
  deps: {
    getAppById?: GetAppByIdFn;
    listSessionsForApp?: ListSessionsForAppFn;
  } = {}
): Promise<ApiResult<OwnerSessionListBody>> {
  if (!userId) return unauthorized();

  const loadApp = deps.getAppById ?? getAppById;
  const app = await loadApp(appId, userId);
  if (!app) return notFound();

  const paging = parseOwnerSessionPaging(query);
  const list = deps.listSessionsForApp ?? listSessionsForApp;
  const page = await list(appId, paging);

  return {
    ok: true,
    status: 200,
    body: { sessions: page.items, hasMore: page.hasMore },
  };
}
