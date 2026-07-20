/**
 * WorkspacesAPI CRUD handlers (Task 2.1).
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { assertWorkspaceAction } from "@/lib/workspace-store/permissions";
import {
  appendActivity,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listMembers,
  listWorkspacesForUser,
  updateWorkspace,
} from "@/lib/workspace-store/store";
import type {
  BuildingPermissions,
  Workspace,
  WorkspaceMembership,
  WorkspaceRole,
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

function parseBuildingPermissions(
  value: unknown,
  current: BuildingPermissions
): BuildingPermissions | { error: string } {
  if (value === undefined) {
    return current;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Invalid buildingPermissions" };
  }
  const input = value as Record<string, unknown>;
  const keys: (keyof BuildingPermissions)[] = [
    "canCreateBots",
    "canSeeOthersBots",
    "canShareOutside",
    "canManageOwnBots",
  ];
  const next: BuildingPermissions = { ...current };
  for (const key of keys) {
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return { error: `buildingPermissions.${key} must be a boolean` };
      }
      next[key] = input[key] as boolean;
    }
  }
  return next;
}

function permissionsChanged(
  a: BuildingPermissions,
  b: BuildingPermissions
): boolean {
  return (
    a.canCreateBots !== b.canCreateBots ||
    a.canSeeOthersBots !== b.canSeeOthersBots ||
    a.canShareOutside !== b.canShareOutside ||
    a.canManageOwnBots !== b.canManageOwnBots
  );
}

export async function listWorkspaces(
  userId: string | null
): Promise<ApiResult<{ workspaces: Workspace[] }>> {
  if (!userId) return unauthorized();
  const workspaces = await listWorkspacesForUser(userId);
  return { ok: true, status: 200, body: { workspaces } };
}

export async function createWorkspaces(
  userId: string | null,
  body: { name?: unknown }
): Promise<ApiResult<{ workspace: Workspace }>> {
  if (!userId) return unauthorized();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return badRequest("Missing workspace name");
  }
  const workspace = await createWorkspace({ name, ownerUserId: userId });
  return { ok: true, status: 200, body: { workspace } };
}

export async function getWorkspaceById(
  userId: string | null,
  workspaceId: string
): Promise<ApiResult<{ workspace: Workspace; role: WorkspaceRole }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  const view = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "workspace.view",
  });
  if (!view.ok) {
    return forbidden();
  }

  return {
    ok: true,
    status: 200,
    body: { workspace, role: membership!.role },
  };
}

export async function updateWorkspaceById(
  userId: string | null,
  workspaceId: string,
  body: { name?: unknown; buildingPermissions?: unknown }
): Promise<ApiResult<{ workspace: Workspace }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);

  const hasName = typeof body.name === "string";
  const hasPermissions = body.buildingPermissions !== undefined;
  if (!hasName && !hasPermissions) {
    return badRequest("No settings changes provided");
  }

  let nextName = workspace.name;
  if (hasName) {
    const name = (body.name as string).trim();
    if (!name) {
      return badRequest("Workspace name cannot be empty");
    }
    const renameCheck = assertWorkspaceAction({
      membership,
      permissions: workspace.buildingPermissions,
      action: "workspace.rename",
    });
    if (!renameCheck.ok) {
      return forbidden();
    }
    nextName = name;
  }

  let nextPermissions = workspace.buildingPermissions;
  if (hasPermissions) {
    const parsed = parseBuildingPermissions(
      body.buildingPermissions,
      workspace.buildingPermissions
    );
    if ("error" in parsed) {
      return badRequest(parsed.error);
    }
    const permCheck = assertWorkspaceAction({
      membership,
      permissions: workspace.buildingPermissions,
      action: "workspace.updatePermissions",
    });
    if (!permCheck.ok) {
      return forbidden();
    }
    nextPermissions = parsed;
  }

  const nameChanged = nextName !== workspace.name;
  const permsChanged = permissionsChanged(
    workspace.buildingPermissions,
    nextPermissions
  );

  if (!nameChanged && !permsChanged) {
    return { ok: true, status: 200, body: { workspace } };
  }

  const updated = await updateWorkspace(workspaceId, {
    ...(nameChanged ? { name: nextName } : {}),
    ...(permsChanged ? { buildingPermissions: nextPermissions } : {}),
  });

  if (nameChanged) {
    await appendActivity({
      workspaceId,
      type: "workspace.renamed",
      actorUserId: userId,
      payload: { from: workspace.name, to: nextName },
    });
  }
  if (permsChanged) {
    await appendActivity({
      workspaceId,
      type: "permissions.updated",
      actorUserId: userId,
      payload: { ...nextPermissions },
    });
  }

  return { ok: true, status: 200, body: { workspace: updated } };
}

export async function deleteWorkspaceById(
  userId: string | null,
  workspaceId: string
): Promise<ApiResult<{ ok: true }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  const check = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "workspace.delete",
  });
  if (!check.ok) {
    return forbidden();
  }

  // Cascades memberships/invites/placements/activity; do not append delete activity.
  await deleteWorkspace(workspaceId);
  return { ok: true, status: 200, body: { ok: true } };
}
