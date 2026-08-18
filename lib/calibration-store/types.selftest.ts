/**
 * Runtime self-test for calibration domain types and fixed activity constants (Task 1.1).
 *
 * Run: npx tsx lib/calibration-store/types.selftest.ts
 */
import {
  ACTIVITY_PHASES,
  AGREEMENT_SUBJECTS,
  CRITIQUE_DEADLINE_HOURS,
  CRITIQUE_DEADLINE_MS,
  CRITIQUE_STAGES,
  DISCUSSION_DEADLINE_DAYS,
  DISCUSSION_DEADLINE_MS,
  DOC_KINDS,
  GROUP_SILENCE_DAYS,
  GROUP_SILENCE_MS,
  MERGE_NUDGE_DAYS,
  MERGE_NUDGE_MS,
  MS_PER_DAY,
  MS_PER_HOUR,
  NOTICE_KINDS,
  OPERATOR_STUCK_LISTING_DAYS,
  OPERATOR_STUCK_LISTING_MS,
  QUEUE_EXPIRY_MISSED_PINGS,
  QUEUE_PING_DAYS,
  QUEUE_PING_MS,
  SCORE_MAX,
  SCORE_MIN,
  SCORING_DEADLINE_DAYS,
  SCORING_DEADLINE_MS,
  TEAM_PHASES,
} from "./types";
import type {
  ActivityPhase,
  AgreementSubject,
  CalibrationEngine,
  CheckIn,
  CriterionSpread,
  DocKind,
  EngineEffect,
  EngineResult,
  LearnerEvent,
  NoticeKind,
  QueueEffect,
  RevealedScores,
  TeamPhase,
  TeamStateRecord,
} from "./types";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function main(): void {
  // --- duration building blocks ---
  assertEqual(MS_PER_HOUR, 60 * 60 * 1000, "MS_PER_HOUR is one hour");
  assertEqual(MS_PER_DAY, 24 * MS_PER_HOUR, "MS_PER_DAY is 24 hours");

  // --- design constants (exact values) ---
  assertEqual(CRITIQUE_DEADLINE_HOURS, 48, "critique clock is 48 hours");
  assertEqual(
    CRITIQUE_DEADLINE_MS,
    48 * MS_PER_HOUR,
    "critique deadline milliseconds match 48h"
  );

  assertEqual(MERGE_NUDGE_DAYS, 3, "merge nudge is 3 days");
  assertEqual(
    MERGE_NUDGE_MS,
    3 * MS_PER_DAY,
    "merge nudge milliseconds match 3d"
  );

  assertEqual(SCORING_DEADLINE_DAYS, 7, "scoring clock is 7 days");
  assertEqual(
    SCORING_DEADLINE_MS,
    7 * MS_PER_DAY,
    "scoring deadline milliseconds match 7d"
  );

  assertEqual(DISCUSSION_DEADLINE_DAYS, 7, "discussion clock is 7 days");
  assertEqual(
    DISCUSSION_DEADLINE_MS,
    7 * MS_PER_DAY,
    "discussion deadline milliseconds match 7d"
  );

  assertEqual(GROUP_SILENCE_DAYS, 14, "group silence is 14 days");
  assertEqual(
    GROUP_SILENCE_MS,
    14 * MS_PER_DAY,
    "group silence milliseconds match 14d"
  );

  assertEqual(QUEUE_PING_DAYS, 6, "queue ping cadence is 6 days");
  assertEqual(
    QUEUE_PING_MS,
    6 * MS_PER_DAY,
    "queue ping milliseconds match 6d"
  );

  assertEqual(
    QUEUE_EXPIRY_MISSED_PINGS,
    2,
    "queue expires after 2 missed pings"
  );

  assertEqual(
    OPERATOR_STUCK_LISTING_DAYS,
    10,
    "operator stuck-listing is 10 days"
  );
  assertEqual(
    OPERATOR_STUCK_LISTING_MS,
    10 * MS_PER_DAY,
    "operator stuck-listing milliseconds match 10d"
  );

  assertEqual(SCORE_MIN, 1, "SCORE_MIN is 1");
  assertEqual(SCORE_MAX, 5, "SCORE_MAX is 5");
  assert(SCORE_MIN < SCORE_MAX, "score scale is an integer range 1–5");
  assert(
    Number.isInteger(SCORE_MIN) && Number.isInteger(SCORE_MAX),
    "score bounds are integers"
  );

  // --- phase set ---
  assertEqual(
    [...TEAM_PHASES],
    ["critique", "merge", "scoring", "discussion", "consensus", "finalized"],
    "team phases match design (Queue is pre-team)"
  );
  assertEqual(
    [...ACTIVITY_PHASES],
    [
      "queue",
      "critique",
      "merge",
      "scoring",
      "discussion",
      "consensus",
      "finalized",
    ],
    "activity phases include Queue plus every team phase"
  );
  assert(
    !TEAM_PHASES.includes("queue" as TeamPhase),
    "Queue is not a team phase"
  );

  const teamPhase: TeamPhase = "critique";
  const activityPhase: ActivityPhase = "queue";
  assertEqual(teamPhase, "critique", "TeamPhase accepts critique");
  assertEqual(activityPhase, "queue", "ActivityPhase accepts queue");

  // --- document kinds, agreement subjects, notice kinds ---
  assertEqual([...DOC_KINDS], ["rubric", "notes"], "DocKind is rubric|notes");
  const docKind: DocKind = "rubric";
  assertEqual(docKind, "rubric", "DocKind accepts rubric");

  assertEqual(
    [...AGREEMENT_SUBJECTS],
    ["merge_complete", "final_consensus"],
    "AgreementSubject is merge_complete|final_consensus"
  );
  const subject: AgreementSubject = "merge_complete";
  assertEqual(subject, "merge_complete", "AgreementSubject accepts merge_complete");

  assertEqual(
    [...NOTICE_KINDS],
    [
      "team_formed",
      "your_turn",
      "targeted_prompt",
      "nudge",
      "scores_revealed",
      "finalized",
      "queue_ping",
      "queue_expired",
      "manual_match",
    ],
    "notice kinds match design catalog"
  );
  const noticeKind: NoticeKind = "queue_ping";
  assertEqual(noticeKind, "queue_ping", "NoticeKind accepts queue_ping");

  assertEqual(
    [...CRITIQUE_STAGES],
    ["presenter_share", "critic_response"],
    "CritiqueStage is presenter_share|critic_response"
  );

  // --- dual independent clocks on TeamStateRecord (Requirement 4.1) ---
  const perPersonAt = "2026-08-17T00:00:00.000Z";
  const groupAt = "2026-08-29T00:00:00.000Z";
  const state: TeamStateRecord = {
    phase: "critique",
    round: 1,
    presenterIndex: 0,
    perPersonDeadlines: [
      { userId: "user_a", stepKey: "critique:1", deadlineAt: perPersonAt },
    ],
    groupDeadline: groupAt,
    flaggedCriteria: [],
    absenceStepKeys: [],
    agreementSets: { merge_complete: [], final_consensus: [] },
    memberUserIds: ["user_a", "user_b", "user_c"],
    respondedUserIds: [],
    critiqueStage: "presenter_share",
  };

  assert(
    Object.prototype.hasOwnProperty.call(state, "perPersonDeadlines"),
    "TeamStateRecord has perPersonDeadlines as its own field"
  );
  assert(
    Object.prototype.hasOwnProperty.call(state, "groupDeadline"),
    "TeamStateRecord has groupDeadline as its own field"
  );
  assertEqual(
    state.perPersonDeadlines[0]?.deadlineAt,
    perPersonAt,
    "per-person clock keeps its own timestamp"
  );
  assertEqual(state.groupDeadline, groupAt, "group clock keeps its own timestamp");
  assert(
    state.perPersonDeadlines[0]?.deadlineAt !== state.groupDeadline,
    "per-person and group clocks are not merged into one value"
  );
  assert(
    !Object.prototype.hasOwnProperty.call(state, "deadline"),
    "TeamStateRecord has no merged deadline field"
  );
  assert(
    Object.prototype.hasOwnProperty.call(state, "memberUserIds"),
    "TeamStateRecord has official memberUserIds"
  );
  assert(
    Object.prototype.hasOwnProperty.call(state, "respondedUserIds"),
    "TeamStateRecord has official respondedUserIds"
  );
  assert(
    Object.prototype.hasOwnProperty.call(state, "critiqueStage"),
    "TeamStateRecord has official critiqueStage"
  );
  assertEqual(
    state.memberUserIds,
    ["user_a", "user_b", "user_c"],
    "memberUserIds is a 3-tuple"
  );
  assertEqual(state.critiqueStage, "presenter_share", "critiqueStage is a CritiqueStage");

  // --- EngineEffect union (exact kinds from design Components) ---
  const effects: EngineEffect[] = [
    {
      kind: "postFacilitator",
      message: { source: "scripted", key: "kickoff_recap", context: {} },
    },
    {
      kind: "sendNotice",
      notice: {
        kind: "team_formed",
        userId: "user_a",
        dedupeKey: "team_1:user_a:team_formed:form",
        deepLink: "/activity/off_1",
      },
    },
    { kind: "markAbsent", userId: "user_b", stepKey: "critique:1" },
    { kind: "revealScores" },
    { kind: "lockDeliverable", auto: false, unresolved: [] },
    { kind: "expireCheckIn", checkInId: "ci_1" },
    { kind: "listForOperator", checkInId: "ci_2" },
  ];
  assertEqual(
    effects.map((e) => e.kind),
    [
      "postFacilitator",
      "sendNotice",
      "markAbsent",
      "revealScores",
      "lockDeliverable",
      "expireCheckIn",
      "listForOperator",
    ],
    "EngineEffect union constructs every design kind"
  );

  // --- LearnerEvent union (exact kinds from design Components) ---
  const events: LearnerEvent[] = [
    { kind: "message", userId: "user_a", body: "hello" },
    { kind: "docSnapshot", userId: "user_a", docKind: "notes" },
    { kind: "scoresSubmitted", userId: "user_a" },
    { kind: "agreement", userId: "user_a", subject: "final_consensus" },
    { kind: "memberReturned", userId: "user_a" },
  ];
  assertEqual(
    events.map((e) => e.kind),
    [
      "message",
      "docSnapshot",
      "scoresSubmitted",
      "agreement",
      "memberReturned",
    ],
    "LearnerEvent union constructs every design kind"
  );

  // --- CalibrationEngine interface is constructible ---
  const checkIn: CheckIn = {
    id: "ci_1",
    offeringId: "off_1",
    userId: "user_a",
    status: "queued",
    checkedInAt: "2026-08-01T00:00:00.000Z",
    lastPingAt: null,
    missedPings: 0,
    teamId: null,
  };

  const revealed: RevealedScores = {
    members: [
      {
        userId: "user_a",
        scores: [{ criterionKey: "clarity", value: SCORE_MIN }],
      },
      {
        userId: "user_b",
        scores: [{ criterionKey: "clarity", value: SCORE_MAX }],
      },
    ],
    revealedAt: "2026-08-15T00:00:00.000Z",
  };

  const engine: CalibrationEngine = {
    evaluateTeam: (current, _now) => ({ state: current, effects: [] }),
    applyLearnerEvent: (current, _event, _now) => ({
      state: current,
      effects: [],
    }),
    evaluateQueue: (_checkIns, _now) => [],
    computeSpread: (scores) =>
      scores.members[0]?.scores.map((row) => ({
        criterionKey: row.criterionKey,
        min: SCORE_MIN,
        max: SCORE_MAX,
        spread: SCORE_MAX - SCORE_MIN,
        flagged: SCORE_MAX - SCORE_MIN >= 2,
      })) ?? [],
  };

  const now = new Date("2026-08-15T00:00:00.000Z");
  const evaluated: EngineResult = engine.evaluateTeam(state, now);
  assertEqual(evaluated.effects.length, 0, "evaluateTeam returns EngineResult");
  assertEqual(evaluated.state.phase, "critique", "evaluateTeam preserves state");

  const applied = engine.applyLearnerEvent(state, events[0]!, now);
  assertEqual(applied.state.round, 1, "applyLearnerEvent returns EngineResult");

  const queueEffects: QueueEffect[] = engine.evaluateQueue([checkIn], now);
  assertEqual(queueEffects.length, 0, "evaluateQueue returns QueueEffect[]");

  const spreads: CriterionSpread[] = engine.computeSpread(revealed);
  assertEqual(spreads.length, 1, "computeSpread returns CriterionSpread[]");
  assertEqual(spreads[0]?.spread, 4, "spread uses SCORE_MAX − SCORE_MIN");

  const formTeam: QueueEffect = {
    kind: "formTeam",
    memberUserIds: ["user_a", "user_b", "user_c"],
  };
  assertEqual(formTeam.kind, "formTeam", "QueueEffect includes formTeam");

  if (failures > 0) {
    console.error(`\ntypes.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("types.selftest: all assertions passed");
}

main();
