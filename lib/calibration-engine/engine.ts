/**
 * Pure calibration engine. Task 2.1: evaluateQueue. Task 2.2: kickoff + rotation.
 * No I/O. Imports types/constants from calibration-store/types — never store.ts.
 */
import type {
  CheckIn,
  EngineEffect,
  EngineResult,
  LearnerEvent,
  NoticeSpec,
  PerPersonDeadline,
  QueueEffect,
  TeamStateRecord,
} from "../calibration-store/types";
import {
  CRITIQUE_DEADLINE_MS,
  OPERATOR_STUCK_LISTING_MS,
  QUEUE_EXPIRY_MISSED_PINGS,
  QUEUE_PING_MS,
} from "../calibration-store/types";

const CRITIQUE_ROUND_COUNT = 3;

export type CritiqueRoles = {
  presenterUserId: string;
  criticUserIds: string[];
};

const QUEUE_STATUS_DEEP_LINK = (offeringId: string) =>
  `/activity/${offeringId}`;

function compareCheckIns(a: CheckIn, b: CheckIn): number {
  if (a.checkedInAt !== b.checkedInAt) {
    return a.checkedInAt < b.checkedInAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
}

function isQueued(checkIn: CheckIn): boolean {
  return checkIn.status === "queued";
}

function isExpiring(checkIn: CheckIn): boolean {
  return checkIn.missedPings >= QUEUE_EXPIRY_MISSED_PINGS;
}

function pingAnchorMs(checkIn: CheckIn): number {
  return Date.parse(checkIn.lastPingAt ?? checkIn.checkedInAt);
}

function isPingDue(checkIn: CheckIn, nowMs: number): boolean {
  return nowMs - pingAnchorMs(checkIn) >= QUEUE_PING_MS;
}

function isStuckWaiter(checkIn: CheckIn, nowMs: number): boolean {
  return nowMs - Date.parse(checkIn.checkedInAt) >= OPERATOR_STUCK_LISTING_MS;
}

function queueNotice(
  checkIn: CheckIn,
  kind: "queue_ping" | "queue_expired",
  pingIndex?: number
): QueueEffect {
  const dedupeKey =
    kind === "queue_ping"
      ? `${checkIn.offeringId}:${checkIn.userId}:queue_ping:${pingIndex}`
      : `${checkIn.offeringId}:${checkIn.userId}:queue_expired`;
  const notice: NoticeSpec = {
    kind,
    userId: checkIn.userId,
    dedupeKey,
    deepLink: QUEUE_STATUS_DEEP_LINK(checkIn.offeringId),
    offeringId: checkIn.offeringId,
  };
  return { kind: "sendNotice", notice };
}

function groupByOffering(checkIns: CheckIn[]): Map<string, CheckIn[]> {
  const groups = new Map<string, CheckIn[]>();
  for (const checkIn of checkIns) {
    const existing = groups.get(checkIn.offeringId);
    if (existing) {
      existing.push(checkIn);
    } else {
      groups.set(checkIn.offeringId, [checkIn]);
    }
  }
  return groups;
}

/**
 * Course-wide queue evaluation for an offering-scoped (or mixed) check-in set.
 * Forms teams of exactly 3, emits 6-day re-confirmation pings, expires after
 * 2 missed pings, and surfaces 10-day unmatched waiters. No solo/pair path.
 */
export function evaluateQueue(checkIns: CheckIn[], now: Date): QueueEffect[] {
  const nowMs = now.getTime();
  const queued = checkIns.filter(isQueued);
  const effects: QueueEffect[] = [];

  const expiring = queued.filter(isExpiring).sort(compareCheckIns);
  for (const checkIn of expiring) {
    effects.push({ kind: "expireCheckIn", checkInId: checkIn.id });
    effects.push(queueNotice(checkIn, "queue_expired"));
  }

  const active = queued.filter((checkIn) => !isExpiring(checkIn));
  const leftovers: CheckIn[] = [];
  const byOffering = groupByOffering(active);
  const offeringIds = [...byOffering.keys()].sort();

  for (const offeringId of offeringIds) {
    const members = (byOffering.get(offeringId) ?? []).sort(compareCheckIns);
    let index = 0;
    while (index + 3 <= members.length) {
      const trio = members.slice(index, index + 3);
      effects.push({
        kind: "formTeam",
        memberUserIds: [trio[0].userId, trio[1].userId, trio[2].userId],
      });
      index += 3;
    }
    leftovers.push(...members.slice(index));
  }

  leftovers.sort(compareCheckIns);
  for (const checkIn of leftovers) {
    if (isPingDue(checkIn, nowMs)) {
      effects.push(queueNotice(checkIn, "queue_ping", checkIn.missedPings + 1));
    }
    if (isStuckWaiter(checkIn, nowMs)) {
      effects.push({ kind: "listForOperator", checkInId: checkIn.id });
    }
  }

  return effects;
}

function critiqueStepKey(round: number): string {
  return `critique:${round}`;
}

function cloneState(state: TeamStateRecord): TeamStateRecord {
  return {
    phase: state.phase,
    round: state.round,
    presenterIndex: state.presenterIndex,
    perPersonDeadlines: state.perPersonDeadlines.map((deadline) => ({
      ...deadline,
    })),
    groupDeadline: state.groupDeadline,
    flaggedCriteria: [...state.flaggedCriteria],
    absenceStepKeys: state.absenceStepKeys.map((entry) => ({ ...entry })),
    agreementSets: {
      merge_complete: [...state.agreementSets.merge_complete],
      final_consensus: [...state.agreementSets.final_consensus],
    },
    memberUserIds: [
      state.memberUserIds[0],
      state.memberUserIds[1],
      state.memberUserIds[2],
    ],
    respondedUserIds: [...state.respondedUserIds],
    critiqueStage: state.critiqueStage,
  };
}

function rolesOf(state: TeamStateRecord): CritiqueRoles {
  const presenterUserId = state.memberUserIds[state.presenterIndex] ?? "";
  const criticUserIds = state.memberUserIds.filter(
    (_, index) => index !== state.presenterIndex
  );
  return { presenterUserId, criticUserIds };
}

function isAbsentForStep(
  state: TeamStateRecord,
  userId: string,
  stepKey: string
): boolean {
  return state.absenceStepKeys.some(
    (entry) => entry.userId === userId && entry.stepKey === stepKey
  );
}

function deadlinesFor(
  memberUserIds: [string, string, string],
  round: number,
  now: Date
): PerPersonDeadline[] {
  const deadlineAt = new Date(now.getTime() + CRITIQUE_DEADLINE_MS).toISOString();
  const stepKey = critiqueStepKey(round);
  return memberUserIds.map((userId) => ({ userId, stepKey, deadlineAt }));
}

function postFacilitator(
  source: "scripted" | "llm",
  key: string,
  context: Record<string, unknown>
): EngineEffect {
  return { kind: "postFacilitator", message: { source, key, context } };
}

function teamFormedNotice(
  userId: string,
  memberUserIds: [string, string, string]
): EngineEffect {
  return {
    kind: "sendNotice",
    notice: {
      kind: "team_formed",
      userId,
      dedupeKey: `${memberUserIds.join(",")}:${userId}:team_formed`,
      deepLink: "/activity",
    },
  };
}

function presentCritics(state: TeamStateRecord, stepKey: string): string[] {
  return rolesOf(state).criticUserIds.filter(
    (userId) => !isAbsentForStep(state, userId, stepKey)
  );
}

function roundSatisfied(state: TeamStateRecord): boolean {
  const stepKey = critiqueStepKey(state.round);
  const { presenterUserId } = rolesOf(state);
  const presenterDone =
    state.respondedUserIds.includes(presenterUserId) ||
    isAbsentForStep(state, presenterUserId, stepKey);
  if (!presenterDone || state.critiqueStage === "presenter_share") {
    return false;
  }
  return presentCritics(state, stepKey).every((userId) =>
    state.respondedUserIds.includes(userId)
  );
}

function completeAndRotate(state: TeamStateRecord, now: Date): EngineResult {
  const { presenterUserId } = rolesOf(state);
  const effects: EngineEffect[] = [
    postFacilitator("llm", "revoice", {
      round: state.round,
      presenterUserId,
      respondedUserIds: state.respondedUserIds,
    }),
  ];

  if (state.round >= CRITIQUE_ROUND_COUNT) {
    return {
      state: { ...cloneState(state), phase: "merge" },
      effects,
    };
  }

  const nextRound = state.round + 1;
  const nextIndex = state.presenterIndex + 1;
  const nextState: TeamStateRecord = {
    ...cloneState(state),
    round: nextRound,
    presenterIndex: nextIndex,
    perPersonDeadlines: deadlinesFor(state.memberUserIds, nextRound, now),
    respondedUserIds: [],
    critiqueStage: "presenter_share",
  };
  const nextRoles = rolesOf(nextState);
  effects.push(
    postFacilitator("scripted", "presenter_announcement", {
      presenterUserId: nextRoles.presenterUserId,
      criticUserIds: nextRoles.criticUserIds,
      round: nextRound,
    }),
    postFacilitator("scripted", "presenter_prompt", {
      presenterUserId: nextRoles.presenterUserId,
      round: nextRound,
    })
  );
  return { state: nextState, effects };
}

function prependEffects(result: EngineResult, prefix: EngineEffect[]): EngineResult {
  return { state: result.state, effects: [...prefix, ...result.effects] };
}

/**
 * Presenter / two Critics for the current critique round (Requirement 15.2).
 */
export function getCritiqueRoles(state: TeamStateRecord): CritiqueRoles {
  return rolesOf(state);
}

/**
 * Form a team and open critique round 1 immediately (no kickoff phase).
 * Recap + formation notices + presenter announcement/prompt; silent members
 * fall through to the round's 48h per-person clock (5.2, 5.3, 6.2).
 */
export function startTeam(
  memberUserIds: readonly string[],
  now: Date
): EngineResult {
  const unique = new Set(memberUserIds);
  if (memberUserIds.length !== 3 || unique.size !== 3) {
    throw new Error("startTeam requires exactly three distinct member user ids");
  }
  const members: [string, string, string] = [
    memberUserIds[0]!,
    memberUserIds[1]!,
    memberUserIds[2]!,
  ];
  const state: TeamStateRecord = {
    phase: "critique",
    round: 1,
    presenterIndex: 0,
    perPersonDeadlines: deadlinesFor(members, 1, now),
    groupDeadline: null,
    flaggedCriteria: [],
    absenceStepKeys: [],
    agreementSets: { merge_complete: [], final_consensus: [] },
    memberUserIds: members,
    respondedUserIds: [],
    critiqueStage: "presenter_share",
  };
  const roles = rolesOf(state);
  return {
    state,
    effects: [
      postFacilitator("scripted", "kickoff_recap", { memberUserIds: members }),
      ...members.map((userId) => teamFormedNotice(userId, members)),
      postFacilitator("scripted", "presenter_announcement", {
        presenterUserId: roles.presenterUserId,
        criticUserIds: roles.criticUserIds,
        round: 1,
      }),
      postFacilitator("scripted", "presenter_prompt", {
        presenterUserId: roles.presenterUserId,
        round: 1,
      }),
    ],
  };
}

/**
 * Mark a member absent for the current critique step only (6.5).
 * A skipped presenter does not replay; remaining present members finish the round.
 */
export function markAbsent(
  state: TeamStateRecord,
  userId: string,
  now: Date
): EngineResult {
  if (state.phase !== "critique") {
    return { state, effects: [] };
  }
  if (!state.memberUserIds.includes(userId)) {
    return { state, effects: [] };
  }
  const stepKey = critiqueStepKey(state.round);
  if (isAbsentForStep(state, userId, stepKey)) {
    return { state, effects: [] };
  }

  let next: TeamStateRecord = {
    ...cloneState(state),
    absenceStepKeys: [...state.absenceStepKeys, { userId, stepKey }],
  };
  const effects: EngineEffect[] = [{ kind: "markAbsent", userId, stepKey }];
  const { presenterUserId } = rolesOf(next);

  if (userId === presenterUserId && next.critiqueStage === "presenter_share") {
    next = { ...next, critiqueStage: "critic_response" };
    effects.push(
      postFacilitator("scripted", "critic_prompt", {
        criticUserIds: presentCritics(next, stepKey),
        presenterUserId,
        round: next.round,
      })
    );
  }

  if (roundSatisfied(next)) {
    return prependEffects(completeAndRotate(next, now), effects);
  }
  return { state: next, effects };
}

/**
 * Learner message events advance presenter-share then critic responses (6.3, 6.4).
 * Other event kinds are ignored here (later tasks own merge/scoring/discussion).
 */
export function applyLearnerEvent(
  state: TeamStateRecord,
  event: LearnerEvent,
  now: Date
): EngineResult {
  if (event.kind !== "message" || state.phase !== "critique") {
    return { state, effects: [] };
  }
  const stepKey = critiqueStepKey(state.round);
  const { presenterUserId, criticUserIds } = rolesOf(state);
  const { userId } = event;

  if (!state.memberUserIds.includes(userId)) {
    return { state, effects: [] };
  }
  if (isAbsentForStep(state, userId, stepKey)) {
    return { state, effects: [] };
  }
  if (state.respondedUserIds.includes(userId)) {
    return { state, effects: [] };
  }

  if (state.critiqueStage === "presenter_share") {
    if (userId !== presenterUserId) {
      return { state, effects: [] };
    }
    const next: TeamStateRecord = {
      ...cloneState(state),
      respondedUserIds: [...state.respondedUserIds, userId],
      critiqueStage: "critic_response",
    };
    const effects: EngineEffect[] = [
      postFacilitator("scripted", "critic_prompt", {
        criticUserIds: presentCritics(next, stepKey),
        presenterUserId,
        round: next.round,
      }),
    ];
    if (roundSatisfied(next)) {
      return prependEffects(completeAndRotate(next, now), effects);
    }
    return { state: next, effects };
  }

  if (!criticUserIds.includes(userId)) {
    return { state, effects: [] };
  }
  const next: TeamStateRecord = {
    ...cloneState(state),
    respondedUserIds: [...state.respondedUserIds, userId],
  };
  if (roundSatisfied(next)) {
    return completeAndRotate(next, now);
  }
  return { state: next, effects: [] };
}
