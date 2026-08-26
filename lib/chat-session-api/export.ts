/**
 * Owner activity export (CSV / JSON) of shared session transcripts.
 *
 * Same ownership gate as listOwnerSessions. Unshared sessions stay out of
 * the download even if a store implementation regresses.
 */
import { getAppById } from "@/lib/app-store/store";
import { listSharedSessionRecordsForApp } from "@/lib/chat-session-store/store";
import type {
  ChatSessionRecord,
  SessionQueryFilter,
} from "@/lib/chat-session-store/types";
import {
  ACTIVITY_FILTER_ERROR,
  parseActivityFilter,
  type ActivityFilterQuery,
} from "@/lib/chat-session-ui/activity-filter";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: 400 | 401 | 404; body: ApiError };

export type ExportFormat = "csv" | "json";

export type SessionExportFile = {
  filename: string;
  contentType: string;
  body: string;
};

export type GetAppByIdFn = (
  id: string,
  ownerId?: string
) => Promise<{ id: string; name?: string } | null | undefined>;

export type ListSharedSessionRecordsForAppFn = (
  appId: string,
  filter?: SessionQueryFilter
) => Promise<ChatSessionRecord[]>;

export const CSV_COLUMNS = [
  "sessionId",
  "appId",
  "appName",
  "surface",
  "participantId",
  "participantName",
  "createdAt",
  "updatedAt",
  "messageIndex",
  "role",
  "content",
  "messageAt",
  "imageOmitted",
] as const;

const ANONYMOUS_LABEL = "Anonymous";

function participantLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : ANONYMOUS_LABEL;
}

function unauthorized(): ApiResult<never> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function notFound(): ApiResult<never> {
  return { ok: false, status: 404, body: { error: "App not found" } };
}

function badFormat(): ApiResult<never> {
  return { ok: false, status: 400, body: { error: "Invalid export format" } };
}

function badFilter(): ApiResult<never> {
  return { ok: false, status: 400, body: { error: ACTIVITY_FILTER_ERROR } };
}

export function parseExportFormat(
  raw: string | null | undefined
): ExportFormat | null {
  if (raw === "csv" || raw === "json") return raw;
  return null;
}

export function sanitizeExportBasename(name: string): string {
  const trimmed = name.trim() || "activity";
  const slug = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "activity";
}

export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function sessionsToCsv(sessions: ChatSessionRecord[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const session of sessions) {
    const participantName = participantLabel(session.participantName);
    session.messages.forEach((message, messageIndex) => {
      const row = [
        session.id,
        session.appId,
        session.appName,
        session.surface,
        session.participantId ?? "",
        participantName,
        session.createdAt,
        session.updatedAt,
        String(messageIndex),
        message.role,
        message.content,
        message.at,
        message.imageOmitted ? "true" : "false",
      ].map(csvCell);
      lines.push(row.join(","));
    });
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function sessionsToJson(input: {
  appId: string;
  appName: string;
  exportedAt: string;
  filter: {
    surface: string | null;
    from: string | null;
    to: string | null;
  };
  sessions: ChatSessionRecord[];
}): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}

function dateStamp(iso: string): string {
  return iso.slice(0, 10);
}

function sharedOnly(sessions: ChatSessionRecord[]): ChatSessionRecord[] {
  return sessions.filter((session) => session.shared);
}

export async function exportOwnerSessions(
  userId: string | null,
  appId: string,
  formatRaw: string | null | undefined,
  deps: {
    getAppById?: GetAppByIdFn;
    listSharedSessionRecordsForApp?: ListSharedSessionRecordsForAppFn;
    now?: string;
  } = {},
  filterQuery: ActivityFilterQuery = {}
): Promise<ApiResult<SessionExportFile>> {
  if (!userId) return unauthorized();
  const format = parseExportFormat(formatRaw);
  if (!format) return badFormat();

  const loadApp = deps.getAppById ?? getAppById;
  const app = await loadApp(appId, userId);
  if (!app) return notFound();

  const parsed = parseActivityFilter(filterQuery);
  if (!parsed.ok) return badFilter();

  const list =
    deps.listSharedSessionRecordsForApp ?? listSharedSessionRecordsForApp;
  const sessions = sharedOnly(await list(appId, parsed.filter));
  const appName = app.name?.trim() || app.id;
  const exportedAt = deps.now?.trim() || new Date().toISOString();
  const basename = `${sanitizeExportBasename(appName)}-activity-${dateStamp(exportedAt)}`;
  const filterMeta = {
    surface: parsed.filter.surface ?? null,
    from: typeof filterQuery.from === "string" && filterQuery.from.trim()
      ? filterQuery.from.trim()
      : null,
    to:
      typeof filterQuery.to === "string" && filterQuery.to.trim()
        ? filterQuery.to.trim()
        : null,
  };

  if (format === "csv") {
    return {
      ok: true,
      status: 200,
      body: {
        filename: `${basename}.csv`,
        contentType: "text/csv; charset=utf-8",
        body: sessionsToCsv(sessions),
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      filename: `${basename}.json`,
      contentType: "application/json; charset=utf-8",
      body: sessionsToJson({
        appId,
        appName,
        exportedAt,
        filter: filterMeta,
        sessions,
      }),
    },
  };
}
