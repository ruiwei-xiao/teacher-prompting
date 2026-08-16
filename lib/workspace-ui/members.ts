/**
 * Client-safe Workspace members helpers: search, role changes, remove,
 * ownership transfer, and self-leave affordances.
 */
import { userDisplayLabel } from "@/lib/auth/user-label";
import type {
  WorkspaceMembership,
  WorkspaceRole,
} from "@/lib/workspace-store/types";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type AssignableMemberRole = "facilitator" | "participant";

/** Membership row enriched for display (from GET members). */
export type WorkspaceMemberListItem = WorkspaceMembership & {
  email?: string | null;
  name?: string | null;
};

/** Prefer name, then email; fall back to user id when unresolved. */
export function memberDisplayLabel(
  member: Pick<WorkspaceMemberListItem, "userId" | "email" | "name">
): string {
  return userDisplayLabel(member);
}

function isFacilitationRole(role: WorkspaceRole): boolean {
  return role === "owner" || role === "facilitator";
}

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

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === "owner" || value === "facilitator" || value === "participant";
}

function isMembership(value: unknown): value is WorkspaceMembership {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.workspaceId === "string" &&
    typeof m.userId === "string" &&
    isWorkspaceRole(m.role) &&
    typeof m.joinedAt === "string"
  );
}

function isMemberListItem(value: unknown): value is WorkspaceMemberListItem {
  if (!isMembership(value)) return false;
  const email = (value as { email?: unknown }).email;
  const name = (value as { name?: unknown }).name;
  const emailOk =
    email === undefined || email === null || typeof email === "string";
  const nameOk = name === undefined || name === null || typeof name === "string";
  return emailOk && nameOk;
}

/** Owners and Facilitators may manage members (except Owner constraints). */
export function canManageMembers(role: WorkspaceRole): boolean {
  return isFacilitationRole(role);
}

/**
 * Whether actor may change target's role via PATCH `{ userId, role }`.
 * Owner role is never changed this way (use transfer). Facilitators cannot
 * change the Owner.
 */
export function canChangeMemberRole(input: {
  actorRole: WorkspaceRole;
  targetRole: WorkspaceRole;
  isSelf: boolean;
}): boolean {
  if (input.isSelf) return false;
  if (!canManageMembers(input.actorRole)) return false;
  if (input.targetRole === "owner") return false;
  return true;
}

/**
 * Whether actor may remove another member (not self-leave).
 * Facilitators cannot remove the Owner.
 */
export function canRemoveMember(input: {
  actorRole: WorkspaceRole;
  targetRole: WorkspaceRole;
  isSelf: boolean;
}): boolean {
  if (input.isSelf) return false;
  if (!canManageMembers(input.actorRole)) return false;
  if (input.targetRole === "owner") return false;
  return true;
}

/** Only the current Owner may transfer ownership. */
export function canTransferOwnership(role: WorkspaceRole): boolean {
  return role === "owner";
}

/** Non-owners may leave; Owner must transfer first (API returns 422). */
export function canSelfLeave(role: WorkspaceRole): boolean {
  return role !== "owner";
}

/**
 * Client-side search over a members payload (Req 9.3).
 * Matches email or userId substring.
 */
export function filterMembersByQuery(
  members: WorkspaceMemberListItem[],
  query: string
): WorkspaceMemberListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return members.slice();
  return members.filter((m) => {
    if (m.userId.toLowerCase().includes(q)) return true;
    if (m.email?.toLowerCase().includes(q)) return true;
    if (m.name?.toLowerCase().includes(q)) return true;
    return false;
  });
}

export function membersApiHref(workspaceId: string, query?: string): string {
  const base = `/api/workspaces/${workspaceId}/members`;
  const q = query?.trim();
  if (!q) return base;
  return `${base}?q=${encodeURIComponent(q)}`;
}

export function buildChangeRoleBody(
  userId: string,
  role: AssignableMemberRole
): { userId: string; role: AssignableMemberRole } {
  return { userId, role };
}

export function buildTransferOwnershipBody(
  transferToUserId: string,
  demoteTo: AssignableMemberRole
): {
  transferToUserId: string;
  demoteTo: AssignableMemberRole;
} {
  return { transferToUserId, demoteTo };
}

export function buildRemoveMemberBody(userId: string): { userId: string } {
  return { userId };
}

/** Parse GET /api/workspaces/:id/members JSON. */
export function parseMembersListResponse(
  status: number,
  body: unknown
): ParseResult<{ members: WorkspaceMemberListItem[] }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load members"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid members response" };
  }
  const members = (body as { members?: unknown }).members;
  if (!Array.isArray(members) || !members.every(isMemberListItem)) {
    return { ok: false, error: "Invalid members response" };
  }
  return { ok: true, members };
}

/** Parse PATCH/DELETE /api/workspaces/:id/members JSON. */
export function parseMembersMutationResponse(
  status: number,
  body: unknown
): ParseResult<{ success: true }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to update members"),
    };
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body as { ok?: unknown }).ok !== true
  ) {
    return { ok: false, error: "Invalid members mutation response" };
  }
  return { ok: true, success: true };
}
