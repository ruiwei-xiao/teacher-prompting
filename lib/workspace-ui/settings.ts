/**
 * Client-safe Workspace settings helpers: rename, building permissions,
 * and Owner-only delete affordances.
 */
import type {
  BuildingPermissions,
  Workspace,
  WorkspaceRole,
} from "@/lib/workspace-store/types";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type BuildingPermissionField = {
  key: keyof BuildingPermissions;
  letter: "a" | "b" | "c" | "d";
  label: string;
  description: string;
};

/** Building permissions a–d (Requirement 5.1). */
export const BUILDING_PERMISSION_FIELDS: BuildingPermissionField[] = [
  {
    key: "canCreateBots",
    letter: "a",
    label: "Create bots into this Workspace",
    description: "Members may create bots into this Workspace.",
  },
  {
    key: "canSeeOthersBots",
    letter: "b",
    label: "See each other’s placed bots",
    description: "Members may see each other’s bots placed in this Workspace.",
  },
  {
    key: "canShareOutside",
    letter: "c",
    label: "Share outside this Workspace",
    description:
      "Members may place bots into other Workspaces and use educator-oriented outward sharing. Publish to students is never gated by this setting.",
  },
  {
    key: "canManageOwnBots",
    letter: "d",
    label: "Manage own placed bots",
    description:
      "Members may remove their own placements and delete their own bots.",
  },
];

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

function isBuildingPermissions(value: unknown): value is BuildingPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.canCreateBots === "boolean" &&
    typeof p.canSeeOthersBots === "boolean" &&
    typeof p.canShareOutside === "boolean" &&
    typeof p.canManageOwnBots === "boolean"
  );
}

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    typeof w.name === "string" &&
    isBuildingPermissions(w.buildingPermissions)
  );
}

/** Owners and Facilitators may rename and edit building permissions. */
export function canEditWorkspaceSettings(role: WorkspaceRole): boolean {
  return role === "owner" || role === "facilitator";
}

/** Only the Owner may delete the Workspace. */
export function canDeleteWorkspace(role: WorkspaceRole): boolean {
  return role === "owner";
}

/** Settings lives on the workspace hub as `?tab=settings`. */
export function workspaceSettingsHref(workspaceId: string): string {
  return `/workspace/${workspaceId}?tab=settings`;
}

/** Build PATCH body; null when name is blank after trim. */
export function buildWorkspaceSettingsPatchBody(input: {
  name: string;
  buildingPermissions: BuildingPermissions;
}): { name: string; buildingPermissions: BuildingPermissions } | null {
  const trimmed = input.name.trim();
  if (!trimmed) return null;
  return {
    name: trimmed,
    buildingPermissions: { ...input.buildingPermissions },
  };
}

/** Parse PATCH /api/workspaces/:id JSON. */
export function parseWorkspacePatchResponse(
  status: number,
  body: unknown
): ParseResult<{ workspace: Workspace }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to update workspace settings"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid settings response" };
  }
  const workspace = (body as { workspace?: unknown }).workspace;
  if (!isWorkspace(workspace)) {
    return { ok: false, error: "Invalid settings response" };
  }
  return { ok: true, workspace };
}

/** Parse DELETE /api/workspaces/:id JSON. */
export function parseWorkspaceDeleteResponse(
  status: number,
  body: unknown
): ParseResult<{ deleted: true }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to delete workspace"),
    };
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body as { ok?: unknown }).ok !== true
  ) {
    return { ok: false, error: "Invalid delete response" };
  }
  return { ok: true, deleted: true };
}
