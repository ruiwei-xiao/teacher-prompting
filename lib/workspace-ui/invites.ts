/**
 * Client-safe Workspace invite helpers: email pending invites and
 * revoke affordances (no SMTP delivery). Share-link parsers live in
 * `share-link.ts`.
 */
import type {
  WorkspaceInvite,
  WorkspaceInviteRole,
  WorkspaceRole,
} from "@/lib/workspace-store/types";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type InviteRole = WorkspaceInviteRole;

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

function isInviteRole(value: unknown): value is WorkspaceInviteRole {
  return value === "facilitator" || value === "participant";
}

function isInvite(value: unknown): value is WorkspaceInvite {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const i = value as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    typeof i.workspaceId === "string" &&
    (i.kind === "email" || i.kind === "link") &&
    isInviteRole(i.role) &&
    typeof i.token === "string" &&
    typeof i.createdByUserId === "string" &&
    typeof i.createdAt === "string"
  );
}

/** Owners and Facilitators may create and revoke invites. */
export function canManageInvites(role: WorkspaceRole): boolean {
  return role === "owner" || role === "facilitator";
}

/** Success copy after recording an email invite (design UI Layer). */
export function emailInviteRecordedMessage(email: string): string {
  return `Invite recorded for ${email}. They join automatically when they next open Workspaces (or sign in) with that address.`;
}

/** Matches WorkspacesAPI `inviteUrlForToken`. */
export function inviteUrlForToken(token: string): string {
  return `/workspace/invite/${token}`;
}

export function invitesApiHref(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/invites`;
}

export function buildCreateEmailInviteBody(
  email: string,
  role: InviteRole
): { kind: "email"; email: string; role: InviteRole } | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  return { kind: "email", email: trimmed, role };
}

export function buildRevokeInviteBody(inviteId: string): { inviteId: string } {
  return { inviteId };
}

/** Parse POST /api/workspaces/:id/invites JSON (email invite). */
export function parseCreateInviteResponse(
  status: number,
  body: unknown
): ParseResult<{ invite: WorkspaceInvite; inviteUrl?: string }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to create invite"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid create invite response" };
  }
  const invite = (body as { invite?: unknown }).invite;
  if (!isInvite(invite)) {
    return { ok: false, error: "Invalid create invite response" };
  }
  const inviteUrlRaw = (body as { inviteUrl?: unknown }).inviteUrl;
  const inviteUrl =
    typeof inviteUrlRaw === "string" && inviteUrlRaw.trim()
      ? inviteUrlRaw.trim()
      : undefined;
  return { ok: true, invite, ...(inviteUrl ? { inviteUrl } : {}) };
}

/** Parse DELETE /api/workspaces/:id/invites JSON. */
export function parseRevokeInviteResponse(
  status: number,
  body: unknown
): ParseResult<{ success: true }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to revoke invite"),
    };
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body as { ok?: unknown }).ok !== true
  ) {
    return { ok: false, error: "Invalid revoke invite response" };
  }
  return { ok: true, success: true };
}
