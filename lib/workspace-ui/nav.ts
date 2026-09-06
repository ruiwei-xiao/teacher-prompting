/**
 * Client-safe Workspace navigation helpers for WorkspaceSidebar / create dialog.
 */
import type {
  BuildingPermissions,
  Workspace,
} from "@/lib/workspace-store/types";

export const MY_BOTS_HREF = "/";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const w = value as Record<string, unknown>;
  return typeof w.id === "string" && typeof w.name === "string";
}

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

/** Parse GET /api/workspaces JSON. */
export function parseWorkspacesListResponse(
  status: number,
  body: unknown
): ParseResult<{ workspaces: Workspace[] }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load workspaces"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid workspaces response" };
  }
  const workspaces = (body as { workspaces?: unknown }).workspaces;
  if (!Array.isArray(workspaces) || !workspaces.every(isWorkspace)) {
    return { ok: false, error: "Invalid workspaces response" };
  }
  return { ok: true, workspaces };
}

/** New-Workspace building permissions: (a)–(d) all off, including (b). */
export const DEFAULT_CREATE_BUILDING_PERMISSIONS: BuildingPermissions = {
  canCreateBots: false,
  canSeeOthersBots: false,
  canShareOutside: false,
  canManageOwnBots: false,
};

function isAllOffBuildingPermissions(
  permissions: BuildingPermissions
): boolean {
  return (
    permissions.canCreateBots === false &&
    permissions.canSeeOthersBots === false &&
    permissions.canShareOutside === false &&
    permissions.canManageOwnBots === false
  );
}

export type CreateWorkspaceBody = {
  name: string;
  buildingPermissions?: BuildingPermissions;
};

/** Build POST /api/workspaces body; null when name is blank after trim.
 * All-off permissions are omitted so the API keeps new-Workspace defaults (5.3, 7.1).
 * Assisted Authoring is never sent (5.8). */
export function buildCreateWorkspaceBody(
  name: string,
  buildingPermissions?: BuildingPermissions
): CreateWorkspaceBody | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (
    !buildingPermissions ||
    isAllOffBuildingPermissions(buildingPermissions)
  ) {
    return { name: trimmed };
  }
  return {
    name: trimmed,
    buildingPermissions: {
      canCreateBots: buildingPermissions.canCreateBots,
      canSeeOthersBots: buildingPermissions.canSeeOthersBots,
      canShareOutside: buildingPermissions.canShareOutside,
      canManageOwnBots: buildingPermissions.canManageOwnBots,
    },
  };
}

/** Parse POST /api/workspaces JSON. */
export function parseCreateWorkspaceResponse(
  status: number,
  body: unknown
): ParseResult<{ workspace: Workspace }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to create workspace"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid create workspace response" };
  }
  const workspace = (body as { workspace?: unknown }).workspace;
  if (!isWorkspace(workspace)) {
    return { ok: false, error: "Invalid create workspace response" };
  }
  return { ok: true, workspace };
}

export function workspaceHubHref(workspaceId: string): string {
  return `/workspace/${workspaceId}`;
}
