/**
 * Pure calibration engine. Task 2.1: evaluateQueue. Task 2.2: kickoff + rotation.
 * Task 2.3: dual clocks, absence, rejoin. Task 2.4: merge, scoring, spread.
 * Task 2.5: discussion, consensus, lock.
 * No I/O. Imports types/constants from calibration-store/types — never store.ts.
 */
import type {
  AgreementSubject,
  CheckIn,
  CriterionSpread,
  EngineEffect,
  EngineResult,
  LearnerEvent,
  NoticeSpec,
  PerPersonDeadline,
  QueueEffect,
  RevealedScores,
  TeamPhase,
  TeamStateRecord,
} from "../calibration-store/types";
import {
  CRITIQUE_DEADLINE_MS,
  DISCUSSION_DEADLINE_MS,
  GROUP_SILENCE_MS,
  MERGE_NUDGE_MS,
  OPERATOR_STUCK_LISTING_MS,
  QUEUE_EXPIRY_MISSED_PINGS,
  QUEUE_PING_MS,
  SCORING_DEADLINE_MS,
} from "../calibration-store/types";

const MERGE_STEP_KEY = "merge";
const SCORING_STEP_KEY = "scoring";
const CONSENSUS_STEP_KEY = "consensus";
const SPREAD_FLAG_THRESHOLD = 2;

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

function discussionStepKey(criterionKey: string): string {
  return `discussion:${criterionKey}`;
}

