/**
 * Client-safe Workspace activity feed helpers: parse the role-filtered
 * GET /activity response and format chronological entries for display.
 */
import type {
  WorkspaceActivityEvent,
  WorkspaceActivityType,
  WorkspaceRole,
} from "@/lib/workspace-store/types";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

/** Event types Participants may ever see (Req 6.4; server also enforces). */
export const PARTICIPANT_VISIBLE_ACTIVITY_TYPES: ReadonlySet<WorkspaceActivityType> =
  new Set(["bot.placed", "bot.unplaced"]);

/** Membership / settings events omitted from Participant feeds (Req 6.4). */
export const FACILITATION_ONLY_ACTIVITY_TYPES: ReadonlySet<WorkspaceActivityType> =
  new Set([
    "member.joined",
    "member.left",
    "member.removed",
    "workspace.renamed",
    "permissions.updated",
  ]);

const ACTIVITY_TYPES: ReadonlySet<string> = new Set([
  "member.joined",
  "member.left",
  "member.removed",
  "bot.placed",
  "bot.unplaced",
  "workspace.renamed",
  "permissions.updated",
]);

function errorFromBody(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    const trimmed = ((body as { error: string }).error || "").trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

function isActivityType(value: unknown): value is WorkspaceActivityType {
  return typeof value === "string" && ACTIVITY_TYPES.has(value);
}

function isActivityEvent(value: unknown): value is WorkspaceActivityEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.workspaceId === "string" &&
    isActivityType(e.type) &&
    typeof e.actorUserId === "string" &&
    !!e.payload &&
    typeof e.payload === "object" &&
    !Array.isArray(e.payload) &&
    typeof e.createdAt === "string"
  );
}

export function isFacilitationOnlyActivityType(
  type: WorkspaceActivityType
): boolean {
  return FACILITATION_ONLY_ACTIVITY_TYPES.has(type);
}

/** Owners and Facilitators see the full facilitation feed. */
export function canViewFacilitationActivity(role: WorkspaceRole): boolean {
  return role === "owner" || role === "facilitator";
}

export function activityApiHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/activity`;
}

/**
 * Newest-first chronological order (Req 6.5). Stable for equal timestamps.
 */
export function sortActivityNewestFirst(
  events: readonly WorkspaceActivityEvent[]
): WorkspaceActivityEvent[] {
  return [...events].sort((a, b) => {
    const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
}

function stringPayload(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Human-readable one-line summary for a feed row. */
export function formatActivitySummary(event: WorkspaceActivityEvent): string {
  const { type, payload, actorUserId } = event;
  switch (type) {
    case "member.joined": {
      const userId = stringPayload(payload, "userId") ?? actorUserId;
      return `Member joined: ${userId}`;
    }
    case "member.left": {
      const userId = stringPayload(payload, "userId") ?? actorUserId;
      return `Member left: ${userId}`;
    }
    case "member.removed": {
      const userId = stringPayload(payload, "userId") ?? "member";
      return `Member removed: ${userId}`;
    }
    case "bot.placed": {
      const appId = stringPayload(payload, "appId") ?? "bot";
      return `Bot placed: ${appId}`;
    }
    case "bot.unplaced": {
      const appId = stringPayload(payload, "appId") ?? "bot";
      return `Bot unplaced: ${appId}`;
    }
    case "workspace.renamed": {
      const from = stringPayload(payload, "from");
      const to = stringPayload(payload, "to");
      if (from && to) return `Workspace renamed from “${from}” to “${to}”`;
      if (to) return `Workspace renamed to “${to}”`;
      return "Workspace renamed";
    }
    case "permissions.updated":
      return "Building permissions updated";
    default:
      return "Activity";
  }
}

/** Locale-friendly timestamp for the feed (falls back to raw ISO). */
export function formatActivityTimestamp(createdAt: string): string {
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return createdAt;
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return createdAt;
  }
}

/** Parse GET /api/workspaces/:id/activity JSON. */
export function parseActivityListResponse(
  status: number,
  body: unknown
): ParseResult<{ events: WorkspaceActivityEvent[] }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load activity"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid activity response" };
  }
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events) || !events.every(isActivityEvent)) {
    return { ok: false, error: "Invalid activity response" };
  }
  return { ok: true, events };
}
