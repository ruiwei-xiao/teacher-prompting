/**
 * Compile-time smoke check for Workspace domain types (Task 1.1).
 * Exercises shapes required by design so missing exports fail `tsc --noEmit`.
 */
import type {
  BuildingPermissions,
  Workspace,
  WorkspaceActivityEvent,
  WorkspaceActivityType,
  WorkspaceInvite,
  WorkspaceMembership,
  WorkspacePlacement,
  WorkspaceRole,
} from "./types";

const roleOwner: WorkspaceRole = "owner";
const roleFacilitator: WorkspaceRole = "facilitator";
const roleParticipant: WorkspaceRole = "participant";

const permissions: BuildingPermissions = {
  canCreateBots: false,
  canSeeOthersBots: false,
  canShareOutside: false,
  canManageOwnBots: false,
};

const workspace: Workspace = {
  id: "ws_1",
  name: "Course A",
  buildingPermissions: permissions,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const membership: WorkspaceMembership = {
  workspaceId: workspace.id,
  userId: "user_1",
  role: roleOwner,
  joinedAt: "2026-01-01T00:00:00.000Z",
};

const emailInvite: WorkspaceInvite = {
  id: "inv_1",
  workspaceId: workspace.id,
  kind: "email",
  email: "teacher@example.com",
  role: roleFacilitator,
  token: "token_email",
  createdByUserId: "user_1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const linkInvite: WorkspaceInvite = {
  id: "inv_2",
  workspaceId: workspace.id,
  kind: "link",
  role: roleParticipant,
  token: "token_link",
  expiresAt: "2026-12-31T00:00:00.000Z",
  revokedAt: undefined,
  createdByUserId: "user_1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const placement: WorkspacePlacement = {
  workspaceId: workspace.id,
  appId: "app_1",
  placedByUserId: "user_1",
  placedAt: "2026-01-01T00:00:00.000Z",
};

const activityTypes: WorkspaceActivityType[] = [
  "member.joined",
  "member.left",
  "member.removed",
  "bot.placed",
  "bot.unplaced",
  "workspace.renamed",
  "permissions.updated",
];

const activityEvent: WorkspaceActivityEvent = {
  id: "act_1",
  workspaceId: workspace.id,
  type: "bot.placed",
  actorUserId: "user_1",
  payload: { appId: placement.appId },
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const __workspaceTypesCompileCheck = {
  roleOwner,
  roleFacilitator,
  roleParticipant,
  permissions,
  workspace,
  membership,
  emailInvite,
  linkInvite,
  placement,
  activityTypes,
  activityEvent,
};
