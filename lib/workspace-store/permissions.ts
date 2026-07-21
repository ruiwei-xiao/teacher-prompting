/**
 * Role × building-permission × action evaluation (Permissions boundary).
 * Aligns with `.kiro/specs/educator-workspaces/design.md` Permissions component.
 */
import type { BuildingPermissions, WorkspaceMembership } from "./types";

export type WorkspaceAction =
  | "workspace.view"
  | "workspace.rename"
  | "workspace.delete"
  | "workspace.updatePermissions"
  | "members.manage"
  | "activity.viewFacilitation"
  | "activity.viewParticipant"
  | "bots.createIntoWorkspace"
  | "bots.viewOthers"
  | "bots.place"
  | "bots.removeOwnPlacement"
  | "bots.removeAnyPlacement"
  | "bots.shareEducatorOutside"
  | "bots.deleteOwn"
  | "bots.inspectPeer"
  /** Student-facing Publish — never gated by Workspace building permissions (Req 5.7). */
  | "bots.publish";

export type AssertWorkspaceActionResult =
  | { ok: true }
  | { ok: false; code: "unauthorized" | "forbidden" };

export type AssertWorkspaceActionInput = {
  membership: WorkspaceMembership | null;
  permissions: BuildingPermissions;
  action: WorkspaceAction;
  isBotOwner?: boolean;
  /**
   * Playlab-scoped permission (c): educator outward share / place-to-other-WS is gated
   * only when Workspace context is present. When false, (c) does not apply.
   * Defaults to true for `bots.shareEducatorOutside` (callers with context).
   */
  hasWorkspaceContext?: boolean;
};

function allow(): AssertWorkspaceActionResult {
  return { ok: true };
}

function unauthorized(): AssertWorkspaceActionResult {
  return { ok: false, code: "unauthorized" };
}

function forbidden(): AssertWorkspaceActionResult {
  return { ok: false, code: "forbidden" };
}

function isFacilitationRole(role: WorkspaceMembership["role"]): boolean {
  return role === "owner" || role === "facilitator";
}

/**
 * Pure evaluation of whether an actor may perform a Workspace or gated apps action.
 */
export function assertWorkspaceAction(
  input: AssertWorkspaceActionInput
): AssertWorkspaceActionResult {
  const { membership, permissions, action, isBotOwner } = input;

  // Req 5.7: Workspace policy never gates student-facing Publish.
  if (action === "bots.publish") {
    return allow();
  }

  if (!membership) {
    return unauthorized();
  }

  const { role } = membership;
  const facilitation = isFacilitationRole(role);

  switch (action) {
    case "workspace.view":
    case "activity.viewParticipant":
      return allow();

    case "workspace.rename":
    case "workspace.updatePermissions":
    case "members.manage":
    case "activity.viewFacilitation":
    case "bots.removeAnyPlacement":
      return facilitation ? allow() : forbidden();

    case "workspace.delete":
      return role === "owner" ? allow() : forbidden();

    case "bots.createIntoWorkspace":
    case "bots.place":
      // (a) — Owners/Facilitators bypass; same-Workspace place is not gated by (c).
      if (facilitation) return allow();
      return permissions.canCreateBots ? allow() : forbidden();

    case "bots.viewOthers":
    case "bots.inspectPeer":
      // (b)
      if (facilitation) return allow();
      return permissions.canSeeOthersBots ? allow() : forbidden();

    case "bots.shareEducatorOutside": {
      // (c) Playlab-scoped: only when Workspace context is present.
      const hasContext = input.hasWorkspaceContext !== false;
      if (!hasContext) return allow();
      if (facilitation) return allow();
      return permissions.canShareOutside ? allow() : forbidden();
    }

    case "bots.removeOwnPlacement":
    case "bots.deleteOwn":
      // (d) — Participants need ownership + toggle; facilitation roles bypass toggle for own bots.
      if (isBotOwner !== true) return forbidden();
      if (facilitation) return allow();
      return permissions.canManageOwnBots ? allow() : forbidden();

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
