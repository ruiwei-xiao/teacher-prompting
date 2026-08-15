/**
 * Client-safe operator-dashboard helpers (Task 7.1).
 * Stuck-queue list, team progress columns, and manual-match picker.
 * Does not import the calibration engine, store, or API modules.
 */

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type StuckWaiterView = {
  checkInId: string;
  userId: string;
  offeringId: string;
  waitedMs: number;
  checkedInAt: string;
};

export type TeamProgressView = {
  teamId: string;
  phase: string;
  members: string[];
  lastActivityAt: string;
  autoFinalized: boolean;
};

export type OperatorDashboardView = {
  offeringId: string;
  stuckWaiters: StuckWaiterView[];
  teams: TeamProgressView[];
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function errorFromBody(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    const trimmed = ((body as { error: string }).error || "").trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/** Operator dashboard page for one offering. */
export function operatePageHref(offeringId: string): string {
  return `/activity/${offeringId}/operate`;
}

/** GET stuck waiters + team progress. */
export function operateDashboardApiHref(offeringId: string): string {
  return `/api/calibration/offerings/${offeringId}/operate`;
}

/** POST manual match { userIds }. */
export function operateMatchApiHref(offeringId: string): string {
  return `/api/calibration/offerings/${offeringId}/operate/match`;
}

/** Read-only inspect page for one team (Task 7.2). */
export function operatorInspectHref(offeringId: string, teamId: string): string {
  return `/activity/${offeringId}/operate/team/${teamId}`;
}

export type InspectorMessage = {
  id: string;
  authorKind: "learner" | "facilitator";
  authorUserId: string | null;
  body: string;
  createdAt?: string;
};

export type InspectorScoreEntry = {
  criterionKey: string;
  value: number;
};

export type InspectorScoreRow = {
  userId: string;
  scores: InspectorScoreEntry[];
};

export type InspectorAbsence = {
  userId: string;
  stepKey: string;
  markedAt: string;
};

export type InspectorAddendum = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
};

export type InspectorDoc = {
  docKind: string;
  snapshotText: string;
  updatedAt: string;
  updatedBy: string;
};

export type InspectorDeliverable = {
  finalRubric: string | null;
  autoFinalized: boolean;
  finalizedAt: string | null;
  addenda: InspectorAddendum[];
};

export type InspectorInspect = {
  role: "operator";
  space: {
    phase: string;
    messages: InspectorMessage[];
    revealedAt: string | null;
    locked: boolean;
  };
  scores: {
    members: InspectorScoreRow[];
    revealedAt: string | null;
  };
  absences: InspectorAbsence[];
  docs: InspectorDoc[];
  finalDeliverable: InspectorDeliverable;
};

export type InspectorView = {
  role: "operator";
  phase: string;
  locked: boolean;
  revealedAt: string | null;
  messages: InspectorMessage[];
  rubricSnapshot: string;
  notesSnapshot: string;
  scores: InspectorScoreRow[];
  absences: InspectorAbsence[];
  finalDeliverable: InspectorDeliverable;
  canPostMessage: false;
  canEditDocs: false;
  canResetClocks: false;
  canAdvancePhase: false;
};

function readInspectorMessage(value: unknown): InspectorMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (record.authorKind !== "learner" && record.authorKind !== "facilitator") {
    return null;
  }
  if (record.authorUserId !== null && typeof record.authorUserId !== "string") {
    return null;
  }
  if (typeof record.body !== "string") return null;
  return {
    id: record.id.trim(),
    authorKind: record.authorKind,
    authorUserId: record.authorUserId,
    body: record.body,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
  };
}

function readInspectorScoreEntry(value: unknown): InspectorScoreEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.criterionKey !== "string" || !record.criterionKey.trim()) {
    return null;
  }
  if (typeof record.value !== "number" || !Number.isFinite(record.value)) {
    return null;
  }
  return { criterionKey: record.criterionKey.trim(), value: record.value };
}

