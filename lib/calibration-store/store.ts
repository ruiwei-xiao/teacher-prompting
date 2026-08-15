/**
 * CalibrationStore — dual persistence (Postgres + JSON fallback) for
 * offerings, check-ins, teams, members, messages, document snapshots,
 * scores, agreements, absences, notices, and addenda.
 * Mirrors lib/workspace-store/store.ts and lib/star-store/store.ts.
 *
 * Task 1.2: offerings, queue, teams, chat, docs.
 * Task 1.3: score privacy, gated reveal, agreements, absences, notices, addenda.
 */
import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import type {
  AbsenceRecord,
  AddendumRecord,
  AgreementRecord,
  AgreementSubject,
  CalibrationFileData,
  CheckIn,
  CheckInStatus,
  CriterionScore,
  DocKind,
  DocSnapshot,
  MemberScoreView,
  MemberScores,
  Message,
  NewMessage,
  NoticeRecord,
  Offering,
  OfferingInput,
  OperatorScoreView,
  RevealedScores,
  ScoreRow,
  StoredNotice,
  StoredTeam,
  Team,
  TeamMember,
  TeamPhase,
  TeamStateRecord,
  TeamView,
} from "./types";
import { AGREEMENT_SUBJECTS, SCORE_MAX, SCORE_MIN } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DEFAULT_CALIBRATION_FILE = path.join(DATA_DIR, "calibration.json");

type OfferingRow = {
  id: string;
  operator_user_id: string;
  title: string;
  sample_app_id: string;
  sample_rubric: string;
  deployment_brief: string;
  transcript_excerpt: string;
  ai_provider: string;
  ai_model: string;
  created_at: string | Date;
};

type CheckInRow = {
  id: string;
  offering_id: string;
  user_id: string;
  status: string;
  checked_in_at: string | Date;
  last_ping_at: string | Date | null;
  missed_pings: number;
  team_id: string | null;
};

type TeamRow = {
  id: string;
  offering_id: string;
  phase: string;
  state: unknown;
  formed_at: string | Date;
  last_activity_at: string | Date;
  scores_revealed_at: string | Date | null;
  finalized_at: string | Date | null;
  auto_finalized: boolean;
  final_rubric: string | null;
};

type MemberRow = {
  team_id: string;
  user_id: string;
  member_index: number;
  last_seen_at: string | Date | null;
};

type MessageRow = {
  id: string;
  team_id: string;
  author_kind: string;
  author_user_id: string | null;
  kind: string;
  body: string;
  phase: string;
  created_at: string | Date;
};

type DocRow = {
  team_id: string;
  doc_kind: string;
  snapshot_text: string;
  updated_at: string | Date;
  updated_by: string;
};

type ScoreRowSql = {
  id: string;
  team_id: string;
  user_id: string;
  criterion_key: string;
  value: number;
  submitted_at: string | Date;
};

type AbsenceRow = {
  team_id: string;
  user_id: string;
  step_key: string;
  marked_at: string | Date;
};

type AgreementRow = {
  team_id: string;
  user_id: string;
  subject: string;
  agreed_at: string | Date;
};

type AddendumRow = {
  id: string;
  team_id: string;
  user_id: string;
  body: string;
  created_at: string | Date;
};

let postgresReadyPromise: Promise<void> | null = null;

function calibrationFilePath(): string {
  return process.env.CALIBRATION_DATA_FILE || DEFAULT_CALIBRATION_FILE;
}

function shouldUsePostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function emptyFileData(): CalibrationFileData {
  return {
    offerings: [],
    checkIns: [],
    teams: [],
    members: [],
    messages: [],
    docs: [],
    scores: [],
    absences: [],
    agreements: [],
    notices: [],
    addenda: [],
  };
}

function initialTeamState(
  memberUserIds: [string, string, string] = ["", "", ""]
): TeamStateRecord {
  return {
    phase: "critique",
    round: 1,
    presenterIndex: 0,
    perPersonDeadlines: [],
    groupDeadline: null,
    flaggedCriteria: [],
    absenceStepKeys: [],
    agreementSets: { merge_complete: [], final_consensus: [] },
    memberUserIds,
    respondedUserIds: [],
    critiqueStage: "presenter_share",
  };
}

function isActiveCheckInStatus(status: CheckInStatus): boolean {
  return status === "queued" || status === "matched";
}

function isTeamLocked(team: StoredTeam | Team): boolean {
  return (
    team.finalizedAt !== null ||
    team.phase === "finalized" ||
    team.state.phase === "finalized"
  );
}

function parseTeamState(raw: unknown): TeamStateRecord {
  if (typeof raw === "string") {
    return JSON.parse(raw) as TeamStateRecord;
  }
  if (raw && typeof raw === "object") {
    return raw as TeamStateRecord;
  }
  throw new Error("Invalid team state record.");
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function toIsoOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIso(value);
}

function rowToOffering(row: OfferingRow): Offering {
  return {
    id: row.id,
    operatorUserId: row.operator_user_id,
    title: row.title,
    sampleAppId: row.sample_app_id,
    sampleRubric: row.sample_rubric,
    deploymentBrief: row.deployment_brief,
    transcriptExcerpt: row.transcript_excerpt,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    createdAt: toIso(row.created_at),
  };
}

function rowToCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    offeringId: row.offering_id,
    userId: row.user_id,
    status: row.status as CheckInStatus,
    checkedInAt: toIso(row.checked_in_at),
    lastPingAt: toIsoOrNull(row.last_ping_at),
    missedPings: row.missed_pings,
    teamId: row.team_id,
  };
}

function rowToStoredTeam(row: TeamRow): StoredTeam {
  return {
    id: row.id,
    offeringId: row.offering_id,
    phase: row.phase as TeamPhase,
    state: parseTeamState(row.state),
    formedAt: toIso(row.formed_at),
    lastActivityAt: toIso(row.last_activity_at),
    scoresRevealedAt: toIsoOrNull(row.scores_revealed_at),
    finalizedAt: toIsoOrNull(row.finalized_at),
    autoFinalized: Boolean(row.auto_finalized),
    finalRubric: row.final_rubric,
  };
}

function rowToMember(row: MemberRow): TeamMember {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    memberIndex: row.member_index,
    lastSeenAt: toIsoOrNull(row.last_seen_at),
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    teamId: row.team_id,
    authorKind: row.author_kind as Message["authorKind"],
    authorUserId: row.author_user_id,
    kind: row.kind as Message["kind"],
    body: row.body,
    phase: row.phase as TeamPhase,
    createdAt: toIso(row.created_at),
  };
}

