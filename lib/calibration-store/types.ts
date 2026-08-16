/**
 * Calibration domain types, phase/effect unions, and fixed activity constants.
 * Owning module for every later calibration-* import of deadlines and score scale.
 *
 * Shapes align with `.kiro/specs/async-rubric-calibration/design.md`.
 */

// ---------------------------------------------------------------------------
// Fixed activity constants (design: critique 48h, merge nudge 3d, scoring 7d,
// discussion 7d, group 14d, queue ping 6d, expiry after 2 missed pings,
// operator stuck-listing 10d, integer score 1–5)
// ---------------------------------------------------------------------------

export const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Per-person critique-round clock (Requirement 6.6). */
export const CRITIQUE_DEADLINE_HOURS = 48;
export const CRITIQUE_DEADLINE_MS = CRITIQUE_DEADLINE_HOURS * MS_PER_HOUR;

/** Merge-phase no-contribution nudge (Requirement 7.6). */
export const MERGE_NUDGE_DAYS = 3;
export const MERGE_NUDGE_MS = MERGE_NUDGE_DAYS * MS_PER_DAY;

/** Per-person scoring clock (Requirement 8.5). */
export const SCORING_DEADLINE_DAYS = 7;
export const SCORING_DEADLINE_MS = SCORING_DEADLINE_DAYS * MS_PER_DAY;

/** Per-person discussion / targeted-prompt clock (Requirement 9.5). */
export const DISCUSSION_DEADLINE_DAYS = 7;
export const DISCUSSION_DEADLINE_MS = DISCUSSION_DEADLINE_DAYS * MS_PER_DAY;

/** Group silence clock in merge, discussion, and consensus (7.7, 9.6, 10.3). */
export const GROUP_SILENCE_DAYS = 14;
export const GROUP_SILENCE_MS = GROUP_SILENCE_DAYS * MS_PER_DAY;

/** Queue re-confirmation ping cadence (Requirement 2.3). */
export const QUEUE_PING_DAYS = 6;
export const QUEUE_PING_MS = QUEUE_PING_DAYS * MS_PER_DAY;

/** Expire a queued check-in after this many missed pings (Requirement 2.4). */
export const QUEUE_EXPIRY_MISSED_PINGS = 2;

/** Surface a waiter on the operator dashboard (Requirement 2.5 / 14.1). */
export const OPERATOR_STUCK_LISTING_DAYS = 10;
export const OPERATOR_STUCK_LISTING_MS = OPERATOR_STUCK_LISTING_DAYS * MS_PER_DAY;

/** Integer score scale per rubric criterion (Requirement 8.7). */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

// ---------------------------------------------------------------------------
// Phase set — Queue is pre-team; remaining values are team phases
// ---------------------------------------------------------------------------

export const TEAM_PHASES = [
  "critique",
  "merge",
  "scoring",
  "discussion",
  "consensus",
  "finalized",
] as const;

export type TeamPhase = (typeof TEAM_PHASES)[number];

export const ACTIVITY_PHASES = ["queue", ...TEAM_PHASES] as const;

export type ActivityPhase = (typeof ACTIVITY_PHASES)[number];

// ---------------------------------------------------------------------------
// Document kinds, agreement subjects, notice kinds
// ---------------------------------------------------------------------------