function readInspectorScoreRow(value: unknown): InspectorScoreRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.userId !== "string" || !record.userId.trim()) return null;
  if (!Array.isArray(record.scores)) return null;
  const scores: InspectorScoreEntry[] = [];
  for (const entry of record.scores) {
    const score = readInspectorScoreEntry(entry);
    if (!score) return null;
    scores.push(score);
  }
  return { userId: record.userId.trim(), scores };
}

function readInspectorAbsence(value: unknown): InspectorAbsence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.userId !== "string" || !record.userId.trim()) return null;
  if (typeof record.stepKey !== "string" || !record.stepKey.trim()) return null;
  if (typeof record.markedAt !== "string" || !record.markedAt.trim()) return null;
  return {
    userId: record.userId.trim(),
    stepKey: record.stepKey.trim(),
    markedAt: record.markedAt.trim(),
  };
}

function readInspectorDoc(value: unknown): InspectorDoc | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.docKind !== "string" || !record.docKind.trim()) return null;
  if (typeof record.snapshotText !== "string") return null;
  if (typeof record.updatedAt !== "string" || !record.updatedAt.trim()) return null;
  if (typeof record.updatedBy !== "string" || !record.updatedBy.trim()) return null;
  return {
    docKind: record.docKind.trim(),
    snapshotText: record.snapshotText,
    updatedAt: record.updatedAt.trim(),
    updatedBy: record.updatedBy.trim(),
  };
}

function readInspectorAddendum(value: unknown): InspectorAddendum | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (typeof record.userId !== "string" || !record.userId.trim()) return null;
  if (typeof record.body !== "string") return null;
  if (typeof record.createdAt !== "string" || !record.createdAt.trim()) {
    return null;
  }
  return {
    id: record.id.trim(),
    userId: record.userId.trim(),
    body: record.body,
    createdAt: record.createdAt.trim(),
  };
}

function readInspectorDeliverable(value: unknown): InspectorDeliverable | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.finalRubric !== null && typeof record.finalRubric !== "string") {
    return null;
  }
  if (typeof record.autoFinalized !== "boolean") return null;
  if (record.finalizedAt !== null && typeof record.finalizedAt !== "string") {
    return null;
  }
  if (!Array.isArray(record.addenda)) return null;
  const addenda: InspectorAddendum[] = [];
  for (const entry of record.addenda) {
    const addendum = readInspectorAddendum(entry);
    if (!addendum) return null;
    addenda.push(addendum);
  }
  return {
    finalRubric: record.finalRubric,
    autoFinalized: record.autoFinalized,
    finalizedAt: record.finalizedAt,
    addenda,
  };
}

function latestSnapshot(docs: InspectorDoc[], docKind: string): string {
  let text = "";
  for (const doc of docs) {
    if (doc.docKind === docKind) text = doc.snapshotText;
  }
  return text;
}

