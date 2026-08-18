/**
 * WorkspacesAPI membership handlers (Task 2.2).
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { getUsersByIds } from "@/lib/auth/user-store";
import { assertWorkspaceAction } from "@/lib/workspace-store/permissions";
import {
  appendActivity,
  getWorkspace,
  listInvites,
  listMembers,
  removeMember,
  setMemberRole,
  transferOwnership,
} from "@/lib/workspace-store/store";
import type {
  WorkspaceInvite,
  WorkspaceMembership,
  WorkspaceRole,
} from "@/lib/workspace-store/types";

export type WorkspaceMemberListItem = WorkspaceMembership & {
  email: string | null;
  name: string | null;
};

export type MemberViewerProfile = {
  email?: string | null;
  name?: string | null;
};

function cleanText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function emailFromAcceptedInvite(
  member: WorkspaceMembership,
  invites: WorkspaceInvite[]
): string | null {
  const joinedMs = Date.parse(member.joinedAt);
  if (!Number.isFinite(joinedMs)) return null;
  let best: string | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const invite of invites) {
    if (invite.kind !== "email") continue;
    const email = cleanText(invite.email);
    if (!email || !invite.revokedAt) continue;
    const revokedMs = Date.parse(invite.revokedAt);
    if (!Number.isFinite(revokedMs)) continue;
    const delta = Math.abs(revokedMs - joinedMs);
    if (delta <= 5_000 && delta < bestDelta) {
      best = email;
      bestDelta = delta;
    }
  }
  return best;
}

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

function unprocessable(message: string): ApiResult<never> {
  return { ok: false, status: 422, body: { error: message } };
}

async function getMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMembership | null> {
  const members = await listMembers(workspaceId);
  return members.find((m) => m.userId === userId) ?? null;
}

async function withMemberEmails(
  members: WorkspaceMembership[],
  viewer?: { userId: string } & MemberViewerProfile
): Promise<WorkspaceMemberListItem[]> {
  const users = await getUsersByIds(members.map((member) => member.userId));
  const invites = members[0]
    ? await listInvites(members[0].workspaceId)
    : [];
  return members.map((member) => {
    const user = users.get(member.userId);
    const isViewer = viewer?.userId === member.userId;
    return {
      ...member,
      email:
        cleanText(user?.email) ??
        (isViewer ? cleanText(viewer?.email) : null) ??
        emailFromAcceptedInvite(member, invites),
      name:
        cleanText(user?.name) ??
        (isViewer ? cleanText(viewer?.name) : null),
    };
  });
}

function matchesMemberListQuery(
  member: WorkspaceMemberListItem,
  query?: string
): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (member.userId.toLowerCase().includes(q)) return true;
  if (member.email?.toLowerCase().includes(q)) return true;
  if (member.name?.toLowerCase().includes(q)) return true;
  return false;
}

const DEMOTE_ROLES = new Set(["facilitator", "participant"]);
const ASSIGNABLE_ROLES = new Set(["facilitator", "participant"]);

export async function listWorkspaceMembers(
  userId: string | null,
  workspaceId: string,
  query?: string,
  viewer?: MemberViewerProfile
): Promise<ApiResult<{ members: WorkspaceMemberListItem[] }>> {
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

  const members = await withMemberEmails(await listMembers(workspaceId), {
    userId,
    email: viewer?.email,
    name: viewer?.name,
  });
  const filtered = query
    ? members.filter((member) => matchesMemberListQuery(member, query))
    : members;
  return { ok: true, status: 200, body: { members: filtered } };
}

export async function changeMemberRole(
  userId: string | null,
  workspaceId: string,
  body: { userId?: unknown; role?: unknown }
): Promise<ApiResult<{ ok: true }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  const manage = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "members.manage",
  });
  if (!manage.ok) {
    return forbidden();
  }

  const targetUserId =
    typeof body.userId === "string" ? body.userId.trim() : "";
  if (!targetUserId) {
    return badRequest("Missing userId");
  }
  if (typeof body.role !== "string" || !ASSIGNABLE_ROLES.has(body.role)) {
    return badRequest(
      body.role === "owner"
        ? "Use ownership transfer to assign Owner"
        : "role must be facilitator or participant"
    );
  }
  const nextRole = body.role as "facilitator" | "participant";

  const target = await getMembership(workspaceId, targetUserId);
  if (!target) {
    return notFound("Member not found");
  }

  // Facilitator cannot change Owner (Req 3.3).
  if (target.role === "owner" && membership!.role !== "owner") {
    return forbidden("Cannot change Owner role");
  }

  // Only transfer may change Owner; do not demote Owner via role PATCH.
  if (target.role === "owner") {
    return badRequest("Use ownership transfer to change Owner");
  }

  if (target.role === nextRole) {
    return { ok: true, status: 200, body: { ok: true } };
  }

  await setMemberRole(workspaceId, targetUserId, nextRole as WorkspaceRole);
  return { ok: true, status: 200, body: { ok: true } };
}

export async function transferWorkspaceOwnership(
  userId: string | null,
  workspaceId: string,
  body: { transferToUserId?: unknown; demoteTo?: unknown }
): Promise<ApiResult<{ ok: true }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  if (!membership) {
    return forbidden();
  }
  // Only the current Owner may transfer (Req 3.2, 3.5).
  if (membership.role !== "owner") {
    return forbidden();
  }

  const transferToUserId =
    typeof body.transferToUserId === "string"
      ? body.transferToUserId.trim()
      : "";
  if (!transferToUserId) {
    return badRequest("Missing transferToUserId");
  }
  if (typeof body.demoteTo !== "string" || !DEMOTE_ROLES.has(body.demoteTo)) {
    return badRequest("demoteTo must be facilitator or participant");
  }
  const demoteTo = body.demoteTo as "facilitator" | "participant";

  if (transferToUserId === userId) {
    return badRequest("Cannot transfer ownership to yourself");
  }

  const recipient = await getMembership(workspaceId, transferToUserId);
  if (!recipient) {
    return unprocessable("Transfer target must be an existing member");
  }

  await transferOwnership(workspaceId, transferToUserId, demoteTo);
  return { ok: true, status: 200, body: { ok: true } };
}

/**
 * PATCH body dispatcher: role change or ownership transfer.
 */
