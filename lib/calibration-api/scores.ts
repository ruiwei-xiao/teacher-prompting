/**
 * Score submission + reveal-safe serialization helpers, plus agreement and
 * addendum writes (Task 4.4). Reveal itself is an engine effect executed by
 * space.executeEffects (store.revealScores then applySpread).
 *
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { applyLearnerEvent } from "@/lib/calibration-engine/engine";
import {
  addAddendum,
  getTeamForMember,
  listAddenda,
  recordAgreement,
  submitScores,
} from "@/lib/calibration-store/store";
import type {
  AddendumRecord,
  AgreementSubject,
  CriterionScore,
} from "@/lib/calibration-store/types";
import {
  AGREEMENT_SUBJECTS,
  SCORE_MAX,
  SCORE_MIN,
} from "@/lib/calibration-store/types";
import { resolveCaller } from "./access";
import type { ApiResult } from "./offerings";
import {
  executeEffects,
  getSpace,
  type SpaceDeps,
  type SpaceState,
} from "./space";

export type SubmittedScores = {
  submitted: true;
};

function unauthorized<T = never>(): ApiResult<T> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function forbidden(): ApiResult<never> {
  return { ok: false, status: 403, body: { error: "Forbidden" } };
}

function notFound(message: string): ApiResult<never> {
  return { ok: false, status: 404, body: { error: message } };
}

function badRequest(message: string): ApiResult<never> {
  return { ok: false, status: 400, body: { error: message } };
}

function conflict(message: string): ApiResult<never> {
  return { ok: false, status: 409, body: { error: message } };
}

function clock(deps?: SpaceDeps): Date {
  return deps?.now ?? new Date();
}

export function rubricCriterionKeys(snapshotText: string): string[] {
  const keys: string[] = [];
  for (const raw of snapshotText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match =
      line.match(/^\d+\.\s*([A-Za-z][\w-]*)/) ??
      line.match(/^([A-Za-z][\w-]*)\s*[:—–-]/) ??
      line.match(/^([A-Za-z][\w-]*)/);
    const key = match?.[1]?.toLowerCase();
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

function readScores(body: unknown): CriterionScore[] | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid scores" };
  }
  const raw = (body as Record<string, unknown>).scores;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Missing scores" };
  }
  const scores: CriterionScore[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: "Invalid scores" };
    }
    const rec = entry as Record<string, unknown>;
    if (typeof rec.criterionKey !== "string" || rec.criterionKey.trim() === "") {
      return { error: "Missing criterionKey" };
    }
    if (typeof rec.value !== "number") {
      return {
        error: `Score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}.`,
      };
    }
    if (
      !Number.isInteger(rec.value) ||
      rec.value < SCORE_MIN ||
      rec.value > SCORE_MAX
    ) {
      return {
        error: `Score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}.`,
      };
    }
    scores.push({ criterionKey: rec.criterionKey.trim(), value: rec.value });
  }
  return scores;
}

function scoresMatchRubric(
  scores: CriterionScore[],
  rubricKeys: string[]
): boolean {
  if (rubricKeys.length === 0) return false;
  const submitted = new Set(scores.map((row) => row.criterionKey));
  if (submitted.size !== scores.length) return false;
  if (submitted.size !== rubricKeys.length) return false;
  return rubricKeys.every((key) => submitted.has(key));
}

function readAgreementSubject(
  body: unknown
): AgreementSubject | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid agreement" };
  }
  const subject = (body as Record<string, unknown>).subject;
  if (typeof subject !== "string") {
    return { error: "Missing subject" };
  }
  if (!(AGREEMENT_SUBJECTS as readonly string[]).includes(subject)) {
    return { error: "Invalid agreement subject" };
  }
  return subject as AgreementSubject;
}

function readAddendumBody(body: unknown): string | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid addendum" };
  }
  const value = (body as Record<string, unknown>).body;
  if (typeof value !== "string") {
    return { error: "Missing body" };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: "Missing body" };
  }
  return trimmed;
}

function expectedPhaseFor(subject: AgreementSubject): "merge" | "consensus" {
  return subject === "merge_complete" ? "merge" : "consensus";
}

export async function postScores(
  userId: string | null,
  teamId: string,
  body: unknown,
  deps?: SpaceDeps
): Promise<ApiResult<SubmittedScores>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role !== "member") {
    return forbidden();
  }

  const parsed = readScores(body);
  if (!Array.isArray(parsed)) {
    return badRequest(parsed.error);
  }

  const view = await getTeamForMember(teamId, userId);
  const rubricText =
    view?.docs.find((doc) => doc.docKind === "rubric")?.snapshotText ?? "";
  const rubricKeys = rubricCriterionKeys(rubricText);
  if (!scoresMatchRubric(parsed, rubricKeys)) {
    return badRequest("Scores must include an integer 1–5 for each rubric criterion");
  }

  if (caller.team.state.phase !== "scoring") {
    return conflict(`Scores are only accepted during scoring (current phase: ${caller.team.state.phase})`);
  }
  if (caller.team.scoresRevealedAt !== null) {
    return conflict("Scores cannot be changed after reveal.");
  }
  if (caller.team.state.respondedUserIds.includes(userId)) {
    return conflict("Scores already submitted");
  }

  const now = clock(deps);
  try {
    await submitScores(teamId, userId, parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("integer") || reason.includes("Score must")) {
      return badRequest(reason);
    }
    if (reason.includes("reveal") || reason.includes("locked")) {
      return conflict(reason);
    }
    throw error;
  }

  const applied = applyLearnerEvent(
    caller.team.state,
    { kind: "scoresSubmitted", userId },
    now
  );
  await executeEffects(teamId, applied.state, applied.effects, now, deps);
  return { ok: true, status: 200, body: { submitted: true } };
}

export async function postAgreement(
  userId: string | null,
  teamId: string,
  body: unknown,
  deps?: SpaceDeps
): Promise<ApiResult<SpaceState>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role !== "member") {
    return forbidden();
  }

  const subject = readAgreementSubject(body);
  if (typeof subject !== "string") {
    return badRequest(subject.error);
  }

  const expected = expectedPhaseFor(subject);
  if (caller.team.state.phase !== expected) {
    return conflict(
      `${subject} is only accepted during ${expected} (current phase: ${caller.team.state.phase})`
    );
  }

  const now = clock(deps);
  await recordAgreement(teamId, userId, subject);
  const applied = applyLearnerEvent(
    caller.team.state,
    { kind: "agreement", userId, subject },
    now
  );
  await executeEffects(teamId, applied.state, applied.effects, now, deps);
  return getSpace(userId, teamId, deps);
}

export async function postAddendum(
  userId: string | null,
  teamId: string,
  body: unknown,
  deps?: SpaceDeps
): Promise<ApiResult<AddendumRecord>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role !== "member") {
    return forbidden();
  }

  const parsed = readAddendumBody(body);
  if (typeof parsed !== "string") {
    return badRequest(parsed.error);
  }

  try {
    await addAddendum(teamId, userId, parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("locked") || reason.includes("addendum")) {
      return conflict("addendum is only allowed after the group artifact is locked");
    }
    throw error;
  }

  const addenda = await listAddenda(teamId);
  const created =
    addenda
      .filter((row) => row.userId === userId && row.body === parsed)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .at(-1) ?? null;
  if (!created) {
    return notFound("Addendum not found");
  }
  return { ok: true, status: 200, body: created };
}