/** Parse inspectTeam JSON. 403/401 stay errors so the page can deny non-operators. */
export function parseInspect(
  status: number,
  body: unknown
): ParseResult<{ inspect: InspectorInspect }> {
  if (status !== 200) {
    return { ok: false, error: errorFromBody(body, "Failed to load team inspect") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid inspect response" };
  }
  const record = body as Record<string, unknown>;
  if (record.role !== "operator") {
    return { ok: false, error: "Invalid inspect response" };
  }
  if (!record.space || typeof record.space !== "object" || Array.isArray(record.space)) {
    return { ok: false, error: "Invalid inspect response" };
  }
  const space = record.space as Record<string, unknown>;
  if (typeof space.phase !== "string" || !space.phase.trim()) {
    return { ok: false, error: "Invalid inspect response" };
  }
  if (!Array.isArray(space.messages)) {
    return { ok: false, error: "Invalid inspect response" };
  }
  const messages: InspectorMessage[] = [];
  for (const entry of space.messages) {
    const message = readInspectorMessage(entry);
    if (!message) return { ok: false, error: "Invalid inspect response" };
    messages.push(message);
  }
  if (space.revealedAt !== null && typeof space.revealedAt !== "string") {
    return { ok: false, error: "Invalid inspect response" };
  }
  if (typeof space.locked !== "boolean") {
    return { ok: false, error: "Invalid inspect response" };
  }
  if (!record.scores || typeof record.scores !== "object" || Array.isArray(record.scores)) {
    return { ok: false, error: "Invalid inspect response" };
  }
  const scoresRecord = record.scores as Record<string, unknown>;
  if (!Array.isArray(scoresRecord.members)) {
    return { ok: false, error: "Invalid inspect response" };
  }
  const members: InspectorScoreRow[] = [];
  for (const entry of scoresRecord.members) {
    const row = readInspectorScoreRow(entry);
    if (!row) return { ok: false, error: "Invalid inspect response" };
    members.push(row);
  }
  if (scoresRecord.revealedAt !== null && typeof scoresRecord.revealedAt !== "string") {
    return { ok: false, error: "Invalid inspect response" };
  }
  if (!Array.isArray(record.absences) || !Array.isArray(record.docs)) {
    return { ok: false, error: "Invalid inspect response" };
  }
  const absences: InspectorAbsence[] = [];
  for (const entry of record.absences) {
    const absence = readInspectorAbsence(entry);
    if (!absence) return { ok: false, error: "Invalid inspect response" };
    absences.push(absence);
  }
  const docs: InspectorDoc[] = [];
  for (const entry of record.docs) {
    const doc = readInspectorDoc(entry);
    if (!doc) return { ok: false, error: "Invalid inspect response" };
    docs.push(doc);
  }
  const finalDeliverable = readInspectorDeliverable(record.finalDeliverable);
  if (!finalDeliverable) {
    return { ok: false, error: "Invalid inspect response" };
  }
  return {
    ok: true,
    inspect: {
      role: "operator",
      space: {
        phase: space.phase.trim(),
        messages,
        revealedAt: space.revealedAt,
        locked: space.locked,
      },
      scores: {
        members,
        revealedAt: scoresRecord.revealedAt,
      },
      absences,
      docs,
      finalDeliverable,
    },
  };
}

/**
 * Operator inspector view. Held numeric scores come from inspect.scores.members
 * even when space.revealedAt is null. Viewer flags stay closed (14.6).
 */
export function buildInspectorView(inspect: InspectorInspect): InspectorView {
  return {
    role: "operator",
    phase: inspect.space.phase,
    locked: inspect.space.locked,
    revealedAt: inspect.scores.revealedAt ?? inspect.space.revealedAt,
    messages: inspect.space.messages.map((message) => ({ ...message })),
    rubricSnapshot: latestSnapshot(inspect.docs, "rubric"),
    notesSnapshot: latestSnapshot(inspect.docs, "notes"),
    scores: inspect.scores.members.map((row) => ({
      userId: row.userId,
      scores: row.scores.map((score) => ({ ...score })),
    })),
    absences: inspect.absences.map((row) => ({ ...row })),
    finalDeliverable: {
      finalRubric: inspect.finalDeliverable.finalRubric,
      autoFinalized: inspect.finalDeliverable.autoFinalized,
      finalizedAt: inspect.finalDeliverable.finalizedAt,
      addenda: inspect.finalDeliverable.addenda.map((row) => ({ ...row })),
    },
    canPostMessage: false,
    canEditDocs: false,
    canResetClocks: false,
    canAdvancePhase: false,
  };
}

/** Confirm only when exactly three distinct non-empty ids are selected. */
export function canConfirmManualMatch(ids: string[]): boolean {
  const trimmed = ids.map((id) => id.trim()).filter((id) => id.length > 0);
  return trimmed.length === 3 && new Set(trimmed).size === 3;
}

/** POST /operate/match body. Team size is the literal 3. */
export function matchPostBody(ids: string[]): { userIds: string[] } {
  return { userIds: ids.map((id) => id.trim()) };
}

/** Human-readable wait duration for 10–14 day stuck waiters. */
export function formatWaitDuration(waitedMs: number): string {
  const ms = Number.isFinite(waitedMs) ? Math.max(0, Math.floor(waitedMs)) : 0;
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  return `${days}d ${hours}h`;
}

function readStuckWaiter(value: unknown): StuckWaiterView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.checkInId !== "string" || !record.checkInId.trim()) return null;
  if (typeof record.userId !== "string" || !record.userId.trim()) return null;
  if (typeof record.offeringId !== "string" || !record.offeringId.trim()) {
    return null;
  }
  if (typeof record.waitedMs !== "number" || !Number.isFinite(record.waitedMs)) {
    return null;
  }
  if (typeof record.checkedInAt !== "string" || !record.checkedInAt.trim()) {
    return null;
  }
  return {
    checkInId: record.checkInId.trim(),
    userId: record.userId.trim(),
    offeringId: record.offeringId.trim(),
    waitedMs: record.waitedMs,
    checkedInAt: record.checkedInAt.trim(),
  };
}

