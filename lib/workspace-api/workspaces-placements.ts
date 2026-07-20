/**
 * WorkspacesAPI placement handlers (Task 3.1).
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { getAppById, listApps } from "@/lib/app-store/store";
import { assertWorkspaceAction } from "@/lib/workspace-store/permissions";
import {
  appendActivity,
  getWorkspace,
  listMembers,
  listPlacements,
  placeApp,
  removePlacement,
} from "@/lib/workspace-store/store";
import type {
  WorkspaceMembership,
  WorkspacePlacement,
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

function badRequest(message: string): ApiResult<never> {
  return { ok: false, status: 400, body: { error: message } };
}

async function getMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMembership | null> {
  const members = await listMembers(workspaceId);
  return members.find((m) => m.userId === userId) ?? null;
}

function parseAppId(body: { appId?: unknown }): string | null {
  if (typeof body.appId !== "string") return null;
  const appId = body.appId.trim();
  return appId || null;
}

/**
 * GET list — filter by permission (b) for Participants.
 * Owners/Facilitators always see all placements.
 */
export async function listWorkspacePlacements(
  userId: string | null,
  workspaceId: string
): Promise<ApiResult<{ placements: WorkspacePlacement[] }>> {
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

  const canSeeOthers = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "bots.viewOthers",
  }).ok;

  if (canSeeOthers) {
    return { ok: true, status: 200, body: { placements } };
  }

  const owned = await listApps(userId);
  const ownedIds = new Set(owned.map((app) => app.id));
  return {
    ok: true,
    status: 200,
    body: { placements: placements.filter((p) => ownedIds.has(p.appId)) },
  };
}

/**
 * POST place — only bot owner; gated by bots.place (permission a for Participants).
 * Does not mutate AppConfig.ownerId. Appends bot.placed when newly placed.
 */
export async function placeWorkspaceBot(
  userId: string | null,
  workspaceId: string,
  body: { appId?: unknown }
): Promise<ApiResult<{ ok: true }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  if (!membership) return forbidden();

  const appId = parseAppId(body);
  if (!appId) return badRequest("Missing appId");

  const canPlace = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "bots.place",
  });
  if (!canPlace.ok) {
    return forbidden("Missing permission to place bots into this Workspace");
  }

  const app = await getAppById(appId);
  if (!app) return notFound("Bot not found");
  if (app.ownerId !== userId) {
    return forbidden("Only the bot owner can place");
  }

  const existing = (await listPlacements(workspaceId)).find(
    (p) => p.appId === appId
  );

  await placeApp(workspaceId, appId, userId);

  if (!existing) {
    await appendActivity({
      workspaceId,
      type: "bot.placed",
      actorUserId: userId,
      payload: { appId },
    });
  }

  return { ok: true, status: 200, body: { ok: true } };
}

/**
 * DELETE unplace — own placement needs bots.removeOwnPlacement (d);
 * Facilitators/Owners may removeAny without deleting the bot.
 * Appends bot.unplaced.
 */
export async function unplaceWorkspaceBot(
  userId: string | null,
  workspaceId: string,
  body: { appId?: unknown }
): Promise<ApiResult<{ ok: true }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  if (!membership) return forbidden();

  const appId = parseAppId(body);
  if (!appId) return badRequest("Missing appId");

  const placements = await listPlacements(workspaceId);
  const placement = placements.find((p) => p.appId === appId);
  if (!placement) return notFound("Placement not found");

  const app = await getAppById(appId);
  const isBotOwner = app?.ownerId === userId;

  const canRemoveAny = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "bots.removeAnyPlacement",
  });
  const canRemoveOwn = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "bots.removeOwnPlacement",
    isBotOwner,
  });

  if (!canRemoveAny.ok && !canRemoveOwn.ok) {
    return forbidden("Missing permission to remove this placement");
  }

  await removePlacement(workspaceId, appId);

  await appendActivity({
    workspaceId,
    type: "bot.unplaced",
    actorUserId: userId,
    payload: { appId },
  });

  return { ok: true, status: 200, body: { ok: true } };
}
