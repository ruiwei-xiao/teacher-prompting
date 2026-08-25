/**
 * Single-session transcript (Task 3.3).
 * Session is resolved by the route wrapper; this accepts userId for testability.
 *
 * GET returns the full ChatSessionRecord when the caller is the participant
 * (always) or the bot owner of a still-shared session. Unauthenticated → 401;
 * missing session → 404; signed-in but not allowed (including owner of an
 * unshared session) → 403. Owner access re-checks `shared` so an unshared
 * session stays forbidden even with a known ID.
 */
import { getSessionById } from "@/lib/chat-session-store/store";
import type { ChatSessionRecord } from "@/lib/chat-session-store/types";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: number; body: ApiError };

export type TranscriptBody = {
  session: ChatSessionRecord;
};

export type GetSessionByIdFn = (
  id: string
) => Promise<ChatSessionRecord | null>;

function unauthorized(): ApiResult<never> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function forbidden(): ApiResult<never> {
  return { ok: false, status: 403, body: { error: "Forbidden" } };
}

function notFound(): ApiResult<never> {
  return { ok: false, status: 404, body: { error: "Session not found" } };
}

function canReadTranscript(
  userId: string,
  session: ChatSessionRecord
): boolean {
  if (session.participantId === userId) return true;
  return session.ownerId === userId && session.shared === true;
}

export async function getSessionTranscript(
  userId: string | null,
  sessionId: string,
  deps: {
    getSessionById?: GetSessionByIdFn;
  } = {}
): Promise<ApiResult<TranscriptBody>> {
  if (!userId) return unauthorized();

  const load = deps.getSessionById ?? getSessionById;
  const session = await load(sessionId);
  if (!session) return notFound();

  if (!canReadTranscript(userId, session)) return forbidden();

  return {
    ok: true,
    status: 200,
    body: { session },
  };
}
