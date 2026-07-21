/**
 * Client-safe Workspace hub helpers: placement visibility (permission b)
 * and place/unplace capability (permissions a / d × role).
 */
import type {
  BuildingPermissions,
  WorkspacePlacement,
  WorkspaceRole,
} from "@/lib/workspace-store/types";

export type HubBotSummary = {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  publicSlug?: string;
  projectShareSlug?: string | null;
  projectShareVisibility?: "private" | "public";
  shareAuthorName?: boolean;
  communitySubject?: string | null;
  communityTags?: string[];
  ownerId?: string;
};

function isFacilitationRole(role: WorkspaceRole): boolean {
  return role === "owner" || role === "facilitator";
}

/**
 * Filter placements by role × permission (b).
 * Owners/Facilitators see all; Participants need canSeeOthersBots or ownership.
 */
export function filterVisiblePlacements(input: {
  placements: WorkspacePlacement[];
  role: WorkspaceRole;
  permissions: BuildingPermissions;
  ownedAppIds: ReadonlySet<string>;
}): WorkspacePlacement[] {
  const { placements, role, permissions, ownedAppIds } = input;
  if (isFacilitationRole(role) || permissions.canSeeOthersBots) {
    return placements.slice();
  }
  return placements.filter((p) => ownedAppIds.has(p.appId));
}

/** Whether the actor may place an owned bot into the Workspace (permission a). */
export function canPlaceIntoWorkspace(input: {
  role: WorkspaceRole;
  permissions: BuildingPermissions;
}): boolean {
  if (isFacilitationRole(input.role)) return true;
  return input.permissions.canCreateBots;
}

/**
 * Whether the actor may remove a placement (own needs d; facilitation may remove any).
 */
export function canUnplaceFromWorkspace(input: {
  role: WorkspaceRole;
  permissions: BuildingPermissions;
  isBotOwner: boolean;
}): boolean {
  if (isFacilitationRole(input.role)) return true;
  if (!input.isBotOwner) return false;
  return input.permissions.canManageOwnBots;
}

/** Owned bots that are not yet placed in this Workspace. */
export function listPlaceableOwnedBots(input: {
  ownedBots: HubBotSummary[];
  placedAppIds: ReadonlySet<string>;
}): HubBotSummary[] {
  return input.ownedBots.filter((bot) => !input.placedAppIds.has(bot.id));
}

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

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

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === "owner" || value === "facilitator" || value === "participant";
}

/** Parse GET /api/workspaces/:id JSON. */
export function parseWorkspaceGetResponse(
  status: number,
  body: unknown
): ParseResult<{
  workspace: {
    id: string;
    name: string;
    buildingPermissions: BuildingPermissions;
  };
  role: WorkspaceRole;
}> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load workspace"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid workspace response" };
  }
  const workspace = (body as { workspace?: unknown }).workspace;
  const role = (body as { role?: unknown }).role;
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    return { ok: false, error: "Invalid workspace response" };
  }
  const w = workspace as Record<string, unknown>;
  if (
    typeof w.id !== "string" ||
    typeof w.name !== "string" ||
    !isBuildingPermissions(w.buildingPermissions) ||
    !isWorkspaceRole(role)
  ) {
    return { ok: false, error: "Invalid workspace response" };
  }
  return {
    ok: true,
    workspace: {
      id: w.id,
      name: w.name,
      buildingPermissions: w.buildingPermissions,
    },
    role,
  };
}

function isPlacement(value: unknown): value is WorkspacePlacement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.workspaceId === "string" &&
    typeof p.appId === "string" &&
    typeof p.placedByUserId === "string" &&
    typeof p.placedAt === "string"
  );
}

/** Parse GET /api/workspaces/:id/placements JSON. */
export function parsePlacementsListResponse(
  status: number,
  body: unknown
): ParseResult<{ placements: WorkspacePlacement[] }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load placements"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid placements response" };
  }
  const placements = (body as { placements?: unknown }).placements;
  if (!Array.isArray(placements) || !placements.every(isPlacement)) {
    return { ok: false, error: "Invalid placements response" };
  }
  return { ok: true, placements };
}