function rowToDoc(row: DocRow): DocSnapshot {
  return {
    teamId: row.team_id,
    docKind: row.doc_kind as DocKind,
    snapshotText: row.snapshot_text,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

function rowToScore(row: ScoreRowSql): ScoreRow {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    criterionKey: row.criterion_key,
    value: row.value,
    submittedAt: toIso(row.submitted_at),
  };
}

function rowToAbsence(row: AbsenceRow): AbsenceRecord {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    stepKey: row.step_key,
    markedAt: toIso(row.marked_at),
  };
}

function rowToAgreement(row: AgreementRow): AgreementRecord {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    subject: row.subject as AgreementSubject,
    agreedAt: toIso(row.agreed_at),
  };
}

function rowToAddendum(row: AddendumRow): AddendumRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    body: row.body,
    createdAt: toIso(row.created_at),
  };
}

function assertValidScores(scores: CriterionScore[]): void {
  for (const row of scores) {
    if (
      !Number.isInteger(row.value) ||
      row.value < SCORE_MIN ||
      row.value > SCORE_MAX
    ) {
      throw new Error(
        `Score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}.`
      );
    }
  }
}

function assertAgreementSubject(
  subject: string
): asserts subject is AgreementSubject {
  if (!(AGREEMENT_SUBJECTS as readonly string[]).includes(subject)) {
    throw new Error("Invalid agreement subject.");
  }
}

function groupScoresByUser(rows: ScoreRow[]): MemberScores[] {
  const byUser = new Map<string, CriterionScore[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ criterionKey: row.criterionKey, value: row.value });
    byUser.set(row.userId, list);
  }
  return [...byUser.entries()].map(([userId, scores]) => ({ userId, scores }));
}

function toMemberScoreView(
  rows: ScoreRow[],
  userId: string,
  revealedAt: string | null
): MemberScoreView {
  const ownScores = rows
    .filter((row) => row.userId === userId)
    .map((row) => ({ criterionKey: row.criterionKey, value: row.value }));
  const submittedBy = [...new Set(rows.map((row) => row.userId))];
  const members: MemberScores[] =
    revealedAt === null
      ? ownScores.length > 0
        ? [{ userId, scores: ownScores }]
        : []
      : groupScoresByUser(rows);
  return { ownScores, submittedBy, revealedAt, members };
}

function upsertScoreRows(
  existing: ScoreRow[],
  teamId: string,
  userId: string,
  scores: CriterionScore[],
  submittedAt: string
): ScoreRow[] {
  const next = existing.slice();
  for (const score of scores) {
    const idx = next.findIndex(
      (row) =>
        row.teamId === teamId &&
        row.userId === userId &&
        row.criterionKey === score.criterionKey
    );
    const row: ScoreRow = {
      id: idx === -1 ? crypto.randomUUID() : next[idx].id,
      teamId,
      userId,
      criterionKey: score.criterionKey,
      value: score.value,
      submittedAt,
    };
    if (idx === -1) {
      next.push(row);
    } else {
      next[idx] = row;
    }
  }
  return next;
}

function sortMembers(members: TeamMember[]): TeamMember[] {
  return members.slice().sort((a, b) => a.memberIndex - b.memberIndex);
}

function assembleTeam(record: StoredTeam, members: TeamMember[]): Team {
  return {
    ...record,
    members: sortMembers(members.filter((m) => m.teamId === record.id)),
  };
}

function sortMessages(
  messages: Array<{ message: Message; index: number }>
): Message[] {
  return messages
    .slice()
    .sort((a, b) => {
      const delta =
        new Date(a.message.createdAt).getTime() -
        new Date(b.message.createdAt).getTime();
      if (delta !== 0) return delta;
      return a.index - b.index;
    })
    .map(({ message }) => message);
}

function assertDistinctTrio(memberUserIds: [string, string, string]): void {
  const unique = new Set(memberUserIds);
  if (unique.size !== 3) {
    throw new Error("Team requires three distinct members.");
  }
}

async function ensureFileStore() {
  const filePath = calibrationFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(emptyFileData(), null, 2), "utf-8");
  }
}

async function readFileData(): Promise<CalibrationFileData> {
  await ensureFileStore();
  const raw = await fs.readFile(calibrationFilePath(), "utf-8");
  const parsed = JSON.parse(raw) as Partial<CalibrationFileData>;
  return {
    offerings: Array.isArray(parsed.offerings) ? parsed.offerings : [],
    checkIns: Array.isArray(parsed.checkIns) ? parsed.checkIns : [],
    teams: Array.isArray(parsed.teams) ? parsed.teams : [],
    members: Array.isArray(parsed.members) ? parsed.members : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    docs: Array.isArray(parsed.docs) ? parsed.docs : [],
    scores: Array.isArray(parsed.scores) ? parsed.scores : [],
    absences: Array.isArray(parsed.absences) ? parsed.absences : [],
    agreements: Array.isArray(parsed.agreements) ? parsed.agreements : [],
    notices: Array.isArray(parsed.notices) ? parsed.notices : [],
    addenda: Array.isArray(parsed.addenda) ? parsed.addenda : [],
  };
}

