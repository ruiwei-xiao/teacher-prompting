/**
 * Sharing toggle (Task 3.4).
 * Session is resolved by the route wrapper; this accepts userId for testability.
 *
 * POST { shared: boolean } turns owner sharing on or off. A signed-in
 * participant gets enableSharing / disableSharing (flag flip). An anonymous
 * request on an anonymous session gets discardSession when turning off
 * (UUID knowledge = capability). Turning sharing back on after an anonymous
 * discard is a 404 here; the client treats that as local success and the next
 * recorded turn recreates the row. Missing session → 404. Signed-in session
 * when the caller is not that participant (including a signed-out caller) → 403.
 * A signed-in participant always flag-flips, never discard.
 */
import {
  disableSharing,
  discardSession,
  enableSharing,
  getSessionById,
} from "@/lib/chat-session-store/store";
import type { ChatSessionRecord } from "@/lib/chat-session-store/types";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: number; body: ApiError };

export type SharingBody = {
  ok: true;
};

export type GetSessionByIdFn = (
  id: string
) => Promise<ChatSessionRecord | null>;

export type DisableSharingFn = (id: string) => Promise<void>;

export type EnableSharingFn = (id: string) => Promise<void>;

export type DiscardSessionFn = (id: string) => Promise<void>;

function forbidden(): ApiResult<never> {
  return { ok: false, status: 403, body: { error: "Forbidden" } };
}

function notFound(): ApiResult<never> {
  return { ok: false, status: 404, body: { error: "Session not found" } };
}

function ok(): ApiResult<SharingBody> {
  return { ok: true, status: 200, body: { ok: true } };
}

export async function updateSharing(
  userId: string | null,
  sessionId: string,
  shared: boolean,
  deps: {
    getSessionById?: GetSessionByIdFn;
    disableSharing?: DisableSharingFn;
    enableSharing?: EnableSharingFn;
    discardSession?: DiscardSessionFn;
  } = {}
): Promise<ApiResult<SharingBody>> {
  const load = deps.getSessionById ?? getSessionById;
  const session = await load(sessionId);
  if (!session) return notFound();

  const isAnonymousSession = session.participantId === null;
  const isAnonymousCaller = userId === null;

  if (isAnonymousCaller && isAnonymousSession) {
    if (!shared) {
      const discard = deps.discardSession ?? discardSession;
      await discard(sessionId);
    }
    return ok();
  }

  if (userId !== null && session.participantId === userId) {
    if (shared) {
      const enable = deps.enableSharing ?? enableSharing;
      await enable(sessionId);
    } else {
      const disable = deps.disableSharing ?? disableSharing;
      await disable(sessionId);
    }
    return ok();
  }

  return forbidden();
}

/** @deprecated Use updateSharing. Off-only wrapper kept for existing call sites. */
export async function optOutSharing(
  userId: string | null,
  sessionId: string,
  deps: {
    getSessionById?: GetSessionByIdFn;
    disableSharing?: DisableSharingFn;
    discardSession?: DiscardSessionFn;
  } = {}
): Promise<ApiResult<SharingBody>> {
  return updateSharing(userId, sessionId, false, deps);
}
