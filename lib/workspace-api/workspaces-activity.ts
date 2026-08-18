/**
 * WorkspacesAPI activity feed handler (Task 2.4).
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { resolveUserLabels } from "@/lib/auth/resolve-labels";
import { listApps } from "@/lib/app-store/store";
import { assertWorkspaceAction } from "@/lib/workspace-store/permissions";
import {
  getWorkspace,
  listActivity,
  listMembers,
  listPlacements,
} from "@/lib/workspace-store/store";
import type {
  WorkspaceActivityEvent,
  WorkspaceMembership,
} from "@/lib/workspace-store/types";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: number; body: ApiError };

function unauthorized<T = never>(): ApiResult<T> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function forbidden(message = "Forbidden"): ApiResult<never> {
  return { ok: false, status: 403, body: { error: message } };
}

function notFound(message = "Workspace not found"): ApiResult<never> {
  return { ok: false, status: 404, body: { error: message } };
}

async function getMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMembership | null> {
  const members = await listMembers(workspaceId);
  return members.find((m) => m.userId === userId) ?? null;
}

/**
 * Resolve app IDs a Participant may see in activity (Req 6.4):
 * - (b) on → all currently placed appIds
 * - (b) off → placed apps the Participant owns (via app-store)
 */
async function resolveParticipantVisibleAppIds(
  workspaceId: string,
  userId: string,
  canSeeOthers: boolean
): Promise<string[]> {
  const placements = await listPlacements(workspaceId);
  if (canSeeOthers) {
    return placements.map((p) => p.appId);
  }

  const owned = await listApps(userId);
  const ownedIds = new Set(owned.map((app) => app.id));
  return placements
    .filter((p) => ownedIds.has(p.appId))
    .map((p) => p.appId);
}

function activityUserIds(events: WorkspaceActivityEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    ids.push(event.actorUserId);
    const payloadUserId = event.payload.userId;
    if (typeof payloadUserId === "string") ids.push(payloadUserId);
  }
  return ids;
}

export async function listWorkspaceActivity(
  userId: string | null,
  workspaceId: string
): Promise<ApiResult<{ events: WorkspaceActivityEvent[]; labels: Record<string, string> }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  if (!membership) return forbidden();

  const facilitation = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "activity.viewFacilitation",
  });

  if (facilitation.ok) {
    const events = await listActivity(workspaceId, {
      viewerRole: membership.role,
    });
    return {
      ok: true,
      status: 200,
      body: { events, labels: await resolveUserLabels(activityUserIds(events)) },
    };
  }

  const participantView = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "activity.viewParticipant",
  });
  if (!participantView.ok) {
    return forbidden();
  }

  const canSeeOthers = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "bots.viewOthers",
  }).ok;

  const visibleAppIds = await resolveParticipantVisibleAppIds(
    workspaceId,
    userId,
    canSeeOthers
  );

  const events = await listActivity(workspaceId, {
    viewerRole: "participant",
    visibleAppIds,
  });
  return {
    ok: true,
    status: 200,
    body: { events, labels: await resolveUserLabels(activityUserIds(events)) },
  };
}
