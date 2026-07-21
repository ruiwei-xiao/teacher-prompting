/**
 * Workspace domain types for educator Workspaces (WorkspaceStore boundary).
 * Shapes align with `.kiro/specs/educator-workspaces/design.md`.
 */

export type WorkspaceRole = "owner" | "facilitator" | "participant";

/** Roles that may be granted via invite (Owner is never assigned by ordinary invite). */
export type WorkspaceInviteRole = "facilitator" | "participant";

/**
 * Building permissions toggles (Requirement 5.1):
 * (a) canCreateBots — members may create bots into this Workspace
 * (b) canSeeOthersBots — members may see each other's placed bots
 * (c) canShareOutside — place to other Workspaces + educator outward share
 * (d) canManageOwnBots — remove own placement / delete own bots
 */
export type BuildingPermissions = {
  canCreateBots: boolean;
  canSeeOthersBots: boolean;
  canShareOutside: boolean;
  canManageOwnBots: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  buildingPermissions: BuildingPermissions;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
};

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  kind: "email" | "link";
  email?: string;
  role: WorkspaceInviteRole;
  token: string;
  expiresAt?: string;
  revokedAt?: string;
  createdByUserId: string;
  createdAt: string;
};

export type WorkspacePlacement = {
  workspaceId: string;
  appId: string;
  placedByUserId: string;
  placedAt: string;
};

export type WorkspaceActivityType =
  | "member.joined"
  | "member.left"
  | "member.removed"
  | "bot.placed"
  | "bot.unplaced"
  | "workspace.renamed"
  | "permissions.updated";

/**
 * Lightweight activity event (ActivityLog).
 * `payload` is event-specific JSON; kept as a string-keyed map with unknown values (no `any`).
 */
export type WorkspaceActivityEvent = {
  id: string;
  workspaceId: string;
  type: WorkspaceActivityType;
  actorUserId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};
