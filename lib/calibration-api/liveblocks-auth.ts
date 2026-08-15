/**
 * Liveblocks session-token handler (Task 6.1).
 * Bridges the Auth.js session to a room-scoped access token:
 * members get write until lock, operators get read, everyone else is denied.
 *
 * Session is resolved by the route wrapper; this accepts userId + optional
 * identity for testability. The authorize function is injectable so selftests
 * never need LIVEBLOCKS_SECRET_KEY or a network call.
 */
import { resolveCaller } from "./access";
import type { ApiResult } from "./offerings";
import type { Team } from "@/lib/calibration-store/types";

const ROOM_PREFIX = "calibration:";

export type LiveblocksAccess = "write" | "read";

export type LiveblocksUserInfo = {
  name: string;
  color: string;
};

export type AuthorizeLiveblocksRequest = {
  userId: string;
  room: string;
  access: LiveblocksAccess;
  userInfo: LiveblocksUserInfo;
};

export type LiveblocksTokenBody = {
  token: string;
};

export type AuthorizeLiveblocksFn = (
  request: AuthorizeLiveblocksRequest
) => Promise<{ status: number; body: unknown }>;

export type SessionIdentity = {
  name?: string | null;
  color?: string | null;
};

export type IssueLiveblocksTokenDeps = {
  identity?: SessionIdentity;
  authorize?: AuthorizeLiveblocksFn;
};

function unauthorized(): ApiResult<never> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function forbidden(): ApiResult<never> {
  return { ok: false, status: 403, body: { error: "Forbidden" } };
}

function badRequest(message: string): ApiResult<never> {
  return { ok: false, status: 400, body: { error: message } };
}

function isTeamLocked(team: Team): boolean {
  return team.finalizedAt !== null || team.state.phase === "finalized";
}

/**
 * Only `calibration:{teamId}` is a valid room. Anything else is rejected
 * before ACL or token issuance.
 */
export function parseCalibrationRoom(room: unknown): string | null {
  if (typeof room !== "string") return null;
  const trimmed = room.trim();
  if (!trimmed.startsWith(ROOM_PREFIX)) return null;
  const teamId = trimmed.slice(ROOM_PREFIX.length);
  if (!teamId || teamId.includes("/") || teamId.includes(":")) return null;
  return teamId;
}

function colorFromUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `#${(hash & 0xffffff).toString(16).padStart(6, "0")}`;
}

function userInfoFromIdentity(
  userId: string,
  identity?: SessionIdentity
): LiveblocksUserInfo {
  const name = identity?.name?.trim() || userId;
  const color = identity?.color?.trim() || colorFromUserId(userId);
  return { name, color };
}

function readRoom(body: unknown): string | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid room" };
  }
  const room = (body as Record<string, unknown>).room;
  const teamId = parseCalibrationRoom(room);
  if (!teamId) {
    return { error: "Invalid room" };
  }
  return `${ROOM_PREFIX}${teamId}`;
}

function readToken(body: unknown): string | null {
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      return readToken(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const token = (body as Record<string, unknown>).token;
  return typeof token === "string" && token.trim() ? token : null;
}

async function defaultAuthorize(
  request: AuthorizeLiveblocksRequest
): Promise<{ status: number; body: unknown }> {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    return { status: 500, body: { error: "Liveblocks is not configured" } };
  }
  const { Liveblocks } = await import("@liveblocks/node");
  const liveblocks = new Liveblocks({ secret });
  const session = liveblocks.prepareSession(request.userId, {
    userInfo: request.userInfo,
  });
  session.allow(
    request.room,
    request.access === "write" ? session.FULL_ACCESS : session.READ_ACCESS
  );
  return session.authorize();
}

/**
 * Issue a room-scoped Liveblocks access token for the signed-in caller.
 * Write tokens stop at lock (Requirement 10.4). Operators always get read
 * (Requirement 14.5). Non-members are denied (Requirement 15.1).
 */
export async function issueLiveblocksToken(
  userId: string | null,
  body: unknown,
  deps?: IssueLiveblocksTokenDeps
): Promise<ApiResult<LiveblocksTokenBody>> {
  if (!userId) return unauthorized();

  const room = readRoom(body);
  if (typeof room !== "string") {
    return badRequest(room.error);
  }
  const teamId = parseCalibrationRoom(room);
  if (!teamId) {
    return badRequest("Invalid room");
  }

  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "denied" || caller.role === "not_found") {
    return forbidden();
  }

  const access: LiveblocksAccess =
    caller.role === "member" && caller.team && !isTeamLocked(caller.team)
      ? "write"
      : "read";

  const authorize = deps?.authorize ?? defaultAuthorize;
  const issued = await authorize({
    userId,
    room,
    access,
    userInfo: userInfoFromIdentity(userId, deps?.identity),
  });

  if (issued.status !== 200) {
    const errorBody =
      issued.body &&
      typeof issued.body === "object" &&
      !Array.isArray(issued.body) &&
      "error" in issued.body &&
      typeof (issued.body as { error: unknown }).error === "string"
        ? { error: (issued.body as { error: string }).error }
        : { error: "Liveblocks authorize failed" };
    return { ok: false, status: issued.status, body: errorBody };
  }

  const token = readToken(issued.body);
  if (!token) {
    return {
      ok: false,
      status: 500,
      body: { error: "Liveblocks authorize failed" },
    };
  }
  return { ok: true, status: 200, body: { token } };
}
