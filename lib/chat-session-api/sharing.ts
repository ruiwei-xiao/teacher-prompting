/**
 * Sharing opt-out (Task 3.4).
 * Session is resolved by the route wrapper; this accepts userId for testability.
 *
 * POST turns owner sharing off only (no re-enable payload). A signed-in
 * participant gets disableSharing (flag flip). An anonymous request on an
 * anonymous session gets discardSession (UUID knowledge = capability).
 * Missing session → 404. Signed-in session when the caller is not that
 * participant (including a signed-out caller) → 403. A signed-in participant
 * always disableSharing, never discard.
 */
import {
  disableSharing,
  discardSession,
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

export async function optOutSharing(
  userId: string | null,
  sessionId: string,
  deps: {
    getSessionById?: GetSessionByIdFn;
    disableSharing?: DisableSharingFn;
    discardSession?: DiscardSessionFn;
  } = {}
): Promise<ApiResult<SharingBody>> {
  const load = deps.getSessionById ?? getSessionById;
  const session = await load(sessionId);
  if (!session) return notFound();

  const isAnonymousSession = session.participantId === null;
  const isAnonymousCaller = userId === null;

  if (isAnonymousCaller && isAnonymousSession) {
    const discard = deps.discardSession ?? discardSession;
    await discard(sessionId);
    return ok();
  }

  if (userId !== null && session.participantId === userId) {
    const disable = deps.disableSharing ?? disableSharing;
    await disable(sessionId);
    return ok();
  }

  return forbidden();
}
