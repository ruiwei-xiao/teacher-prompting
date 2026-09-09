/**
 * WorkspacesAPI shared session list and transcript for currently placed bots
 * (Tasks 4.1–4.2). Session is resolved by route wrappers; these accept userId
 * for testability.
 */
import { parseOwnerSessionPaging } from "@/lib/chat-session-api/owner-sessions";
import {
  getSessionById,
  listSharedSessionsForAppIds,
} from "@/lib/chat-session-store/store";
import type {
  ChatSessionRecord,
  SessionSummary,
} from "@/lib/chat-session-store/types";
import { assertWorkspaceAction } from "@/lib/workspace-store/permissions";
import {
  getWorkspace,
  listMembers,
  listPlacements,
} from "@/lib/workspace-store/store";
import type { WorkspaceMembership } from "@/lib/workspace-store/types";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: number; body: ApiError };

export type WorkspaceSessionListQuery = {
  limit?: string | number | null;
  offset?: string | number | null;
};

export type WorkspaceSessionListBody = {
  sessions: SessionSummary[];
  hasMore: boolean;
};

export type WorkspaceSessionTranscriptBody = {
  session: ChatSessionRecord;
};

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

export async function listWorkspaceSessions(
  userId: string | null,
  workspaceId: string,
  query: WorkspaceSessionListQuery = {}
): Promise<ApiResult<WorkspaceSessionListBody>> {
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
  if (!facilitation.ok) return forbidden();

  const placements = await listPlacements(workspaceId);
  const appIds = placements.map((placement) => placement.appId);
  const paging = parseOwnerSessionPaging(query);
  const page = await listSharedSessionsForAppIds(appIds, paging);

  return {
    ok: true,
    status: 200,
    body: { sessions: page.items, hasMore: page.hasMore },
  };
}

export async function getWorkspaceSessionTranscript(
  userId: string | null,
  workspaceId: string,
  sessionId: string
): Promise<ApiResult<WorkspaceSessionTranscriptBody>> {
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
  if (!facilitation.ok) return forbidden();

  const session = await getSessionById(sessionId);
  if (!session || session.shared !== true) return forbidden();

  const placements = await listPlacements(workspaceId);
  const placedHere = placements.some(
    (placement) => placement.appId === session.appId
  );
  if (!placedHere) return forbidden();

  return {
    ok: true,
    status: 200,
    body: { session },
  };
}