async function writeFileData(data: CalibrationFileData) {
  await ensureFileStore();
  await fs.writeFile(
    calibrationFilePath(),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

async function ensurePostgresStore() {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS calibration_offerings (
          id TEXT PRIMARY KEY,
          operator_user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          sample_app_id TEXT NOT NULL,
          sample_rubric TEXT NOT NULL,
          deployment_brief TEXT NOT NULL,
          transcript_excerpt TEXT NOT NULL,
          ai_provider TEXT NOT NULL,
          ai_model TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_checkins (
          id TEXT PRIMARY KEY,
          offering_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          checked_in_at TIMESTAMPTZ NOT NULL,
          last_ping_at TIMESTAMPTZ,
          missed_pings INT NOT NULL,
          team_id TEXT
        )
      `;

      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS calibration_checkins_active_offering_user_idx
        ON calibration_checkins (offering_id, user_id)
        WHERE status IN ('queued', 'matched')
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS calibration_checkins_offering_status_idx
        ON calibration_checkins (offering_id, status)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_teams (
          id TEXT PRIMARY KEY,
          offering_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          state JSONB NOT NULL,
          formed_at TIMESTAMPTZ NOT NULL,
          last_activity_at TIMESTAMPTZ NOT NULL,
          scores_revealed_at TIMESTAMPTZ,
          finalized_at TIMESTAMPTZ,
          auto_finalized BOOLEAN NOT NULL,
          final_rubric TEXT
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_team_members (
          team_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          member_index INT NOT NULL,
          last_seen_at TIMESTAMPTZ,
          PRIMARY KEY (team_id, user_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_messages (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          author_kind TEXT NOT NULL,
          author_user_id TEXT,
          kind TEXT NOT NULL,
          body TEXT NOT NULL,
          phase TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS calibration_messages_team_created_idx
        ON calibration_messages (team_id, created_at)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_docs (
          team_id TEXT NOT NULL,
          doc_kind TEXT NOT NULL,
          snapshot_text TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          updated_by TEXT NOT NULL,
          PRIMARY KEY (team_id, doc_kind)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_scores (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          criterion_key TEXT NOT NULL,
          value INT NOT NULL CHECK (value >= 1 AND value <= 5),
          submitted_at TIMESTAMPTZ NOT NULL,
          UNIQUE (team_id, user_id, criterion_key)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_absences (
          team_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          step_key TEXT NOT NULL,
          marked_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (team_id, user_id, step_key)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_agreements (
          team_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          agreed_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (team_id, user_id, subject)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_notices (
          id TEXT PRIMARY KEY,
          offering_id TEXT NOT NULL,
          team_id TEXT,
          user_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          dedupe_key TEXT NOT NULL UNIQUE,
          channel TEXT NOT NULL,
          sent_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calibration_addenda (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;
    })();
  }

  return postgresReadyPromise;
}

// --- File implementations ---

async function createOfferingInFile(
  input: OfferingInput,
  operatorUserId: string
): Promise<Offering> {
  const data = await readFileData();
  const offering: Offering = {
    id: crypto.randomUUID(),
    operatorUserId,
    title: input.title,
    sampleAppId: input.sampleAppId,
    sampleRubric: input.sampleRubric,
    deploymentBrief: input.deploymentBrief,
    transcriptExcerpt: input.transcriptExcerpt,
    aiProvider: input.aiProvider,
    aiModel: input.aiModel,
    createdAt: new Date().toISOString(),
  };
  data.offerings.push(offering);
  await writeFileData(data);
  return offering;
}

async function getOfferingInFile(offeringId: string): Promise<Offering | null> {
  const data = await readFileData();
  return data.offerings.find((o) => o.id === offeringId) ?? null;
}

async function checkInInFile(
  offeringId: string,
  userId: string,
  now?: Date
): Promise<CheckIn> {
  const data = await readFileData();
  if (!data.offerings.some((o) => o.id === offeringId)) {
    throw new Error("Offering not found.");
  }
  const existing = data.checkIns.find(
    (c) =>
      c.offeringId === offeringId &&
      c.userId === userId &&
      isActiveCheckInStatus(c.status)
  );
  if (existing) {
    return existing;
  }
  const record: CheckIn = {
    id: crypto.randomUUID(),
    offeringId,
    userId,
    status: "queued",
    checkedInAt: (now ?? new Date()).toISOString(),
    lastPingAt: null,
    missedPings: 0,
    teamId: null,
  };
  data.checkIns.push(record);
  await writeFileData(data);
  return record;
}

async function getCheckInInFile(
  offeringId: string,
  userId: string
): Promise<CheckIn | null> {
  const data = await readFileData();
  return (
    data.checkIns.find(
      (c) =>
        c.offeringId === offeringId &&
        c.userId === userId &&
        isActiveCheckInStatus(c.status)
    ) ?? null
  );
}

async function listQueuedCheckInsInFile(offeringId?: string): Promise<CheckIn[]> {
  const data = await readFileData();
  return data.checkIns
    .filter((c) => c.status === "queued")
    .filter((c) => (offeringId ? c.offeringId === offeringId : true))
    .slice()
    .sort((a, b) => {
      const delta =
        new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime();
      if (delta !== 0) return delta;
      return a.id.localeCompare(b.id);
    });
}

async function formTeamInFile(
  offeringId: string,
  memberUserIds: [string, string, string]
): Promise<Team> {
  assertDistinctTrio(memberUserIds);
  const data = await readFileData();
  if (!data.offerings.some((o) => o.id === offeringId)) {
    throw new Error("Offering not found.");
  }
  const now = new Date().toISOString();
  const state = initialTeamState(memberUserIds);
  const record: StoredTeam = {
    id: crypto.randomUUID(),
    offeringId,
    phase: state.phase,
    state,
    formedAt: now,
    lastActivityAt: now,
    scoresRevealedAt: null,
    finalizedAt: null,
    autoFinalized: false,
    finalRubric: null,
  };
  const members: TeamMember[] = memberUserIds.map((userId, memberIndex) => ({
    teamId: record.id,
    userId,
    memberIndex,
    lastSeenAt: null,
  }));
  data.teams.push(record);
  data.members.push(...members);
  data.checkIns = data.checkIns.map((c) => {
    if (
      c.offeringId === offeringId &&
      c.status === "queued" &&
      memberUserIds.includes(c.userId)
    ) {
      return { ...c, status: "matched" as const, teamId: record.id };
    }
    return c;
  });
  await writeFileData(data);
  return assembleTeam(record, members);
}

function findStoredTeam(data: CalibrationFileData, teamId: string): StoredTeam | null {
  return data.teams.find((t) => t.id === teamId) ?? null;
}

async function getTeamInFile(teamId: string): Promise<Team | null> {
  const data = await readFileData();
  const record = findStoredTeam(data, teamId);
  if (!record) {
    return null;
  }
  const members = data.members.filter((m) => m.teamId === teamId);
  return assembleTeam(record, members);
}

async function getTeamForMemberInFile(
  teamId: string,
  userId: string
): Promise<TeamView | null> {
  const data = await readFileData();
  const record = findStoredTeam(data, teamId);
  if (!record) {
    return null;
  }
  const members = data.members.filter((m) => m.teamId === teamId);
  if (!members.some((m) => m.userId === userId)) {
    return null;
  }
  const team = assembleTeam(record, members);
  const messages = sortMessages(
    data.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.teamId === teamId)
  );
  const docs = data.docs.filter((d) => d.teamId === teamId);
  return { team, messages, docs };
}

async function saveTeamStateInFile(
  teamId: string,
  state: TeamStateRecord
): Promise<void> {
  const data = await readFileData();
  const idx = data.teams.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    throw new Error("Team not found.");
  }
  const current = data.teams[idx];
  const now = new Date().toISOString();
  data.teams[idx] = {
    ...current,
    phase: state.phase,
    state,
    finalizedAt:
      state.phase === "finalized" ? current.finalizedAt ?? now : current.finalizedAt,
  };
  await writeFileData(data);
}

async function updateLastSeenInFile(
  teamId: string,
  userId: string,
  seenAt: Date
): Promise<void> {
  const data = await readFileData();
  const idx = data.members.findIndex(
    (member) => member.teamId === teamId && member.userId === userId
  );
  if (idx === -1) {
    return;
  }
  data.members[idx] = {
    ...data.members[idx],
    lastSeenAt: seenAt.toISOString(),
  };
  await writeFileData(data);
}

async function markDeliverableLockedInFile(
  teamId: string,
  auto: boolean
): Promise<void> {
  const data = await readFileData();
  const idx = data.teams.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    throw new Error("Team not found.");
  }
  const current = data.teams[idx];
  const now = new Date().toISOString();
  data.teams[idx] = {
    ...current,
    finalizedAt: current.finalizedAt ?? now,
    autoFinalized: auto || current.autoFinalized,
  };
  await writeFileData(data);
}

async function appendMessageInFile(
  teamId: string,
  message: NewMessage
): Promise<Message> {
  const data = await readFileData();
  const idx = data.teams.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    throw new Error("Team not found.");
  }
  const now = new Date().toISOString();
  const record: Message = {
    id: crypto.randomUUID(),
    teamId,
    authorKind: message.authorKind,
    authorUserId: message.authorUserId,
    kind: message.kind,
    body: message.body,
    phase: message.phase,
    createdAt: now,
  };
  data.messages.push(record);
  data.teams[idx] = { ...data.teams[idx], lastActivityAt: now };
  await writeFileData(data);
  return record;
}

async function saveDocSnapshotInFile(
  teamId: string,
  kind: DocKind,
  text: string,
  userId: string
): Promise<void> {
  const data = await readFileData();
  const idx = data.teams.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    throw new Error("Team not found.");
  }
  if (isTeamLocked(data.teams[idx])) {
    throw new Error("final rubric is locked");
  }
  const now = new Date().toISOString();
  const snapshot: DocSnapshot = {
    teamId,
    docKind: kind,
    snapshotText: text,
    updatedAt: now,
    updatedBy: userId,
  };
  const docIdx = data.docs.findIndex(
    (d) => d.teamId === teamId && d.docKind === kind
  );
  if (docIdx === -1) {
    data.docs.push(snapshot);
  } else {
    data.docs[docIdx] = snapshot;
  }
  data.teams[idx] = { ...data.teams[idx], lastActivityAt: now };
  await writeFileData(data);
}

function requireStoredTeam(
  data: CalibrationFileData,
  teamId: string
): { record: StoredTeam; idx: number } {
  const idx = data.teams.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    throw new Error("Team not found.");
  }
  return { record: data.teams[idx], idx };
}

function requireMember(data: CalibrationFileData, teamId: string, userId: string): void {
  if (!data.members.some((m) => m.teamId === teamId && m.userId === userId)) {
    throw new Error("User is not a team member.");
  }
}

async function submitScoresInFile(
  teamId: string,
  userId: string,
  scores: CriterionScore[]
): Promise<void> {
  assertValidScores(scores);
  const data = await readFileData();
  const { record } = requireStoredTeam(data, teamId);
  requireMember(data, teamId, userId);
  if (record.scoresRevealedAt !== null) {
    throw new Error("Scores cannot be changed after reveal.");
  }
  const now = new Date().toISOString();
  data.scores = upsertScoreRows(data.scores, teamId, userId, scores, now);
  await writeFileData(data);
}

async function revealScoresInFile(
  teamId: string,
  revealedAt: Date
): Promise<RevealedScores> {
  const data = await readFileData();
  const { record, idx } = requireStoredTeam(data, teamId);
  const stamp = record.scoresRevealedAt ?? revealedAt.toISOString();
  if (record.scoresRevealedAt === null) {
    data.teams[idx] = { ...record, scoresRevealedAt: stamp };
    await writeFileData(data);
  }
  return {
    members: groupScoresByUser(data.scores.filter((row) => row.teamId === teamId)),
    revealedAt: stamp,
  };
}

async function getScoresForMemberInFile(
  teamId: string,
  userId: string
): Promise<MemberScoreView | null> {
  const data = await readFileData();
  const record = findStoredTeam(data, teamId);
  if (!record) {
    return null;
  }
  if (!data.members.some((m) => m.teamId === teamId && m.userId === userId)) {
    return null;
  }
  return toMemberScoreView(
    data.scores.filter((row) => row.teamId === teamId),
    userId,
    record.scoresRevealedAt
  );
}

async function getScoresForOperatorInFile(
  teamId: string
): Promise<OperatorScoreView | null> {
  const data = await readFileData();
  const record = findStoredTeam(data, teamId);
  if (!record) {
    return null;
  }
  return {
    members: groupScoresByUser(data.scores.filter((row) => row.teamId === teamId)),
    revealedAt: record.scoresRevealedAt,
  };
}

async function recordAgreementInFile(
  teamId: string,
  userId: string,
  subject: AgreementSubject
): Promise<void> {
  assertAgreementSubject(subject);
  const data = await readFileData();
  requireStoredTeam(data, teamId);
  requireMember(data, teamId, userId);
  const exists = data.agreements.some(
    (row) => row.teamId === teamId && row.userId === userId && row.subject === subject
  );
  if (exists) {
    return;
  }
  data.agreements.push({
    teamId,
    userId,
    subject,
    agreedAt: new Date().toISOString(),
  });
  await writeFileData(data);
}

async function recordAbsenceInFile(
  teamId: string,
  userId: string,
  stepKey: string
): Promise<void> {
  const data = await readFileData();
  requireStoredTeam(data, teamId);
  const exists = data.absences.some(
    (row) => row.teamId === teamId && row.userId === userId && row.stepKey === stepKey
  );
  if (exists) {
    return;
  }
  data.absences.push({
    teamId,
    userId,
    stepKey,
    markedAt: new Date().toISOString(),
  });
  await writeFileData(data);
}

async function recordNoticeInFile(notice: NoticeRecord): Promise<boolean> {
  const data = await readFileData();
  if (data.notices.some((row) => row.dedupeKey === notice.dedupeKey)) {
    return false;
  }
  const stored: StoredNotice = {
    ...notice,
    id: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  };
  data.notices.push(stored);
  await writeFileData(data);
  return true;
}

async function hasNoticeInFile(dedupeKey: string): Promise<boolean> {
  const data = await readFileData();
  return data.notices.some((row) => row.dedupeKey === dedupeKey);
}

async function addAddendumInFile(
  teamId: string,
  userId: string,
  body: string
): Promise<void> {
  const data = await readFileData();
  const { record } = requireStoredTeam(data, teamId);
  requireMember(data, teamId, userId);
  if (!isTeamLocked(record)) {
    throw new Error("addendum is only allowed after the group artifact is locked");
  }
  data.addenda.push({
    id: crypto.randomUUID(),
    teamId,
    userId,
    body,
    createdAt: new Date().toISOString(),
  });
  await writeFileData(data);
}

async function listAgreementsInFile(teamId: string): Promise<AgreementRecord[]> {
  const data = await readFileData();
  return data.agreements.filter((row) => row.teamId === teamId);
}

async function listAbsencesInFile(teamId: string): Promise<AbsenceRecord[]> {
  const data = await readFileData();
  return data.absences.filter((row) => row.teamId === teamId);
}

async function listAddendaInFile(teamId: string): Promise<AddendumRecord[]> {
  const data = await readFileData();
  return data.addenda.filter((row) => row.teamId === teamId);
}

// --- Postgres implementations ---

async function createOfferingInPostgres(
  input: OfferingInput,
  operatorUserId: string
): Promise<Offering> {
  await ensurePostgresStore();
  const offering: Offering = {
    id: crypto.randomUUID(),
    operatorUserId,
    title: input.title,
    sampleAppId: input.sampleAppId,
    sampleRubric: input.sampleRubric,
    deploymentBrief: input.deploymentBrief,
    transcriptExcerpt: input.transcriptExcerpt,
    aiProvider: input.aiProvider,
    aiModel: input.aiModel,
    createdAt: new Date().toISOString(),
  };
  await sql`
    INSERT INTO calibration_offerings (
      id, operator_user_id, title, sample_app_id, sample_rubric,
      deployment_brief, transcript_excerpt, ai_provider, ai_model, created_at
    )
    VALUES (
      ${offering.id},
      ${offering.operatorUserId},
      ${offering.title},
      ${offering.sampleAppId},
      ${offering.sampleRubric},
      ${offering.deploymentBrief},
      ${offering.transcriptExcerpt},
      ${offering.aiProvider},
      ${offering.aiModel},
      ${offering.createdAt}
    )
  `;
  return offering;
}

async function getOfferingInPostgres(offeringId: string): Promise<Offering | null> {
  await ensurePostgresStore();
  const result = await sql<OfferingRow>`
    SELECT
      id, operator_user_id, title, sample_app_id, sample_rubric,
      deployment_brief, transcript_excerpt, ai_provider, ai_model, created_at
    FROM calibration_offerings
    WHERE id = ${offeringId}
    LIMIT 1
  `;
  const row = result.rows[0];
  return row ? rowToOffering(row) : null;
}

async function checkInInPostgres(
  offeringId: string,
  userId: string,
  now?: Date
): Promise<CheckIn> {
  await ensurePostgresStore();
  const offering = await getOfferingInPostgres(offeringId);
  if (!offering) {
    throw new Error("Offering not found.");
  }
  const existing = await sql<CheckInRow>`
    SELECT
      id, offering_id, user_id, status, checked_in_at,
      last_ping_at, missed_pings, team_id
    FROM calibration_checkins
    WHERE offering_id = ${offeringId}
      AND user_id = ${userId}
      AND status IN ('queued', 'matched')
    LIMIT 1
  `;
  if (existing.rows[0]) {
    return rowToCheckIn(existing.rows[0]);
  }
  const record: CheckIn = {
    id: crypto.randomUUID(),
    offeringId,
    userId,
    status: "queued",
    checkedInAt: (now ?? new Date()).toISOString(),
    lastPingAt: null,
    missedPings: 0,
    teamId: null,
  };
  await sql`
    INSERT INTO calibration_checkins (
      id, offering_id, user_id, status, checked_in_at,
      last_ping_at, missed_pings, team_id
    )
    VALUES (
      ${record.id},
      ${record.offeringId},
      ${record.userId},
      ${record.status},
      ${record.checkedInAt},
      ${record.lastPingAt},
      ${record.missedPings},
      ${record.teamId}
    )
  `;
  return record;
}

async function getCheckInInPostgres(
  offeringId: string,
  userId: string
): Promise<CheckIn | null> {
  await ensurePostgresStore();
  const existing = await sql<CheckInRow>`
    SELECT
      id, offering_id, user_id, status, checked_in_at,
      last_ping_at, missed_pings, team_id
    FROM calibration_checkins
    WHERE offering_id = ${offeringId}
      AND user_id = ${userId}
      AND status IN ('queued', 'matched')
    LIMIT 1
  `;
  return existing.rows[0] ? rowToCheckIn(existing.rows[0]) : null;
}

async function listQueuedCheckInsInPostgres(
  offeringId?: string
): Promise<CheckIn[]> {
  await ensurePostgresStore();
  const result = offeringId
    ? await sql<CheckInRow>`
        SELECT
          id, offering_id, user_id, status, checked_in_at,
          last_ping_at, missed_pings, team_id
        FROM calibration_checkins
        WHERE status = ${"queued"} AND offering_id = ${offeringId}
        ORDER BY checked_in_at ASC, id ASC
      `
    : await sql<CheckInRow>`
        SELECT
          id, offering_id, user_id, status, checked_in_at,
          last_ping_at, missed_pings, team_id
        FROM calibration_checkins
        WHERE status = ${"queued"}
        ORDER BY checked_in_at ASC, id ASC
      `;
  return result.rows.map(rowToCheckIn);
}

async function loadMembersInPostgres(teamId: string): Promise<TeamMember[]> {
  const result = await sql<MemberRow>`
    SELECT team_id, user_id, member_index, last_seen_at
    FROM calibration_team_members
    WHERE team_id = ${teamId}
    ORDER BY member_index ASC
  `;
  return result.rows.map(rowToMember);
}

async function loadStoredTeamInPostgres(teamId: string): Promise<StoredTeam | null> {
  const result = await sql<TeamRow>`
    SELECT
      id, offering_id, phase, state, formed_at, last_activity_at,
      scores_revealed_at, finalized_at, auto_finalized, final_rubric
    FROM calibration_teams
    WHERE id = ${teamId}
    LIMIT 1
  `;
  const row = result.rows[0];
  return row ? rowToStoredTeam(row) : null;
}

async function formTeamInPostgres(
  offeringId: string,
  memberUserIds: [string, string, string]
): Promise<Team> {
  assertDistinctTrio(memberUserIds);
  await ensurePostgresStore();
  const offering = await getOfferingInPostgres(offeringId);
  if (!offering) {
    throw new Error("Offering not found.");
  }
  const now = new Date().toISOString();
  const state = initialTeamState(memberUserIds);
  const record: StoredTeam = {
    id: crypto.randomUUID(),
    offeringId,
    phase: state.phase,
    state,
    formedAt: now,
    lastActivityAt: now,
    scoresRevealedAt: null,
    finalizedAt: null,
    autoFinalized: false,
    finalRubric: null,
  };
  const stateJson = JSON.stringify(state);
  await sql`
    INSERT INTO calibration_teams (
      id, offering_id, phase, state, formed_at, last_activity_at,
      scores_revealed_at, finalized_at, auto_finalized, final_rubric
    )
    VALUES (
      ${record.id},
      ${record.offeringId},
      ${record.phase},
      ${stateJson},
      ${record.formedAt},
      ${record.lastActivityAt},
      ${record.scoresRevealedAt},
      ${record.finalizedAt},
      ${record.autoFinalized},
      ${record.finalRubric}
    )
  `;
  const members: TeamMember[] = [];
  for (const [memberIndex, userId] of memberUserIds.entries()) {
    const member: TeamMember = {
      teamId: record.id,
      userId,
      memberIndex,
      lastSeenAt: null,
    };
    await sql`
      INSERT INTO calibration_team_members (team_id, user_id, member_index, last_seen_at)
      VALUES (${member.teamId}, ${member.userId}, ${member.memberIndex}, ${member.lastSeenAt})
    `;
    members.push(member);
    await sql`
      UPDATE calibration_checkins
      SET status = ${"matched"}, team_id = ${record.id}
      WHERE offering_id = ${offeringId}
        AND user_id = ${userId}
        AND status = ${"queued"}
    `;
  }
  return assembleTeam(record, members);
}

async function getTeamInPostgres(teamId: string): Promise<Team | null> {
  await ensurePostgresStore();
  const record = await loadStoredTeamInPostgres(teamId);
  if (!record) {
    return null;
  }
  const members = await loadMembersInPostgres(teamId);
  return assembleTeam(record, members);
}

async function getTeamForMemberInPostgres(
  teamId: string,
  userId: string
): Promise<TeamView | null> {
  await ensurePostgresStore();
  const record = await loadStoredTeamInPostgres(teamId);
  if (!record) {
    return null;
  }
  const members = await loadMembersInPostgres(teamId);
  if (!members.some((m) => m.userId === userId)) {
    return null;
  }
  const messageResult = await sql<MessageRow>`
    SELECT id, team_id, author_kind, author_user_id, kind, body, phase, created_at
    FROM calibration_messages
    WHERE team_id = ${teamId}
    ORDER BY created_at ASC, id ASC
  `;
  const docResult = await sql<DocRow>`
    SELECT team_id, doc_kind, snapshot_text, updated_at, updated_by
    FROM calibration_docs
    WHERE team_id = ${teamId}
  `;
  return {
    team: assembleTeam(record, members),
    messages: messageResult.rows.map(rowToMessage),
    docs: docResult.rows.map(rowToDoc),
  };
}

async function saveTeamStateInPostgres(
  teamId: string,
  state: TeamStateRecord
): Promise<void> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  const now = new Date().toISOString();
  const finalizedAt =
    state.phase === "finalized" ? current.finalizedAt ?? now : current.finalizedAt;
  const stateJson = JSON.stringify(state);
  await sql`
    UPDATE calibration_teams
    SET
      phase = ${state.phase},
      state = ${stateJson},
      finalized_at = ${finalizedAt}
    WHERE id = ${teamId}
  `;
}

async function updateLastSeenInPostgres(
  teamId: string,
  userId: string,
  seenAt: Date
): Promise<void> {
  await ensurePostgresStore();
  const iso = seenAt.toISOString();
  await sql`
    UPDATE calibration_team_members
    SET last_seen_at = ${iso}
    WHERE team_id = ${teamId} AND user_id = ${userId}
  `;
}

async function markDeliverableLockedInPostgres(
  teamId: string,
  auto: boolean
): Promise<void> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  const now = new Date().toISOString();
  const finalizedAt = current.finalizedAt ?? now;
  const autoFinalized = auto || current.autoFinalized;
  await sql`
    UPDATE calibration_teams
    SET
      finalized_at = ${finalizedAt},
      auto_finalized = ${autoFinalized}
    WHERE id = ${teamId}
  `;
}

async function appendMessageInPostgres(
  teamId: string,
  message: NewMessage
): Promise<Message> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  const now = new Date().toISOString();
  const record: Message = {
    id: crypto.randomUUID(),
    teamId,
    authorKind: message.authorKind,
    authorUserId: message.authorUserId,
    kind: message.kind,
    body: message.body,
    phase: message.phase,
    createdAt: now,
  };
  await sql`
    INSERT INTO calibration_messages (
      id, team_id, author_kind, author_user_id, kind, body, phase, created_at
    )
    VALUES (
      ${record.id},
      ${record.teamId},
      ${record.authorKind},
      ${record.authorUserId},
      ${record.kind},
      ${record.body},
      ${record.phase},
      ${record.createdAt}
    )
  `;
  await sql`
    UPDATE calibration_teams
    SET last_activity_at = ${now}
    WHERE id = ${teamId}
  `;
  return record;
}

async function saveDocSnapshotInPostgres(
  teamId: string,
  kind: DocKind,
  text: string,
  userId: string
): Promise<void> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  if (isTeamLocked(current)) {
    throw new Error("final rubric is locked");
  }
  const now = new Date().toISOString();
  await sql`
    INSERT INTO calibration_docs (team_id, doc_kind, snapshot_text, updated_at, updated_by)
    VALUES (${teamId}, ${kind}, ${text}, ${now}, ${userId})
    ON CONFLICT (team_id, doc_kind)
    DO UPDATE SET
      snapshot_text = EXCLUDED.snapshot_text,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by
  `;
  await sql`
    UPDATE calibration_teams
    SET last_activity_at = ${now}
    WHERE id = ${teamId}
  `;
}

async function loadScoresInPostgres(teamId: string): Promise<ScoreRow[]> {
  const result = await sql<ScoreRowSql>`
    SELECT id, team_id, user_id, criterion_key, value, submitted_at
    FROM calibration_scores
    WHERE team_id = ${teamId}
    ORDER BY user_id ASC, criterion_key ASC
  `;
  return result.rows.map(rowToScore);
}

async function assertMemberInPostgres(teamId: string, userId: string): Promise<void> {
  const members = await loadMembersInPostgres(teamId);
  if (!members.some((m) => m.userId === userId)) {
    throw new Error("User is not a team member.");
  }
}

async function submitScoresInPostgres(
  teamId: string,
  userId: string,
  scores: CriterionScore[]
): Promise<void> {
  assertValidScores(scores);
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  await assertMemberInPostgres(teamId, userId);
  if (current.scoresRevealedAt !== null) {
    throw new Error("Scores cannot be changed after reveal.");
  }
  const now = new Date().toISOString();
  for (const score of scores) {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO calibration_scores (
        id, team_id, user_id, criterion_key, value, submitted_at
      )
      VALUES (
        ${id}, ${teamId}, ${userId}, ${score.criterionKey}, ${score.value}, ${now}
      )
      ON CONFLICT (team_id, user_id, criterion_key)
      DO UPDATE SET
        value = EXCLUDED.value,
        submitted_at = EXCLUDED.submitted_at
    `;
  }
}

async function revealScoresInPostgres(
  teamId: string,
  revealedAt: Date
): Promise<RevealedScores> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  const stamp = current.scoresRevealedAt ?? revealedAt.toISOString();
  if (current.scoresRevealedAt === null) {
    await sql`
      UPDATE calibration_teams
      SET scores_revealed_at = ${stamp}
      WHERE id = ${teamId} AND scores_revealed_at IS NULL
    `;
  }
  const rows = await loadScoresInPostgres(teamId);
  return {
    members: groupScoresByUser(rows),
    revealedAt: stamp,
  };
}

async function getScoresForMemberInPostgres(
  teamId: string,
  userId: string
): Promise<MemberScoreView | null> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    return null;
  }
  const members = await loadMembersInPostgres(teamId);
  if (!members.some((m) => m.userId === userId)) {
    return null;
  }
  const rows = await loadScoresInPostgres(teamId);
  return toMemberScoreView(rows, userId, current.scoresRevealedAt);
}

