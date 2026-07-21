/**
 * Stars API orchestration (Task 2).
 * Session is resolved by route wrappers; these accept userId for testability.
 *
 * GET filters to currently eligible stars (summaries + open targets), ordered
 * by starredAt desc from the store. PUT gates on assertCanStar; DELETE is
 * idempotent via star-store.
 */
import {
  assertCanStar,
  resolveEligibleStar,
  type EligibleStar,
} from "@/lib/star-api/eligibility";
import {
  listStarsForUser,
  starApp,
  unstarApp,
} from "@/lib/star-store/store";

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

function notFound(message = "Bot not found"): ApiResult<never> {
  return { ok: false, status: 404, body: { error: message } };
}

export async function listStars(
  userId: string | null
): Promise<ApiResult<{ stars: EligibleStar[] }>> {
  if (!userId) return unauthorized();

  const records = await listStarsForUser(userId);
  const stars: EligibleStar[] = [];
  for (const record of records) {
    const eligible = await resolveEligibleStar(
      userId,
      record.appId,
      record.starredAt
    );
    if (eligible) {
      stars.push(eligible);
    }
  }

  return { ok: true, status: 200, body: { stars } };
}

export async function starBot(
  userId: string | null,
  appId: string
): Promise<ApiResult<{ starred: true; starredAt: string }>> {
  if (!userId) return unauthorized();

  const canStar = await assertCanStar(userId, appId);
  if (!canStar.ok) {
    if (canStar.reason === "not_found") {
      return notFound();
    }
    return forbidden();
  }

  const record = await starApp(userId, appId);
  return {
    ok: true,
    status: 200,
    body: { starred: true, starredAt: record.starredAt },
  };
}

export async function unstarBot(
  userId: string | null,
  appId: string
): Promise<ApiResult<{ starred: false }>> {
  if (!userId) return unauthorized();

  await unstarApp(userId, appId);
  return { ok: true, status: 200, body: { starred: false } };
}
