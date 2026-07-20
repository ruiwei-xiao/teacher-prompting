/**
 * AppsAPIGates — Workspace permission (c)/(d) for personal apps PATCH/DELETE.
 * Playlab-scoped (c): only when request carries workspaceId; never gates publish.
 */
import { assertWorkspaceAction } from "@/lib/workspace-store/permissions";
import {
  getWorkspace,
  listMembers,
  listPlacements,
  listWorkspacesForUser,
} from "@/lib/workspace-store/store";
import type { WorkspaceMembership } from "@/lib/workspace-store/types";

export type GateResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Educator-outward PATCH fields gated by permission (c) with Workspace context. */
export const EDUCATOR_OUTWARD_PATCH_KEYS = [
  "shareProject",
  "projectShareVisibility",
  "communitySubject",
  "communityTags",
  "shareAuthorName",
] as const;

export type EducatorOutwardPatchBody = {
  shareProject?: unknown;
  projectShareVisibility?: unknown;
  communitySubject?: unknown;
  communityTags?: unknown;
  shareAuthorName?: unknown;
  publish?: unknown;
  workspaceId?: unknown;
  [key: string]: unknown;
};

function forbidden(message: string): GateResult {
  return { ok: false, status: 403, error: message };
}

function notFound(message: string): GateResult {
  return { ok: false, status: 404, error: message };
}

async function getMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMembership | null> {
  const members = await listMembers(workspaceId);
  return members.find((m) => m.userId === userId) ?? null;
}

/**
 * True when the PATCH body touches educator-outward share/Community fields.
 * `publish` alone never counts. `shareProject` only when enabling (true).
 */
export function patchTouchesEducatorOutwardFields(
  body: EducatorOutwardPatchBody
): boolean {
  if (body.shareProject === true) return true;
  if (
    body.projectShareVisibility === "private" ||
    body.projectShareVisibility === "public"
  ) {
    return true;
  }
  if (typeof body.communitySubject === "string") return true;
  if (Array.isArray(body.communityTags)) return true;
  if (typeof body.shareAuthorName === "boolean") return true;
  return false;
}

function parseWorkspaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

/**
 * Permission (c): with Workspace context, Participants need canShareOutside.
 * No workspaceId → (c) does not apply. Publish-only bodies are never gated.
 */
export async function assertEducatorOutwardShareGate(input: {
  userId: string;
  workspaceId?: string | null;
  body: EducatorOutwardPatchBody;
}): Promise<GateResult> {
  if (!patchTouchesEducatorOutwardFields(input.body)) {
    return { ok: true };
  }

  const workspaceId =
    parseWorkspaceId(input.workspaceId) ??
    parseWorkspaceId(input.body.workspaceId);
  if (!workspaceId) {
    return { ok: true };
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound("Workspace not found");

  const membership = await getMembership(workspaceId, input.userId);
  if (!membership) {
    return forbidden("Missing permission for educator sharing in this Workspace");
  }

  const check = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "bots.shareEducatorOutside",
    hasWorkspaceContext: true,
  });

  if (!check.ok) {
    return forbidden(
      "Educator sharing is blocked by Workspace policy (members may not share outside)"
    );
  }

  return { ok: true };
}

/**
 * List Workspaces where this bot is placed and the user is a member.
 */
async function listConstrainingPlacementsForBot(
  userId: string,
  appId: string
): Promise<
  Array<{
    workspaceId: string;
    membership: WorkspaceMembership;
  }>
> {
  const workspaces = await listWorkspacesForUser(userId);
  const constrained: Array<{
    workspaceId: string;
    membership: WorkspaceMembership;
  }> = [];

  for (const workspace of workspaces) {
    const placements = await listPlacements(workspace.id);
    if (!placements.some((p) => p.appId === appId)) continue;
    const membership = await getMembership(workspace.id, userId);
    if (!membership) continue;
    constrained.push({ workspaceId: workspace.id, membership });
  }

  return constrained;
}

/**
 * Permission (d): Participants cannot delete own bot when constrained by a
 * Workspace placement with canManageOwnBots off.
 * Prefer explicit workspaceId when provided (validate membership); always
 * evaluate all placements for the bot so a fake workspaceId cannot bypass (d).
 */
export async function assertDeleteOwnBotGate(input: {
  userId: string;
  appId: string;
  workspaceId?: string | null;
}): Promise<GateResult> {
  const preferred = parseWorkspaceId(input.workspaceId);
  if (preferred) {
    const workspace = await getWorkspace(preferred);
    if (!workspace) return notFound("Workspace not found");
    const membership = await getMembership(preferred, input.userId);
    if (!membership) {
      return forbidden("Missing permission to manage bots in this Workspace");
    }
  }

  const contexts = await listConstrainingPlacementsForBot(
    input.userId,
    input.appId
  );

  for (const { workspaceId, membership } of contexts) {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) continue;

    const check = assertWorkspaceAction({
      membership,
      permissions: workspace.buildingPermissions,
      action: "bots.deleteOwn",
      isBotOwner: true,
    });

    if (!check.ok) {
      return forbidden(
        "Workspace policy prevents deleting this bot while manage-own is disabled"
      );
    }
  }

  return { ok: true };
}