async function getScoresForOperatorInPostgres(
  teamId: string
): Promise<OperatorScoreView | null> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    return null;
  }
  const rows = await loadScoresInPostgres(teamId);
  return {
    members: groupScoresByUser(rows),
    revealedAt: current.scoresRevealedAt,
  };
}

async function recordAgreementInPostgres(
  teamId: string,
  userId: string,
  subject: AgreementSubject
): Promise<void> {
  assertAgreementSubject(subject);
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  await assertMemberInPostgres(teamId, userId);
  const now = new Date().toISOString();
  await sql`
    INSERT INTO calibration_agreements (team_id, user_id, subject, agreed_at)
    VALUES (${teamId}, ${userId}, ${subject}, ${now})
    ON CONFLICT (team_id, user_id, subject) DO NOTHING
  `;
}

async function recordAbsenceInPostgres(
  teamId: string,
  userId: string,
  stepKey: string
): Promise<void> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  const now = new Date().toISOString();
  await sql`
    INSERT INTO calibration_absences (team_id, user_id, step_key, marked_at)
    VALUES (${teamId}, ${userId}, ${stepKey}, ${now})
    ON CONFLICT (team_id, user_id, step_key) DO NOTHING
  `;
}

async function recordNoticeInPostgres(notice: NoticeRecord): Promise<boolean> {
  await ensurePostgresStore();
  const stored: StoredNotice = {
    ...notice,
    id: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  };
  const result = await sql`
    INSERT INTO calibration_notices (
      id, offering_id, team_id, user_id, kind, dedupe_key, channel, sent_at
    )
    VALUES (
      ${stored.id},
      ${stored.offeringId},
      ${stored.teamId},
      ${stored.userId},
      ${stored.kind},
      ${stored.dedupeKey},
      ${stored.channel},
      ${stored.sentAt}
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `;
  return result.rows.length > 0;
}

