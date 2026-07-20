/**
 * ActivityLog helpers — visibility filtering for Workspace activity events.
 * Persistence lives in store.ts; this module stays importable without I/O.
 *
 * Design: Facilitators/Owners see all; Participants see only bot.placed /
 * bot.unplaced for bots they can view.
 */
import type {
  WorkspaceActivityEvent,
  WorkspaceActivityType,
  WorkspaceRole,
} from "./types";

/** Event types Participants may ever see (Req 6.4). */
export const PARTICIPANT_VISIBLE_ACTIVITY_TYPES: ReadonlySet<WorkspaceActivityType> =
  new Set(["bot.placed", "bot.unplaced"]);

export type ActivityViewer = {
  role: WorkspaceRole;
  /**
   * App IDs the viewer is allowed to see. Used for Participants when filtering
   * bot.placed / bot.unplaced. Ignored for Owner/Facilitator.
   */
  visibleAppIds?: readonly string[];
};

export function isFacilitationViewer(role: WorkspaceRole): boolean {
  return role === "owner" || role === "facilitator";
}

function appIdFromPayload(payload: Record<string, unknown>): string | null {
  const appId = payload.appId;
  return typeof appId === "string" && appId.length > 0 ? appId : null;
}

/**
 * Filter a chronological event list for a viewer's role (Req 6.1–6.4).
 * Does not re-sort; callers should pass newest-first lists from the store.
 */
export function filterActivityForViewer(
  events: readonly WorkspaceActivityEvent[],
  viewer: ActivityViewer
): WorkspaceActivityEvent[] {
  if (isFacilitationViewer(viewer.role)) {
    return [...events];
  }

  const visible = new Set(viewer.visibleAppIds ?? []);
  return events.filter((event) => {
    if (!PARTICIPANT_VISIBLE_ACTIVITY_TYPES.has(event.type)) {
      return false;
    }
    const appId = appIdFromPayload(event.payload);
    return appId !== null && visible.has(appId);
  });
}
