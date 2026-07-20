/**
 * WorkspacesAPI invite + join handlers (Task 2.3).
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { assertWorkspaceAction } from "@/lib/workspace-store/permissions";
import {
  acceptInviteByToken,
  appendActivity,
  createInvite,
  getWorkspace,
  listInvites,
  listMembers,
  listWorkspacesForUser,
  revokeInvite,
} from "@/lib/workspace-store/store";
import type {
  WorkspaceInvite,
  WorkspaceInviteRole,
  WorkspaceMembership,
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

function gone(message: string): ApiResult<never> {
  return { ok: false, status: 410, body: { error: message } };
}

async function getMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMembership | null> {
  const members = await listMembers(workspaceId);
  return members.find((m) => m.userId === userId) ?? null;
}

const INVITE_ROLES = new Set(["facilitator", "participant"]);
const INVITE_KINDS = new Set(["email", "link"]);

function inviteUrlForToken(token: string): string {
  return `/workspace/invite/${token}`;
}

function mapJoinError(message: string): ApiResult<never> {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) {
    return notFound("Invite not found");
  }
  if (
    lower.includes("revoked") ||
    lower.includes("expired") ||
    lower.includes("no longer valid")
  ) {
    return gone(
      message.includes("Invite is no longer valid")
        ? message
        : "Invite is no longer valid"
    );
  }
  return gone("Invite is no longer valid");
}

export async function listWorkspaceInvites(
  userId: string | null,
  workspaceId: string
): Promise<ApiResult<{ invites: WorkspaceInvite[] }>> {
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

  const invites = await listInvites(workspaceId);
  return { ok: true, status: 200, body: { invites } };
}

export async function createWorkspaceInvite(
  userId: string | null,
  workspaceId: string,
  body: {
    kind?: unknown;
    email?: unknown;
    role?: unknown;
    expiresAt?: unknown;
  }
): Promise<ApiResult<{ invite: WorkspaceInvite; inviteUrl?: string }>> {
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

  if (typeof body.kind !== "string" || !INVITE_KINDS.has(body.kind)) {
    return badRequest("kind must be email or link");
  }
  const kind = body.kind as "email" | "link";

  if (typeof body.role !== "string" || !INVITE_ROLES.has(body.role)) {
    return badRequest(
      body.role === "owner"
        ? "Owner cannot be granted by ordinary invite"
        : "role must be facilitator or participant"
    );
  }
  const role = body.role as WorkspaceInviteRole;

  let email: string | undefined;
  if (kind === "email") {
    if (typeof body.email !== "string" || !body.email.trim()) {
      return badRequest("Email invite requires an email address");
    }
    email = body.email.trim();
  } else if (body.email !== undefined && body.email !== null) {
    if (typeof body.email !== "string") {
      return badRequest("email must be a string");
    }
    email = body.email.trim() || undefined;
  }

  let expiresAt: string | undefined;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    if (typeof body.expiresAt !== "string" || !body.expiresAt.trim()) {
      return badRequest("expiresAt must be an ISO timestamp string");
    }
    const parsed = Date.parse(body.expiresAt);
    if (Number.isNaN(parsed)) {
      return badRequest("expiresAt must be a valid ISO timestamp");
    }
    expiresAt = new Date(parsed).toISOString();
  }

  const invite = await createInvite({
    workspaceId,
    kind,
    role,
    createdByUserId: userId,
    ...(email ? { email } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });

  if (kind === "link") {
    return {
      ok: true,
      status: 200,
      body: { invite, inviteUrl: inviteUrlForToken(invite.token) },
    };
  }
  return { ok: true, status: 200, body: { invite } };
}

export async function revokeWorkspaceInvite(
  userId: string | null,
  workspaceId: string,
  body: { inviteId?: unknown }
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

  const inviteId =
    typeof body.inviteId === "string" ? body.inviteId.trim() : "";
  if (!inviteId) {
    return badRequest("Missing inviteId");
  }

  const invites = await listInvites(workspaceId);
  if (!invites.some((i) => i.id === inviteId)) {
    return notFound("Invite not found");
  }

  await revokeInvite(workspaceId, inviteId);
  return { ok: true, status: 200, body: { ok: true } };
}

/**
 * Accept a link invite by token. Appends member.joined only on first membership.
 */
export async function acceptInviteByTokenApi(
  userId: string | null,
  token: string
): Promise<ApiResult<{ workspaceId: string }>> {
  if (!userId) return unauthorized();

  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) {
    return badRequest("Missing invite token");
  }

  const beforeIds = new Set(
    (await listWorkspacesForUser(userId)).map((w) => w.id)
  );

  try {
    const result = await acceptInviteByToken(trimmed, userId);
    if (!beforeIds.has(result.workspaceId)) {
      await appendActivity({
        workspaceId: result.workspaceId,
        type: "member.joined",
        actorUserId: userId,
        payload: { userId },
      });
    }
    return { ok: true, status: 200, body: { workspaceId: result.workspaceId } };
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Invite is no longer valid";
    return mapJoinError(message);
  }
}