export async function patchWorkspaceMembers(
  userId: string | null,
  workspaceId: string,
  body: Record<string, unknown>
): Promise<ApiResult<{ ok: true }>> {
  if (
    body.transferToUserId !== undefined ||
    body.demoteTo !== undefined
  ) {
    return transferWorkspaceOwnership(userId, workspaceId, body);
  }
  return changeMemberRole(userId, workspaceId, body);
}

export async function removeWorkspaceMember(
  userId: string | null,
  workspaceId: string,
  body: { userId?: unknown }
): Promise<ApiResult<{ ok: true }>> {
  if (!userId) return unauthorized();

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return notFound();

  const membership = await getMembership(workspaceId, userId);
  if (!membership) {
    return forbidden();
  }

  const targetUserId =
    typeof body.userId === "string" ? body.userId.trim() : "";
  if (!targetUserId) {
    return badRequest("Missing userId");
  }

  const target = await getMembership(workspaceId, targetUserId);
  if (!target) {
    return notFound("Member not found");
  }

  const isSelfLeave = targetUserId === userId;

  if (isSelfLeave) {
    // Sole Owner must transfer before leaving (design Error Handling).
    if (membership.role === "owner") {
      return unprocessable("Transfer ownership before leaving");
    }
    await removeMember(workspaceId, targetUserId);
    await appendActivity({
      workspaceId,
      type: "member.left",
      actorUserId: userId,
      payload: { userId: targetUserId },
    });
    return { ok: true, status: 200, body: { ok: true } };
  }

  // Removing another member requires members.manage.
  const manage = assertWorkspaceAction({
    membership,
    permissions: workspace.buildingPermissions,
    action: "members.manage",
  });
  if (!manage.ok) {
    return forbidden();
  }

  // Facilitator cannot remove Owner (Req 3.3).
  if (target.role === "owner" && membership.role !== "owner") {
    return forbidden("Cannot remove Owner");
  }

  // Owner should not remove themselves via this path without transfer —
  // (self path already handled). If somehow targeting another Owner (shouldn't
  // exist with sole-owner invariant), still block removing Owner without transfer.
  if (target.role === "owner") {
    return unprocessable("Transfer ownership before removing Owner");
  }

  await removeMember(workspaceId, targetUserId);
  await appendActivity({
    workspaceId,
    type: "member.removed",
    actorUserId: userId,
    payload: { userId: targetUserId },
  });
  return { ok: true, status: 200, body: { ok: true } };
}