async function hasNoticeInPostgres(dedupeKey: string): Promise<boolean> {
  await ensurePostgresStore();
  const result = await sql<{ id: string }>`
    SELECT id
    FROM calibration_notices
    WHERE dedupe_key = ${dedupeKey}
    LIMIT 1
  `;
  return result.rows.length > 0;
}

async function addAddendumInPostgres(
  teamId: string,
  userId: string,
  body: string
): Promise<void> {
  await ensurePostgresStore();
  const current = await loadStoredTeamInPostgres(teamId);
  if (!current) {
    throw new Error("Team not found.");
  }
  await assertMemberInPostgres(teamId, userId);
  if (!isTeamLocked(current)) {
    throw new Error("addendum is only allowed after the group artifact is locked");
  }
  const record: AddendumRecord = {
    id: crypto.randomUUID(),
    teamId,
    userId,
    body,
    createdAt: new Date().toISOString(),
  };
  await sql`
    INSERT INTO calibration_addenda (id, team_id, user_id, body, created_at)
    VALUES (
      ${record.id}, ${record.teamId}, ${record.userId}, ${record.body}, ${record.createdAt}
    )
  `;
}

async function listAgreementsInPostgres(teamId: string): Promise<AgreementRecord[]> {
  await ensurePostgresStore();
  const result = await sql<AgreementRow>`
    SELECT team_id, user_id, subject, agreed_at
    FROM calibration_agreements
    WHERE team_id = ${teamId}
    ORDER BY agreed_at ASC
  `;
  return result.rows.map(rowToAgreement);
}