function readTeamProgress(value: unknown): TeamProgressView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.teamId !== "string" || !record.teamId.trim()) return null;
  if (typeof record.phase !== "string" || !record.phase.trim()) return null;
  if (!Array.isArray(record.members)) return null;
  const members: string[] = [];
  for (const member of record.members) {
    if (typeof member !== "string" || !member.trim()) return null;
    members.push(member.trim());
  }
  if (typeof record.lastActivityAt !== "string" || !record.lastActivityAt.trim()) {
    return null;
  }
  if (typeof record.autoFinalized !== "boolean") return null;
  return {
    teamId: record.teamId.trim(),
    phase: record.phase.trim(),
    members,
    lastActivityAt: record.lastActivityAt.trim(),
    autoFinalized: record.autoFinalized,
  };
}

/** Parse GET /operate JSON. 403/401 stay errors so the page can deny non-operators. */
export function parseDashboardResponse(
  status: number,
  body: unknown
): ParseResult<{ view: OperatorDashboardView }> {
  if (status !== 200) {
    return { ok: false, error: errorFromBody(body, "Failed to load operator dashboard") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid dashboard response" };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.offeringId !== "string" || !record.offeringId.trim()) {
    return { ok: false, error: "Invalid dashboard response" };
  }
  if (!Array.isArray(record.stuckWaiters) || !Array.isArray(record.teams)) {
    return { ok: false, error: "Invalid dashboard response" };
  }
  const stuckWaiters: StuckWaiterView[] = [];
  for (const row of record.stuckWaiters) {
    const waiter = readStuckWaiter(row);
    if (!waiter) return { ok: false, error: "Invalid dashboard response" };
    stuckWaiters.push(waiter);
  }
  const teams: TeamProgressView[] = [];
  for (const row of record.teams) {
    const team = readTeamProgress(row);
    if (!team) return { ok: false, error: "Invalid dashboard response" };
    teams.push(team);
  }
  return {
    ok: true,
    view: {
      offeringId: record.offeringId.trim(),
      stuckWaiters,
      teams,
    },
  };
}

/** Parse POST /operate/match JSON. 400 leaves the queue unchanged on the server. */
export function parseMatchResponse(
  status: number,
  body: unknown
): ParseResult<{ teamId: string }> {
  if (status !== 200) {
    return { ok: false, error: errorFromBody(body, "Failed to form team") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid match response" };
  }
  const team = (body as { team?: unknown }).team;
  if (!team || typeof team !== "object" || Array.isArray(team)) {
    return { ok: false, error: "Invalid match response" };
  }
  const teamId = (team as { id?: unknown }).id;
  if (typeof teamId !== "string" || !teamId.trim()) {
    return { ok: false, error: "Invalid match response" };
  }
  return { ok: true, teamId: teamId.trim() };
}