function isDiscussionStepKey(stepKey: string): boolean {
  return stepKey === "discussion" || stepKey.startsWith("discussion:");
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

function currentStepKey(state: TeamStateRecord): string {
  return state.phase === "critique" ? critiqueStepKey(state.round) : state.phase;
}

function presentUserIds(state: TeamStateRecord, stepKey: string): string[] {
  return state.memberUserIds.filter(
    (userId) => !isAbsentForStep(state, userId, stepKey)
  );
}

function deadlineMsForPhase(phase: TeamPhase): number | null {
  if (phase === "critique") {
    return CRITIQUE_DEADLINE_MS;
  }
  if (phase === "merge") {
    return MERGE_NUDGE_MS;
  }
  if (phase === "scoring") {
    return SCORING_DEADLINE_MS;
  }
  if (phase === "discussion") {
    return DISCUSSION_DEADLINE_MS;
  }
  return null;
}

function deadlinesForStep(
  userIds: readonly string[],
  stepKey: string,
  durationMs: number,
  now: Date
): PerPersonDeadline[] {
  const deadlineAt = new Date(now.getTime() + durationMs).toISOString();
  return userIds.map((userId) => ({ userId, stepKey, deadlineAt }));
}

/** Members the current critique step is waiting on (4.2, 6.6). */
function waitingUserIds(state: TeamStateRecord): string[] {
  if (state.phase !== "critique") {
    return [];
  }
  const stepKey = critiqueStepKey(state.round);
  const { presenterUserId } = rolesOf(state);
  if (state.critiqueStage === "presenter_share") {
    if (
      isAbsentForStep(state, presenterUserId, stepKey) ||
      state.respondedUserIds.includes(presenterUserId)
    ) {
      return [];
    }
    return [presenterUserId];
  }
  return presentCritics(state, stepKey).filter(
    (userId) => !state.respondedUserIds.includes(userId)
  );
}

function resetPerPersonDeadlines(
  deadlines: PerPersonDeadline[],
  userIds: string[],
  stepKey: string,
  now: Date,
  durationMs: number = CRITIQUE_DEADLINE_MS
): PerPersonDeadline[] {
  const deadlineAt = new Date(now.getTime() + durationMs).toISOString();
  const updated = deadlines.map((deadline) =>
    userIds.includes(deadline.userId) && deadline.stepKey === stepKey
      ? { ...deadline, deadlineAt }
      : deadline
  );
  const missing = userIds.filter(
    (userId) =>
      !updated.some(
        (deadline) => deadline.userId === userId && deadline.stepKey === stepKey
      )
  );
  return [
    ...updated,
    ...missing.map((userId) => ({ userId, stepKey, deadlineAt })),
  ];
}

/**
 * Reset the group clock (if set) and only the actor's current-step clock (4.1, 4.3).
 * Never writes the two clocks into one field.
 */
function resetActorAndGroupClocks(
  state: TeamStateRecord,
  userId: string,
  now: Date
): TeamStateRecord {
  const next = cloneState(state);
  if (state.phase === "discussion") {
    const actorSteps = next.perPersonDeadlines
      .filter((deadline) => deadline.userId === userId && isDiscussionStepKey(deadline.stepKey))
      .map((deadline) => deadline.stepKey);
    let deadlines = next.perPersonDeadlines;
    for (const stepKey of actorSteps) {
      deadlines = resetPerPersonDeadlines(
        deadlines,
        [userId],
        stepKey,
        now,
        DISCUSSION_DEADLINE_MS
      );
    }
    next.perPersonDeadlines = deadlines;
  } else {
    const durationMs = deadlineMsForPhase(state.phase);
    if (durationMs !== null) {
      next.perPersonDeadlines = resetPerPersonDeadlines(
        next.perPersonDeadlines,
        [userId],
        currentStepKey(state),
        now,
        durationMs
      );
    }
  }
  if (next.groupDeadline !== null) {
    next.groupDeadline = new Date(now.getTime() + GROUP_SILENCE_MS).toISOString();
  }
  return next;
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
    return enterMerge(state, now, effects);
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
  if (state.phase === "scoring") {
    return markAbsentForScoring(state, userId);
  }
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
    const remainingCritics = presentCritics(next, stepKey);
    next = {
      ...next,
      critiqueStage: "critic_response",
      // 4.2: a new individual wait begins for the remaining critics.
      perPersonDeadlines: resetPerPersonDeadlines(
        next.perPersonDeadlines,
        remainingCritics,
        stepKey,
        now
      ),
    };
    effects.push(
      postFacilitator("scripted", "critic_prompt", {
        criticUserIds: remainingCritics,
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

function applyCritiqueMessage(
  state: TeamStateRecord,
  userId: string,
  now: Date
): EngineResult {
  if (state.phase !== "critique") {
    return { state, effects: [] };
  }
  const stepKey = critiqueStepKey(state.round);
  const { presenterUserId, criticUserIds } = rolesOf(state);

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
    let next: TeamStateRecord = {
      ...cloneState(state),
      respondedUserIds: [...state.respondedUserIds, userId],
      critiqueStage: "critic_response",
    };
    const remainingCritics = presentCritics(next, stepKey);
    next = {
      ...next,
      // 4.2: a new individual wait begins for the remaining critics.
      perPersonDeadlines: resetPerPersonDeadlines(
        next.perPersonDeadlines,
        remainingCritics,
        stepKey,
        now
      ),
    };
    const effects: EngineEffect[] = [
      postFacilitator("scripted", "critic_prompt", {
        criticUserIds: remainingCritics,
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

function isReturnableAbsence(state: TeamStateRecord, stepKey: string): boolean {
  if (stepKey === currentStepKey(state)) {
    return true;
  }
  return state.phase === "discussion" && isDiscussionStepKey(stepKey);
}

function applyMemberReturned(
  state: TeamStateRecord,
  userId: string,
  now: Date
): EngineResult {
  const matching = state.absenceStepKeys.filter(
    (entry) => entry.userId === userId && isReturnableAbsence(state, entry.stepKey)
  );
  if (matching.length === 0) {
    return { state, effects: [] };
  }

  const next = cloneState(state);
  const cleared = new Set(matching.map((entry) => entry.stepKey));
  next.absenceStepKeys = next.absenceStepKeys.filter(
    (entry) => !(entry.userId === userId && cleared.has(entry.stepKey))
  );
  const durationMs = deadlineMsForPhase(state.phase);
  if (durationMs !== null) {
    let deadlines = next.perPersonDeadlines;
    for (const stepKey of cleared) {
      deadlines = resetPerPersonDeadlines(
        deadlines,
        [userId],
        stepKey,
        now,
        durationMs
      );
    }
    next.perPersonDeadlines = deadlines;
  }
  return { state: next, effects: [] };
}

/**
 * Clock-driven evaluation. Expired per-person clocks mark absence for the
 * current step only and continue with remaining members (4.4, 6.6).
 * Discussion 7d marks the named scorer absent for that exchange (9.5);
 * 14d group silence locks discussion or consensus (9.6, 10.3).
 * Does not refresh co-waiters' clocks. Idempotent at the same `now`.
 */
export function evaluateTeam(state: TeamStateRecord, now: Date): EngineResult {
  if (state.phase === "finalized") {
    return { state, effects: [] };
  }
  if (state.phase === "merge") {
    return evaluateMerge(state, now);
  }
  if (state.phase === "scoring") {
    return evaluateScoring(state, now);
  }
  if (state.phase === "discussion") {
    return evaluateDiscussion(state, now);
  }
  if (state.phase === "consensus") {
    return evaluateConsensus(state, now);
  }
  if (state.phase !== "critique") {
    return { state, effects: [] };
  }
  const nowMs = now.getTime();
  const stepKey = critiqueStepKey(state.round);
  const expiredUserIds = waitingUserIds(state).filter((userId) => {
    const deadline = state.perPersonDeadlines.find(
      (entry) => entry.userId === userId && entry.stepKey === stepKey
    );
    return deadline !== undefined && Date.parse(deadline.deadlineAt) <= nowMs;
  });

  let current = state;
  const effects: EngineEffect[] = [];
  const startedRound = state.round;
  for (const userId of expiredUserIds) {
    if (current.phase !== "critique" || current.round !== startedRound) {
      break;
    }
    const result = markAbsent(current, userId, now);
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
}

/**
 * Learner message events advance presenter-share then critic responses (6.3, 6.4).
 * message / docSnapshot reset the group clock (if set) and only the actor's
 * current-step per-person clock (4.3). Merge contributions count toward the
 * 3-day nudge. agreement merge_complete from all present opens scoring (8.1).
 * scoresSubmitted acks without values and reveals when every present member
 * has submitted (8.3, 8.4). Discussion messages revoice/follow up and open
 * consensus when flagged exchanges are answered (10.1). final_consensus from
 * all present locks (10.2). memberReturned joins the current phase/round
 * without replaying completed work (4.6, 6.7, 10.5). After finalized, events
 * produce no new effects (11.5).
 */
export function applyLearnerEvent(
  state: TeamStateRecord,
  event: LearnerEvent,
  now: Date
): EngineResult {
  if (!state.memberUserIds.includes(event.userId)) {
    return { state, effects: [] };
  }

  if (state.phase === "finalized") {
    return { state, effects: [] };
  }

  if (event.kind === "memberReturned") {
    return applyMemberReturned(state, event.userId, now);
  }

  if (event.kind === "agreement") {
    return applyAgreement(state, event.userId, event.subject, now);
  }

  if (event.kind === "scoresSubmitted") {
    return applyScoresSubmitted(state, event.userId);
  }

  if (event.kind === "message" || event.kind === "docSnapshot") {
    const withClocks = resetActorAndGroupClocks(state, event.userId, now);
    if (state.phase === "merge") {
      return { state: recordContribution(withClocks, event.userId), effects: [] };
    }
    if (state.phase === "discussion") {
      if (event.kind === "docSnapshot") {
        return { state: withClocks, effects: [] };
      }
      return applyDiscussionMessage(withClocks, event.userId, now);
    }
    if (state.phase === "consensus") {
      return { state: withClocks, effects: [] };
    }
    if (event.kind === "docSnapshot") {
      return { state: withClocks, effects: [] };
    }
    return applyCritiqueMessage(withClocks, event.userId, now);
  }

  return { state, effects: [] };
}

function recordContribution(state: TeamStateRecord, userId: string): TeamStateRecord {
  if (state.respondedUserIds.includes(userId)) {
    return state;
  }
  const next = cloneState(state);
  next.respondedUserIds = [...next.respondedUserIds, userId];
  return next;
}

function enterMerge(
  state: TeamStateRecord,
  now: Date,
  prefix: EngineEffect[]
): EngineResult {
  const next: TeamStateRecord = {
    ...cloneState(state),
    phase: "merge",
    perPersonDeadlines: deadlinesForStep(
      state.memberUserIds,
      MERGE_STEP_KEY,
      MERGE_NUDGE_MS,
      now
    ),
    groupDeadline: new Date(now.getTime() + GROUP_SILENCE_MS).toISOString(),
    respondedUserIds: [],
  };
  return {
    state: next,
    effects: [
      ...prefix,
      postFacilitator("scripted", "open_rubric", {
        memberUserIds: state.memberUserIds,
      }),
    ],
  };
}

function enterScoring(
  state: TeamStateRecord,
  now: Date,
  prefix: EngineEffect[]
): EngineResult {
  const next: TeamStateRecord = {
    ...cloneState(state),
    phase: "scoring",
    perPersonDeadlines: deadlinesForStep(
      state.memberUserIds,
      SCORING_STEP_KEY,
      SCORING_DEADLINE_MS,
      now
    ),
    groupDeadline: null,
    respondedUserIds: [],
  };
  return {
    state: next,
    effects: [
      ...prefix,
      postFacilitator("scripted", "score_prompt", {
        memberUserIds: next.memberUserIds,
      }),
    ],
  };
}

function applyAgreement(
  state: TeamStateRecord,
  userId: string,
  subject: AgreementSubject,
  now: Date
): EngineResult {
  if (subject === "final_consensus") {
    return applyFinalConsensus(state, userId);
  }
  if (subject !== "merge_complete" || state.phase !== "merge") {
    return { state, effects: [] };
  }
  if (state.agreementSets.merge_complete.includes(userId)) {
    return { state, effects: [] };
  }
  const next = cloneState(state);
  next.agreementSets.merge_complete = [
    ...next.agreementSets.merge_complete,
    userId,
  ];
  const present = presentUserIds(next, MERGE_STEP_KEY);
  if (present.every((memberId) => next.agreementSets.merge_complete.includes(memberId))) {
    return enterScoring(next, now, []);
  }
  return { state: next, effects: [] };
}

function shouldReveal(state: TeamStateRecord): boolean {
  if (state.phase !== "scoring") {
    return false;
  }
  if (state.respondedUserIds.length < 1) {
    return false;
  }
  const present = presentUserIds(state, SCORING_STEP_KEY);
  return (
    present.length > 0 &&
    present.every((userId) => state.respondedUserIds.includes(userId))
  );
}

function applyScoresSubmitted(
  state: TeamStateRecord,
  userId: string
): EngineResult {
  if (state.phase !== "scoring") {
    return { state, effects: [] };
  }
  if (isAbsentForStep(state, userId, SCORING_STEP_KEY)) {
    return { state, effects: [] };
  }
  if (state.respondedUserIds.includes(userId)) {
    return { state, effects: [] };
  }
  const next = cloneState(state);
  next.respondedUserIds = [...next.respondedUserIds, userId];
  const effects: EngineEffect[] = [
    postFacilitator("scripted", "score_ack", { userId }),
  ];
  if (shouldReveal(next)) {
    effects.push({ kind: "revealScores" });
  }
  return { state: next, effects };
}

function markAbsentForScoring(
  state: TeamStateRecord,
  userId: string
): EngineResult {
  if (!state.memberUserIds.includes(userId)) {
    return { state, effects: [] };
  }
  if (isAbsentForStep(state, userId, SCORING_STEP_KEY)) {
    return { state, effects: [] };
  }
  const next = cloneState(state);
  next.absenceStepKeys = [
    ...next.absenceStepKeys,
    { userId, stepKey: SCORING_STEP_KEY },
  ];
  const effects: EngineEffect[] = [
    { kind: "markAbsent", userId, stepKey: SCORING_STEP_KEY },
  ];
  if (shouldReveal(next)) {
    effects.push({ kind: "revealScores" });
  }
  return { state: next, effects };
}

function mergeNudgeNotice(state: TeamStateRecord, userId: string): EngineEffect {
  return {
    kind: "sendNotice",
    notice: {
      kind: "nudge",
      userId,
      dedupeKey: `${state.memberUserIds.join(",")}:${userId}:nudge:merge`,
      deepLink: "/activity",
    },
  };
}

function evaluateMerge(state: TeamStateRecord, now: Date): EngineResult {
  const nowMs = now.getTime();
  if (
    state.groupDeadline !== null &&
    Date.parse(state.groupDeadline) <= nowMs
  ) {
    return enterScoring(state, now, [
      postFacilitator("scripted", "merge_auto_finalize", { incomplete: true }),
    ]);
  }

  const next = cloneState(state);
  const effects: EngineEffect[] = [];
  const kept: PerPersonDeadline[] = [];
  for (const deadline of next.perPersonDeadlines) {
    const nudgeDue =
      deadline.stepKey === MERGE_STEP_KEY &&
      Date.parse(deadline.deadlineAt) <= nowMs &&
      !next.respondedUserIds.includes(deadline.userId) &&
      !isAbsentForStep(next, deadline.userId, MERGE_STEP_KEY);
    if (nudgeDue) {
      effects.push(mergeNudgeNotice(next, deadline.userId));
    } else {
      kept.push(deadline);
    }
  }
  next.perPersonDeadlines = kept;
  return { state: next, effects };
}

function evaluateScoring(state: TeamStateRecord, now: Date): EngineResult {
  const nowMs = now.getTime();
  const waiting = presentUserIds(state, SCORING_STEP_KEY).filter(
    (userId) => !state.respondedUserIds.includes(userId)
  );
  const expiredUserIds = waiting.filter((userId) => {
    const deadline = state.perPersonDeadlines.find(
      (entry) => entry.userId === userId && entry.stepKey === SCORING_STEP_KEY
    );
    return deadline !== undefined && Date.parse(deadline.deadlineAt) <= nowMs;
  });

  let current = state;
  const effects: EngineEffect[] = [];
  for (const userId of expiredUserIds) {
    const result = markAbsent(current, userId, now);
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
}

function namedScorerForCriterion(
  revealed: RevealedScores,
  criterionKey: string,
  memberUserIds: readonly string[]
): string {
  let scorerUserId = memberUserIds[0] ?? "";
  let bestValue = Number.POSITIVE_INFINITY;
  for (const userId of memberUserIds) {
    const member = revealed.members.find((row) => row.userId === userId);
    const score = member?.scores.find((row) => row.criterionKey === criterionKey);
    if (score !== undefined && score.value < bestValue) {
      bestValue = score.value;
      scorerUserId = userId;
    }
  }
  return scorerUserId;
}

function presentInDiscussion(state: TeamStateRecord): string[] {
  return state.memberUserIds.filter(
    (userId) =>
      !state.absenceStepKeys.some(
        (entry) => entry.userId === userId && isDiscussionStepKey(entry.stepKey)
      )
  );
}

function allExchangesAnswered(state: TeamStateRecord): boolean {
  return (
    state.flaggedCriteria.length > 0 &&
    state.flaggedCriteria.every(
      (criterionKey) =>
        !state.perPersonDeadlines.some(
          (deadline) => deadline.stepKey === discussionStepKey(criterionKey)
        )
    )
  );
}

function discussionComplete(state: TeamStateRecord): boolean {
  if (allExchangesAnswered(state)) {
    return true;
  }
  const present = presentInDiscussion(state);
  return (
    present.length > 0 &&
    present.every((userId) => state.respondedUserIds.includes(userId))
  );
}

function unresolvedCriteria(state: TeamStateRecord): string[] {
  return state.flaggedCriteria.filter((criterionKey) =>
    state.perPersonDeadlines.some(
      (deadline) => deadline.stepKey === discussionStepKey(criterionKey)
    )
  );
}

function lockTeam(
  state: TeamStateRecord,
  auto: boolean,
  unresolved: string[]
): EngineResult {
  const next = cloneState(state);
  next.phase = "finalized";
  const effects: EngineEffect[] = [];
  if (auto) {
    effects.push(postFacilitator("llm", "auto_synthesize", { unresolved }));
  }
  effects.push({ kind: "lockDeliverable", auto, unresolved });
  return { state: next, effects };
}

function enterConsensus(
  state: TeamStateRecord,
  now: Date,
  prefix: EngineEffect[]
): EngineResult {
  const next: TeamStateRecord = {
    ...cloneState(state),
    phase: "consensus",
    perPersonDeadlines: [],
    groupDeadline: new Date(now.getTime() + GROUP_SILENCE_MS).toISOString(),
    respondedUserIds: [],
  };
  return {
    state: next,
    effects: [
      ...prefix,
      postFacilitator("scripted", "rewrite_prompt", {
        memberUserIds: next.memberUserIds,
        flaggedCriteria: next.flaggedCriteria,
      }),
    ],
  };
}

function enterDiscussion(
  state: TeamStateRecord,
  revealed: RevealedScores,
  flaggedCriteria: string[]
): EngineResult {
  const now = new Date(revealed.revealedAt);
  const deadlineAt = new Date(now.getTime() + DISCUSSION_DEADLINE_MS).toISOString();
  const perPersonDeadlines: PerPersonDeadline[] = [];
  const effects: EngineEffect[] = [];
  for (const criterionKey of flaggedCriteria) {
    const scorerUserId = namedScorerForCriterion(
      revealed,
      criterionKey,
      state.memberUserIds
    );
    perPersonDeadlines.push({
      userId: scorerUserId,
      stepKey: discussionStepKey(criterionKey),
      deadlineAt,
    });
    effects.push(
      postFacilitator("scripted", "targeted_prompt", {
        criterionKey,
        scorerUserId,
      })
    );
  }
  const next: TeamStateRecord = {
    ...cloneState(state),
    phase: "discussion",
    flaggedCriteria,
    perPersonDeadlines,
    groupDeadline: new Date(now.getTime() + GROUP_SILENCE_MS).toISOString(),
    respondedUserIds: [],
  };
  return { state: next, effects };
}

function markAbsentForDiscussion(
  state: TeamStateRecord,
  userId: string,
  stepKey: string
): EngineResult {
  if (!state.memberUserIds.includes(userId)) {
    return { state, effects: [] };
  }
  if (isAbsentForStep(state, userId, stepKey)) {
    return { state, effects: [] };
  }
  const next = cloneState(state);
  next.absenceStepKeys = [...next.absenceStepKeys, { userId, stepKey }];
  return {
    state: next,
    effects: [{ kind: "markAbsent", userId, stepKey }],
  };
}

function applyDiscussionMessage(
  state: TeamStateRecord,
  userId: string,
  now: Date
): EngineResult {
  if (state.respondedUserIds.includes(userId)) {
    return { state, effects: [] };
  }
  const next = recordContribution(cloneState(state), userId);
  next.perPersonDeadlines = next.perPersonDeadlines.filter(
    (deadline) =>
      !(deadline.userId === userId && isDiscussionStepKey(deadline.stepKey))
  );
  const effects: EngineEffect[] = [
    postFacilitator("llm", "revoice", { userId }),
    postFacilitator("llm", "follow_up", { userId }),
  ];
  if (discussionComplete(next)) {
    return prependEffects(enterConsensus(next, now, []), effects);
  }
  return { state: next, effects };
}

function applyFinalConsensus(
  state: TeamStateRecord,
  userId: string
): EngineResult {
  if (state.phase !== "consensus") {
    return { state, effects: [] };
  }
  if (state.agreementSets.final_consensus.includes(userId)) {
    return { state, effects: [] };
  }
  const next = cloneState(state);
  next.agreementSets.final_consensus = [
    ...next.agreementSets.final_consensus,
    userId,
  ];
  const present = presentUserIds(next, CONSENSUS_STEP_KEY);
  if (
    present.length > 0 &&
    present.every((memberId) => next.agreementSets.final_consensus.includes(memberId))
  ) {
    return lockTeam(next, false, []);
  }
  return { state: next, effects: [] };
}

function evaluateDiscussion(state: TeamStateRecord, now: Date): EngineResult {
  const nowMs = now.getTime();
  if (
    state.groupDeadline !== null &&
    Date.parse(state.groupDeadline) <= nowMs
  ) {
    return lockTeam(state, true, unresolvedCriteria(state));
  }

  const expired = state.perPersonDeadlines.filter(
    (deadline) =>
      isDiscussionStepKey(deadline.stepKey) &&
      Date.parse(deadline.deadlineAt) <= nowMs &&
      !isAbsentForStep(state, deadline.userId, deadline.stepKey)
  );

  let current = state;
  const effects: EngineEffect[] = [];
  for (const deadline of expired) {
    const result = markAbsentForDiscussion(
      current,
      deadline.userId,
      deadline.stepKey
    );
    current = result.state;
    effects.push(...result.effects);
  }
  if (discussionComplete(current)) {
    return prependEffects(enterConsensus(current, now, []), effects);
  }
  return { state: current, effects };
}

function evaluateConsensus(state: TeamStateRecord, now: Date): EngineResult {
  if (
    state.groupDeadline !== null &&
    Date.parse(state.groupDeadline) <= now.getTime()
  ) {
    return lockTeam(state, true, state.flaggedCriteria);
  }
  return { state, effects: [] };
}

/**
 * Spread per criterion = max − min of revealed scores. Flag at ≥2 (9.1, 9.2).
 */
export function computeSpread(revealed: RevealedScores): CriterionSpread[] {
  const valuesByCriterion = new Map<string, number[]>();
  for (const member of revealed.members) {
    for (const score of member.scores) {
      const values = valuesByCriterion.get(score.criterionKey) ?? [];
      values.push(score.value);
      valuesByCriterion.set(score.criterionKey, values);
    }
  }
  return [...valuesByCriterion.entries()].map(([criterionKey, values]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min;
    return {
      criterionKey,
      min,
      max,
      spread,
      flagged: spread >= SPREAD_FLAG_THRESHOLD,
    };
  });
}

/**
 * Apply revealed spreads: flag ≥2 criteria, post targeted prompts, and skip
 * discussion when none (9.3, 9.7, 10.1).
 */
export function applySpread(
  state: TeamStateRecord,
  revealed: RevealedScores
): EngineResult {
  if (state.phase !== "scoring") {
    return { state, effects: [] };
  }
  const flaggedCriteria = computeSpread(revealed)
    .filter((row) => row.flagged)
    .map((row) => row.criterionKey);
  if (flaggedCriteria.length === 0) {
    const next = cloneState(state);
    next.flaggedCriteria = [];
    return enterConsensus(next, new Date(revealed.revealedAt), []);
  }
  return enterDiscussion(state, revealed, flaggedCriteria);
}