async function listAbsencesInPostgres(teamId: string): Promise<AbsenceRecord[]> {
  await ensurePostgresStore();
  const result = await sql<AbsenceRow>`
    SELECT team_id, user_id, step_key, marked_at
    FROM calibration_absences
    WHERE team_id = ${teamId}
    ORDER BY marked_at ASC
  `;
  return result.rows.map(rowToAbsence);
}

async function listAddendaInPostgres(teamId: string): Promise<AddendumRecord[]> {
  await ensurePostgresStore();
  const result = await sql<AddendumRow>`
    SELECT id, team_id, user_id, body, created_at
    FROM calibration_addenda
    WHERE team_id = ${teamId}
    ORDER BY created_at ASC
  `;
  return result.rows.map(rowToAddendum);
}

// --- Public façade ---

export async function createOffering(
  input: OfferingInput,
  operatorUserId: string
): Promise<Offering> {
  if (shouldUsePostgres()) {
    return createOfferingInPostgres(input, operatorUserId);
  }
  return createOfferingInFile(input, operatorUserId);
}

export async function getOffering(offeringId: string): Promise<Offering | null> {
  if (shouldUsePostgres()) {
    return getOfferingInPostgres(offeringId);
  }
  return getOfferingInFile(offeringId);
}

export async function checkIn(
  offeringId: string,
  userId: string,
  now?: Date
): Promise<CheckIn> {
  if (shouldUsePostgres()) {
    return checkInInPostgres(offeringId, userId, now);
  }
  return checkInInFile(offeringId, userId, now);
}

