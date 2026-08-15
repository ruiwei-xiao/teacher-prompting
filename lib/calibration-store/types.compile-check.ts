/**
 * Compile-time smoke check for calibration domain types (Task 1.1).
 * Exercises shapes required by design so missing exports fail `tsc --noEmit`.
 */
import type {
  ActivityPhase,
  AgreementSubject,
  CalibrationEngine,
  CheckIn,
  CriterionScore,
  CriterionSpread,
  DocKind,
  EngineEffect,
  EngineResult,
  FacilitatorMessageSpec,
  LearnerEvent,
  NoticeKind,
  NoticeSpec,
  PerPersonDeadline,
  QueueEffect,
  RevealedScores,
  TeamPhase,
  TeamStateRecord,
} from "./types";
import {
  ACTIVITY_PHASES,
  AGREEMENT_SUBJECTS,
  CRITIQUE_DEADLINE_MS,
  DOC_KINDS,
  GROUP_SILENCE_MS,
  NOTICE_KINDS,
  SCORE_MAX,
  SCORE_MIN,
  TEAM_PHASES,
} from "./types";

type AssertClocksAreSeparateFields = TeamStateRecord extends {
  perPersonDeadlines: PerPersonDeadline[];
  groupDeadline: string | null;
}
  ? true
  : never;

const clocksAreSeparate: AssertClocksAreSeparateFields = true;

const teamPhases: readonly TeamPhase[] = TEAM_PHASES;
const activityPhases: readonly ActivityPhase[] = ACTIVITY_PHASES;
const docKinds: readonly DocKind[] = DOC_KINDS;
const agreementSubjects: readonly AgreementSubject[] = AGREEMENT_SUBJECTS;
const noticeKinds: readonly NoticeKind[] = NOTICE_KINDS;

const perPersonDeadline: PerPersonDeadline = {
  userId: "user_a",
  stepKey: "critique:1",
  deadlineAt: "2026-08-17T00:00:00.000Z",
};

const state: TeamStateRecord = {
  phase: "merge",
  round: 3,
  presenterIndex: 2,
  perPersonDeadlines: [perPersonDeadline],
  groupDeadline: "2026-08-29T00:00:00.000Z",
  flaggedCriteria: ["clarity"],
  absenceStepKeys: [{ userId: "user_b", stepKey: "critique:2" }],
  agreementSets: {
    merge_complete: ["user_a"],
    final_consensus: [],
  },
};

const facilitatorMessage: FacilitatorMessageSpec = {
  source: "scripted",
  key: "presenter_announcement",
  context: { presenterUserId: "user_a" },
};

const notice: NoticeSpec = {
  kind: "your_turn",
  userId: "user_a",
  dedupeKey: "team_1:user_a:your_turn:critique:1",
  deepLink: "/activity/off_1/team/team_1",
};

const engineEffects: EngineEffect[] = [
  { kind: "postFacilitator", message: facilitatorMessage },
  { kind: "sendNotice", notice },
  { kind: "markAbsent", userId: "user_b", stepKey: "scoring" },
  { kind: "revealScores" },
  { kind: "lockDeliverable", auto: true, unresolved: ["clarity"] },
  { kind: "expireCheckIn", checkInId: "ci_1" },
  { kind: "listForOperator", checkInId: "ci_2" },
];

const learnerEvents: LearnerEvent[] = [
  { kind: "message", userId: "user_a", body: "critique text" },
  { kind: "docSnapshot", userId: "user_a", docKind: "rubric" },
  { kind: "scoresSubmitted", userId: "user_a" },
  { kind: "agreement", userId: "user_a", subject: "merge_complete" },
  { kind: "memberReturned", userId: "user_c" },
];

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

const criterionScore: CriterionScore = {
  criterionKey: "clarity",
  value: SCORE_MIN,
};

const revealed: RevealedScores = {
  members: [{ userId: "user_a", scores: [criterionScore] }],
  revealedAt: "2026-08-15T00:00:00.000Z",
};

const spread: CriterionSpread = {
  criterionKey: "clarity",
  min: SCORE_MIN,
  max: SCORE_MAX,
  spread: SCORE_MAX - SCORE_MIN,
  flagged: true,
};

const queueEffects: QueueEffect[] = [
  { kind: "formTeam", memberUserIds: ["user_a", "user_b", "user_c"] },
  { kind: "sendNotice", notice },
  { kind: "expireCheckIn", checkInId: checkIn.id },
  { kind: "listForOperator", checkInId: checkIn.id },
];

const engine: CalibrationEngine = {
  evaluateTeam: (current, _now): EngineResult => ({
    state: current,
    effects: [],
  }),
  applyLearnerEvent: (current, _event, _now): EngineResult => ({
    state: current,
    effects: [],
  }),
  evaluateQueue: (_checkIns, _now) => [],
  computeSpread: (_scores) => [spread],
};

export const __calibrationTypesCompileCheck = {
  clocksAreSeparate,
  teamPhases,
  activityPhases,
  docKinds,
  agreementSubjects,
  noticeKinds,
  state,
  engineEffects,
  learnerEvents,
  checkIn,
  revealed,
  spread,
  queueEffects,
  engine,
  critiqueMs: CRITIQUE_DEADLINE_MS,
  groupSilenceMs: GROUP_SILENCE_MS,
};
