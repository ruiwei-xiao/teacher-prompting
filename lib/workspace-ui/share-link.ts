/**
 * Client-safe parsers for the reusable Workspace share-link control:
 * one current URL per join role, copy of the shown URL, and reset.
 */
import type {
  WorkspaceInvite,
  WorkspaceInviteRole,
} from "@/lib/workspace-store/types";
import { inviteUrlForToken, type ParseResult } from "./invites";

export const SHARE_LINK_ROLES = ["facilitator", "participant"] as const;

export type ShareLinkRole = (typeof SHARE_LINK_ROLES)[number];

export type ShareLinkByRole = {
  facilitator: WorkspaceInvite;
  participant: WorkspaceInvite;
};

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

export function isShareLinkRole(value: unknown): value is WorkspaceInviteRole {
  return value === "facilitator" || value === "participant";
}

function isInvite(value: unknown): value is WorkspaceInvite {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const i = value as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    typeof i.workspaceId === "string" &&
    (i.kind === "email" || i.kind === "link") &&
    isShareLinkRole(i.role) &&
    typeof i.token === "string" &&
    typeof i.createdByUserId === "string" &&
    typeof i.createdAt === "string"
  );
}

function isActiveLinkInvite(value: unknown): value is WorkspaceInvite {
  return isInvite(value) && value.kind === "link";
}

function isPendingEmailInvite(value: unknown): value is WorkspaceInvite {
  return isInvite(value) && value.kind === "email";
}

/** Parse GET /api/workspaces/:id/invites JSON ({ linkByRole, pendingEmails }). */
export function parseShareLinkListResponse(
  status: number,
  body: unknown
): ParseResult<{
  linkByRole: ShareLinkByRole;
  pendingEmails: WorkspaceInvite[];
}> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load invitation links"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid share-link response" };
  }
  const record = body as {
    linkByRole?: unknown;
    pendingEmails?: unknown;
  };
  const linkByRole = record.linkByRole;
  if (!linkByRole || typeof linkByRole !== "object" || Array.isArray(linkByRole)) {
    return { ok: false, error: "Invalid share-link response" };
  }
  const roles = linkByRole as Record<string, unknown>;
  if (
    !isActiveLinkInvite(roles.facilitator) ||
    roles.facilitator.role !== "facilitator" ||
    !isActiveLinkInvite(roles.participant) ||
    roles.participant.role !== "participant"
  ) {
    return { ok: false, error: "Invalid share-link response" };
  }
  const pendingEmails = record.pendingEmails;
  if (
    !Array.isArray(pendingEmails) ||
    !pendingEmails.every(isPendingEmailInvite)
  ) {
    return { ok: false, error: "Invalid share-link response" };
  }
  return {
    ok: true,
    linkByRole: {
      facilitator: roles.facilitator,
      participant: roles.participant,
    },
    pendingEmails,
  };
}

/** Path or absolute URL currently shown for the selected join role. */
export function shareLinkUrlForRole(
  linkByRole: ShareLinkByRole,
  role: WorkspaceInviteRole,
  origin?: string | null
): string {
  return toShareLinkClipboardText(
    inviteUrlForToken(linkByRole[role].token),
    origin
  );
}

/** Copy target: the shown URL, made absolute when an origin (window) is available. */
export function toShareLinkClipboardText(
  shownUrl: string,
  origin?: string | null
): string {
  if (!origin) return shownUrl;
  try {
    return new URL(shownUrl, origin).toString();
  } catch {
    return shownUrl;
  }
}

export function buildResetShareLinkBody(
  role: WorkspaceInviteRole
): { kind: "resetLink"; role: WorkspaceInviteRole } {
  return { kind: "resetLink", role };
}

/** Parse POST /api/workspaces/:id/invites { kind: "resetLink" } JSON. */
export function parseResetShareLinkResponse(
  status: number,
  body: unknown
): ParseResult<{ invite: WorkspaceInvite }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to reset invitation link"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid reset invitation link response" };
  }
  const invite = (body as { invite?: unknown }).invite;
  if (!isActiveLinkInvite(invite)) {
    return { ok: false, error: "Invalid reset invitation link response" };
  }
  return { ok: true, invite };
}

/** Replace the shown URL for the reset role; leave the other role unchanged. */
export function replaceShownShareLink(
  linkByRole: ShareLinkByRole,
  invite: WorkspaceInvite
): ShareLinkByRole {
  if (invite.role === "facilitator") {
    return { ...linkByRole, facilitator: invite };
  }
  return { ...linkByRole, participant: invite };
}