export async function getCheckIn(
  offeringId: string,
  userId: string
): Promise<CheckIn | null> {
  if (shouldUsePostgres()) {
    return getCheckInInPostgres(offeringId, userId);
  }
  return getCheckInInFile(offeringId, userId);
}

export async function listQueuedCheckIns(offeringId?: string): Promise<CheckIn[]> {
  if (shouldUsePostgres()) {
    return listQueuedCheckInsInPostgres(offeringId);
  }
  return listQueuedCheckInsInFile(offeringId);
}

export async function formTeam(
  offeringId: string,
  memberUserIds: [string, string, string]
): Promise<Team> {
  if (shouldUsePostgres()) {
    return formTeamInPostgres(offeringId, memberUserIds);
  }
  return formTeamInFile(offeringId, memberUserIds);
}

export async function getTeam(teamId: string): Promise<Team | null> {
  if (shouldUsePostgres()) {
    return getTeamInPostgres(teamId);
  }
  return getTeamInFile(teamId);
}

export async function getTeamForMember(
  teamId: string,
  userId: string
): Promise<TeamView | null> {
  if (shouldUsePostgres()) {
    return getTeamForMemberInPostgres(teamId, userId);
  }
  return getTeamForMemberInFile(teamId, userId);
}

export async function saveTeamState(
  teamId: string,
  state: TeamStateRecord
): Promise<void> {
  if (shouldUsePostgres()) {
    return saveTeamStateInPostgres(teamId, state);
  }
  return saveTeamStateInFile(teamId, state);
}

