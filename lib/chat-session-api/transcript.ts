/**
 * Single-session transcript (Task 3.3).
 * Session is resolved by the route wrapper; this accepts userId for testability.
 *
 * GET returns the full ChatSessionRecord when the caller is the participant
 * (always) or the bot owner of a still-shared session. The body also includes
 * configVersionCreatedAt for the starting version when that row still exists.
 * Unauthenticated → 401;
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
  configVersionCreatedAt: string | null;
};

export type GetSessionByIdFn = (
  id: string
) => Promise<ChatSessionRecord | null>;

export type GetConfigVersionCreatedAtFn = (
  appId: string,
  versionId: string
) => Promise<string | null>;

function startingVersionId(session: ChatSessionRecord): string | null {
  const value = session.configVersionId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createdAtOrNull(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function loadConfigVersionCreatedAt(
  appId: string,
  versionId: string
): Promise<string | null> {
  const { findConfigVersionCreatedAt } = await import(
    "@/lib/app-config-versions/store"
  );
  return findConfigVersionCreatedAt(appId, versionId);
}

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
    getConfigVersionCreatedAt?: GetConfigVersionCreatedAtFn;
  } = {}
): Promise<ApiResult<TranscriptBody>> {
  if (!userId) return unauthorized();

  const load = deps.getSessionById ?? getSessionById;
  const session = await load(sessionId);
  if (!session) return notFound();

  if (!canReadTranscript(userId, session)) return forbidden();

  const versionId = startingVersionId(session);
  let configVersionCreatedAt: string | null = null;
  if (versionId) {
    const lookup = deps.getConfigVersionCreatedAt ?? loadConfigVersionCreatedAt;
    configVersionCreatedAt = createdAtOrNull(
      await lookup(session.appId, versionId)
    );
  }

  return {
    ok: true,
    status: 200,
    body: { session, configVersionCreatedAt },
  };
}
