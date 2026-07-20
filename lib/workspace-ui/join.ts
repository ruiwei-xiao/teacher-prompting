/**
 * Client-safe invite join landing helpers (Task 6.8).
 * Link-token join via POST /api/workspaces/join/:token; signed-out return via callbackUrl.
 */
export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

/** User-facing copy when invite is revoked, expired, or otherwise invalid (Req 2.4). */
export const INVITE_NO_LONGER_VALID_MESSAGE = "Invite is no longer valid";

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

/** Page route for invite link join (singular workspace — not /workspaces/). */
export function inviteJoinHref(token: string): string {
  return `/workspace/invite/${token}`;
}

/** POST accept invite API (task 2.3). */
export function joinApiHref(token: string): string {
  return `/api/workspaces/join/${token}`;
}

/**
 * Sign-in return URL so a signed-out user lands back on the join page after auth
 * (matches proxy / project-page callbackUrl patterns; Req 8.3, 8.4).
 */
export function inviteJoinSignInHref(token: string): string {
  return `/?callbackUrl=${encodeURIComponent(inviteJoinHref(token))}`;
}

/** Parse POST /api/workspaces/join/:token JSON. */
export function parseJoinResponse(
  status: number,
  body: unknown
): ParseResult<{ workspaceId: string }> {
  if (status === 410 || status === 404) {
    const raw = errorFromBody(body, INVITE_NO_LONGER_VALID_MESSAGE);
    const lower = raw.toLowerCase();
    if (
      lower.includes("no longer valid") ||
      lower.includes("revoked") ||
      lower.includes("expired") ||
      lower.includes("not found")
    ) {
      return {
        ok: false,
        error: lower.includes("no longer valid")
          ? raw
          : INVITE_NO_LONGER_VALID_MESSAGE,
      };
    }
    return { ok: false, error: INVITE_NO_LONGER_VALID_MESSAGE };
  }

  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to join workspace"),
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid join response" };
  }

  const workspaceId = (body as { workspaceId?: unknown }).workspaceId;
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    return { ok: false, error: "Invalid join response" };
  }

  return { ok: true, workspaceId: workspaceId.trim() };
}