export async function updateLastSeen(
  teamId: string,
  userId: string,
  seenAt: Date
): Promise<void> {
  if (shouldUsePostgres()) {
    return updateLastSeenInPostgres(teamId, userId, seenAt);
  }
  return updateLastSeenInFile(teamId, userId, seenAt);
}

export async function markDeliverableLocked(
  teamId: string,
  auto: boolean
): Promise<void> {
  if (shouldUsePostgres()) {
    return markDeliverableLockedInPostgres(teamId, auto);
  }
  return markDeliverableLockedInFile(teamId, auto);
}

export async function appendMessage(
  teamId: string,
  message: NewMessage
): Promise<Message> {
  if (shouldUsePostgres()) {
    return appendMessageInPostgres(teamId, message);
  }
  return appendMessageInFile(teamId, message);
}

export async function saveDocSnapshot(
  teamId: string,
  kind: DocKind,
  text: string,
  userId: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return saveDocSnapshotInPostgres(teamId, kind, text, userId);
  }
  return saveDocSnapshotInFile(teamId, kind, text, userId);
}

export async function submitScores(
  teamId: string,
  userId: string,
  scores: CriterionScore[]
): Promise<void> {
  if (shouldUsePostgres()) {
    return submitScoresInPostgres(teamId, userId, scores);
  }
  return submitScoresInFile(teamId, userId, scores);
}

export async function revealScores(
  teamId: string,
  revealedAt: Date
): Promise<RevealedScores> {
  if (shouldUsePostgres()) {
    return revealScoresInPostgres(teamId, revealedAt);
  }
  return revealScoresInFile(teamId, revealedAt);
}

export async function getScoresForMember(
  teamId: string,
  userId: string
): Promise<MemberScoreView | null> {
  if (shouldUsePostgres()) {
    return getScoresForMemberInPostgres(teamId, userId);
  }
  return getScoresForMemberInFile(teamId, userId);
}

export async function getScoresForOperator(
  teamId: string
): Promise<OperatorScoreView | null> {
  if (shouldUsePostgres()) {
    return getScoresForOperatorInPostgres(teamId);
  }
  return getScoresForOperatorInFile(teamId);
}

export async function recordAgreement(
  teamId: string,
  userId: string,
  subject: AgreementSubject
): Promise<void> {
  if (shouldUsePostgres()) {
    return recordAgreementInPostgres(teamId, userId, subject);
  }
  return recordAgreementInFile(teamId, userId, subject);
}

export async function recordAbsence(
  teamId: string,
  userId: string,
  stepKey: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return recordAbsenceInPostgres(teamId, userId, stepKey);
  }
  return recordAbsenceInFile(teamId, userId, stepKey);
}

export async function recordNotice(notice: NoticeRecord): Promise<boolean> {
  if (shouldUsePostgres()) {
    return recordNoticeInPostgres(notice);
  }
  return recordNoticeInFile(notice);
}

export async function hasNotice(dedupeKey: string): Promise<boolean> {
  if (shouldUsePostgres()) {
    return hasNoticeInPostgres(dedupeKey);
  }
  return hasNoticeInFile(dedupeKey);
}

export async function addAddendum(
  teamId: string,
  userId: string,
  body: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return addAddendumInPostgres(teamId, userId, body);
  }
  return addAddendumInFile(teamId, userId, body);
}

export async function listAgreements(teamId: string): Promise<AgreementRecord[]> {
  if (shouldUsePostgres()) {
    return listAgreementsInPostgres(teamId);
  }
  return listAgreementsInFile(teamId);
}

export async function listAbsences(teamId: string): Promise<AbsenceRecord[]> {
  if (shouldUsePostgres()) {
    return listAbsencesInPostgres(teamId);
  }
  return listAbsencesInFile(teamId);
}

export async function listAddenda(teamId: string): Promise<AddendumRecord[]> {
  if (shouldUsePostgres()) {
    return listAddendaInPostgres(teamId);
  }
  return listAddendaInFile(teamId);
}
