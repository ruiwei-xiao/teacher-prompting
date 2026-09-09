/**
 * Client-safe Workspace navigation helpers for WorkspaceSidebar / create dialog.
 */
import type {
  BuildingPermissions,
  Workspace,
} from "@/lib/workspace-store/types";

export const MY_BOTS_HREF = "/";
export const COMMUNITY_HREF = "/community";

/** Sidebar and form limit so workspace names stay readable in the rail. */
export const WORKSPACE_NAME_MAX_LENGTH = 40;

export function isCommunityPath(pathname: string): boolean {
  return pathname === COMMUNITY_HREF || pathname.startsWith(`${COMMUNITY_HREF}/`);
}

/** Empty or over-long names are rejected before create/rename. */
export function workspaceNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a workspace name";
  if (trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    return `Workspace name must be ${WORKSPACE_NAME_MAX_LENGTH} characters or fewer`;
  }
  return null;
}

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
  if (workspaceNameError(name)) return null;
  const trimmed = name.trim();
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

/** Workspace hub id from a path. Invite accept URLs are not hubs. */
export function workspaceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/workspace\/([^/]+)/);
  if (!match) return null;
  if (pathname.startsWith("/workspace/invite/")) return null;
  return match[1] || null;
}

/** Compact mark for an icon-only workspace row. */
export function workspaceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "W";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

const WORKSPACE_MARK_TONES = [
  "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/80 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-600",
  "bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-300/80 dark:bg-zinc-800 dark:text-stone-200 dark:ring-zinc-600",
  "bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-600",
  "bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-300/80 dark:bg-zinc-800 dark:text-neutral-200 dark:ring-zinc-600",
  "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200/90 dark:bg-sky-950/50 dark:text-sky-100 dark:ring-sky-800/80",
] as const;

/** Quiet monogram surface — not a loud filled chip. */
export function workspaceMarkTone(name: string): string {
  const text = name.trim();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash + text.charCodeAt(i)) % 2147483647;
  }
  return (
    WORKSPACE_MARK_TONES[hash % WORKSPACE_MARK_TONES.length] ??
    WORKSPACE_MARK_TONES[0]
  );
}
