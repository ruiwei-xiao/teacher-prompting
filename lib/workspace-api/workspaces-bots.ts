/**
 * WorkspacesAPI peer bot snapshot / duplicate handlers (Tasks 3.3, 3.4).
 * Session is resolved by route wrappers; these accept userId for testability.
 *
 * GET/POST only after Workspace ACL. Load bot via getAppById without owner
 * filter only after membership + placement + permission (b) for peers.
 * Never grants apps PATCH.
 */
import { forkApp } from "@/lib/app-store/fork";
import { getAppById } from "@/lib/app-store/store";
import type { AppConfig } from "@/lib/app-store/types";
import { getUserById } from "@/lib/auth/user-store";
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

/** Read-only peer inspect payload — provider secrets omitted. */
export type PeerBotSnapshot = Omit<AppConfig, "apiKey">;

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

function toPeerSnapshot(app: AppConfig): PeerBotSnapshot {
  const { apiKey: _secret, ...snapshot } = app;
  return snapshot;
}

/**
 * Shared visibility gate for peer snapshot and duplicate (permission b).
 * ACL first, then load without owner filter.
 */
async function resolveVisiblePlacedBot(
  userId: string | null,
  workspaceId: string,
  appId: string
): Promise<ApiResult<AppConfig>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  if (!membership) return forbidden();

  const view = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "workspace.view",
  });
  if (!view.ok) return forbidden();

  const placements = await listPlacements(workspaceId);
  const placed = placements.some((p) => p.appId === appId);
  if (!placed) return notFound("Bot not found");

  // ACL first, then load without owner filter (peer path).
  const app = await getAppById(appId);
  if (!app) return notFound("Bot not found");

  const isBotOwner = app.ownerId === userId;
  if (!isBotOwner) {
    const canInspect = assertWorkspaceAction({
      membership,
      permissions: workspace.buildingPermissions,
      action: "bots.inspectPeer",
    });
    if (!canInspect.ok) {
      return forbidden("Missing permission to view this bot");
    }
  }

  return { ok: true, status: 200, body: app };
}

async function resolveForkAttribution(source: AppConfig): Promise<string> {
  if (!source.ownerId) return "Unknown author";
  const owner = await getUserById(source.ownerId);
  return owner?.name || owner?.email || "Unknown author";
}

/**
 * GET read-only snapshot of a placed bot for members allowed to view it.
 * - Non-members → 403 (8.1)
 * - Unplaced / missing bot → 404
 * - Participants need permission (b) to inspect others' bots; own bots always OK
 * - Owners/Facilitators always may inspect placed bots
 * - Response never includes apiKey
 */
export async function getWorkspaceBotSnapshot(
  userId: string | null,
  workspaceId: string,
  appId: string
): Promise<ApiResult<{ app: PeerBotSnapshot }>> {
  const resolved = await resolveVisiblePlacedBot(userId, workspaceId, appId);
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    status: 200,
    body: { app: toPeerSnapshot(resolved.body) },
  };
}

/**
 * POST duplicate a visible placed bot into the caller's My bots via forkApp.
 * Same ACL as snapshot. Source ownership unchanged; caller owns the fork.
 */
export async function duplicateWorkspaceBot(
  userId: string | null,
  workspaceId: string,
  appId: string
): Promise<ApiResult<{ app: AppConfig }>> {
  const resolved = await resolveVisiblePlacedBot(userId, workspaceId, appId);
  if (!resolved.ok) return resolved;

  const source = resolved.body;
  const forked = await forkApp({
    source,
    ownerId: userId!,
    forkedFromAuthorName: await resolveForkAttribution(source),
  });

  return {
    ok: true,
    status: 200,
    body: { app: forked },
  };
}
