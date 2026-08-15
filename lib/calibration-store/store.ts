/**
 * CalibrationStore — dual persistence (Postgres + JSON fallback) for
 * offerings, check-ins, teams, members, messages, and document snapshots.
 * Mirrors lib/workspace-store/store.ts and lib/star-store/store.ts.
 *
 * Task 1.2: offerings, queue, teams, chat, docs. Scores/reveal/agreements/
 * absences/notices/addenda belong to task 1.3.
 */
import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import type {
  CalibrationFileData,
  CheckIn,
  CheckInStatus,
  DocKind,
  DocSnapshot,
  Message,
  NewMessage,
  Offering,
  OfferingInput,
  StoredTeam,
  Team,
  TeamMember,
  TeamPhase,
  TeamStateRecord,
  TeamView,
} from "./types";

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
  };
}

function initialTeamState(): TeamStateRecord {
  return {
    phase: "critique",
    round: 1,
    presenterIndex: 0,
    perPersonDeadlines: [],
    groupDeadline: null,
    flaggedCriteria: [],
    absenceStepKeys: [],
    agreementSets: { merge_complete: [], final_consensus: [] },
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

async function checkInInFile(offeringId: string, userId: string): Promise<CheckIn> {
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
    checkedInAt: new Date().toISOString(),
    lastPingAt: null,
    missedPings: 0,
    teamId: null,
  };
  data.checkIns.push(record);
  await writeFileData(data);
  return record;
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
  const state = initialTeamState();
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
  userId: string
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
    checkedInAt: new Date().toISOString(),
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
  const state = initialTeamState();
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

export async function checkIn(offeringId: string, userId: string): Promise<CheckIn> {
  if (shouldUsePostgres()) {
    return checkInInPostgres(offeringId, userId);
  }
  return checkInInFile(offeringId, userId);
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