export const DOC_KINDS = ["rubric", "notes"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const AGREEMENT_SUBJECTS = ["merge_complete", "final_consensus"] as const;
export type AgreementSubject = (typeof AGREEMENT_SUBJECTS)[number];

export const NOTICE_KINDS = [
  "team_formed",
  "your_turn",
  "targeted_prompt",
  "nudge",
  "scores_revealed",
  "finalized",
  "queue_ping",
  "queue_expired",
  "manual_match",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export type CheckInStatus = "queued" | "matched" | "expired";

// ---------------------------------------------------------------------------
// Team state — per-person and group clocks are separate fields (Requirement 4.1)
// ---------------------------------------------------------------------------

/** One member's step clock. Never stored in the same field as the group clock. */
export type PerPersonDeadline = {
  userId: string;
  stepKey: string;
  deadlineAt: string;
};

export type AbsenceStepKey = {
  userId: string;
  stepKey: string;
};

export const CRITIQUE_STAGES = ["presenter_share", "critic_response"] as const;
export type CritiqueStage = (typeof CRITIQUE_STAGES)[number];

/**
 * Serializable team-state record the engine evaluates.
 * `perPersonDeadlines` and `groupDeadline` are independent clocks and must
 * never be merged into a single deadline field (Requirement 4.1).
 * Rotation progress is first-class (`memberUserIds`, `respondedUserIds`,
 * `critiqueStage`) so a JSON persist/reload stays a valid TeamStateRecord.
 */
export type TeamStateRecord = {
  phase: TeamPhase;
  round: number;
  presenterIndex: number;
  perPersonDeadlines: PerPersonDeadline[];
  groupDeadline: string | null;
  flaggedCriteria: string[];
  absenceStepKeys: AbsenceStepKey[];
  agreementSets: Record<AgreementSubject, string[]>;
  memberUserIds: [string, string, string];
  respondedUserIds: string[];
  critiqueStage: CritiqueStage;
};

// ---------------------------------------------------------------------------
// Queue / scoring supporting records
// ---------------------------------------------------------------------------

export type CheckIn = {
  id: string;
  offeringId: string;
  userId: string;
  status: CheckInStatus;
  checkedInAt: string;
  lastPingAt: string | null;
  missedPings: number;
  teamId: string | null;
};

// ---------------------------------------------------------------------------
// Persisted entities — offerings, teams, messages, documents (Task 1.2)
// ---------------------------------------------------------------------------

export const MESSAGE_AUTHOR_KINDS = ["learner", "facilitator"] as const;
export type MessageAuthorKind = (typeof MESSAGE_AUTHOR_KINDS)[number];

export const MESSAGE_KINDS = [
  "chat",
  "announcement",
  "revoice",
  "prompt",
  "doc_comment",
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type OfferingInput = {
  title: string;
  sampleAppId: string;
  sampleRubric: string;
  deploymentBrief: string;
  transcriptExcerpt: string;
  aiProvider: string;
  aiModel: string;
  /** When omitted, the facilitator uses the sample bot's stored API key. */
  facilitatorApiKey?: string;
};

export type Offering = OfferingInput & {
  id: string;
  operatorUserId: string;
  createdAt: string;
};

export type TeamMember = {
  teamId: string;
  userId: string;
  memberIndex: number;
  lastSeenAt: string | null;
};

export type Team = {
  id: string;
  offeringId: string;
  phase: TeamPhase;
  state: TeamStateRecord;
  formedAt: string;
  lastActivityAt: string;
  scoresRevealedAt: string | null;
  finalizedAt: string | null;
  autoFinalized: boolean;
  finalRubric: string | null;
  members: TeamMember[];
};

/** Team row as stored on disk (members live in a sibling collection). */
export type StoredTeam = Omit<Team, "members">;

export type NewMessage = {
  authorKind: MessageAuthorKind;
  authorUserId: string | null;
  kind: MessageKind;
  body: string;
  phase: TeamPhase;
};

export type Message = NewMessage & {
  id: string;
  teamId: string;
  createdAt: string;
};

export type DocSnapshot = {
  teamId: string;
  docKind: DocKind;
  snapshotText: string;
  updatedAt: string;
  updatedBy: string;
};

export type TeamView = {
  team: Team;
  messages: Message[];
  docs: DocSnapshot[];
};

export type ScoreRow = {
  id: string;
  teamId: string;
  userId: string;
  criterionKey: string;
  value: number;
  submittedAt: string;
};

export type AbsenceRecord = {
  teamId: string;
  userId: string;
  stepKey: string;
  markedAt: string;
};

export type AgreementRecord = {
  teamId: string;
  userId: string;
  subject: AgreementSubject;
  agreedAt: string;
};

export const NOTICE_CHANNELS = ["email", "console"] as const;
export type NoticeChannel = (typeof NOTICE_CHANNELS)[number];

/** Input persisted by `recordNotice`. `dedupeKey` is unique across the log. */
export type NoticeRecord = {
  offeringId: string;
  teamId: string | null;
  userId: string;
  kind: NoticeKind;
  dedupeKey: string;
  channel: NoticeChannel;
};

export type StoredNotice = NoticeRecord & {
  id: string;
  sentAt: string;
};

export type AddendumRecord = {
  id: string;
  teamId: string;
  userId: string;
  body: string;
  createdAt: string;
};

/**
 * Generic member score read. Pre-reveal, `members` contains only the
 * caller's own row (if any). Other members' numeric values are never present.
 */
export type MemberScoreView = {
  ownScores: CriterionScore[];
  submittedBy: string[];
  revealedAt: string | null;
  members: MemberScores[];
};

/** Operator / unfiltered read. Does not mutate `scores_revealed_at`. */
export type OperatorScoreView = {
  members: MemberScores[];
  revealedAt: string | null;
};

export type CalibrationFileData = {
  offerings: Offering[];
  checkIns: CheckIn[];
  teams: StoredTeam[];
  members: TeamMember[];
  messages: Message[];
  docs: DocSnapshot[];
  scores: ScoreRow[];
  absences: AbsenceRecord[];
  agreements: AgreementRecord[];
  notices: StoredNotice[];
  addenda: AddendumRecord[];
};

export type CriterionScore = {
  criterionKey: string;
  value: number;
};

export type MemberScores = {
  userId: string;
  scores: CriterionScore[];
};

export type RevealedScores = {
  members: MemberScores[];
  revealedAt: string;
};

export type CriterionSpread = {
  criterionKey: string;
  min: number;
  max: number;
  spread: number;
  flagged: boolean;
};

// ---------------------------------------------------------------------------
// Engine contracts (design.md Components — unions are exact)
// ---------------------------------------------------------------------------

export type FacilitatorMessageSpec = {
  source: "scripted" | "llm";
  key: string;
  context: Record<string, unknown>;
};

export type NoticeSpec = {
  kind: NoticeKind;
  userId: string;
  dedupeKey: string;
  deepLink: string;
  offeringId?: string;
  teamId?: string;
};

export type EngineEffect =
  | { kind: "postFacilitator"; message: FacilitatorMessageSpec }
  | { kind: "sendNotice"; notice: NoticeSpec }
  | { kind: "markAbsent"; userId: string; stepKey: string }
  | { kind: "revealScores" }
  | { kind: "lockDeliverable"; auto: boolean; unresolved: string[] }
  | { kind: "expireCheckIn"; checkInId: string }
  | { kind: "listForOperator"; checkInId: string };

export type LearnerEvent =
  | { kind: "message"; userId: string; body: string }
  | { kind: "docSnapshot"; userId: string; docKind: DocKind }
  | { kind: "scoresSubmitted"; userId: string }
  | { kind: "agreement"; userId: string; subject: AgreementSubject }
  | { kind: "memberReturned"; userId: string };

export type QueueEffect =
  | { kind: "formTeam"; memberUserIds: [string, string, string] }
  | { kind: "sendNotice"; notice: NoticeSpec }
  | { kind: "expireCheckIn"; checkInId: string }
  | { kind: "listForOperator"; checkInId: string };

export type EngineResult = {
  state: TeamStateRecord;
  effects: EngineEffect[];
};

export interface CalibrationEngine {
  evaluateTeam(state: TeamStateRecord, now: Date): EngineResult;
  applyLearnerEvent(
    state: TeamStateRecord,
    event: LearnerEvent,
    now: Date
  ): EngineResult;
  evaluateQueue(checkIns: CheckIn[], now: Date): QueueEffect[];
  computeSpread(scores: RevealedScores): CriterionSpread[];
}
