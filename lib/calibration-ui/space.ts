/**
 * Client-safe team-space helpers (Task 5.2).
 * Polling, recap, role labels, and chat post body.
 * Does not import the calibration engine, store, or API modules.
 */
import { applyPersonLabels, readUserLabels } from "@/lib/auth/user-label";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export const SPACE_POLL_MS = 10_000;

/** Faster poll while the tab is visible so teammates' chat arrives without a reload. */
export const SPACE_VISIBLE_POLL_MS = 3_000;

export type SpaceMessage = {
  id: string;
  authorKind: "learner" | "facilitator";
  authorUserId: string | null;
  body: string;
  createdAt?: string;
  kind?: string;
};

export type SpaceRecapView = {
  since: string | null;
  messages: SpaceMessage[];
};

export type SpaceScoreEntry = {
  criterionKey: string;
  value: number;
};

export type SpaceMatrixRow = {
  userId: string;
  scores: SpaceScoreEntry[];
};

export type SpaceView = {
  role: "member" | "operator";
  phase: string;
  round: number;
  critiqueStage: string;
  presenterUserId: string | null;
  criticUserIds: string[];
  recap: SpaceRecapView;
  messages: SpaceMessage[];
  locked: boolean;
  ownScores: SpaceScoreEntry[];
  submittedBy: string[];
  revealedAt: string | null;
  matrix: SpaceMatrixRow[];
  memberUserIds: string[];
  readyUserIds: string[];
  labels: Record<string, string>;
  avatars: Record<string, string>;
};

export type RoundRoleLabel = "Presenter" | "Critic";

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

export function spaceApiHref(teamId: string): string {
  return `/api/calibration/teams/${teamId}`;
}

export function messagesApiHref(teamId: string): string {
  return `/api/calibration/teams/${teamId}/messages`;
}

export function messagePostBody(text: string): { body: string } {
  return { body: text.trim() };
}

/**
 * Presenter / Critic only while the team is in the current critique round.
 * Returns null in every other phase and for anyone who is not assigned.
 */
export function currentRoundRoleLabel(
  space: Pick<SpaceView, "phase" | "presenterUserId" | "criticUserIds">,
  userId: string
): RoundRoleLabel | null {
  if (space.phase !== "critique") return null;
  if (space.presenterUserId && space.presenterUserId === userId) {
    return "Presenter";
  }
  if (space.criticUserIds.includes(userId)) {
    return "Critic";
  }
  return null;
}

export function isFacilitatorMessage(
  message: Pick<SpaceMessage, "authorKind">
): boolean {
  return message.authorKind === "facilitator";
}

export function labeledMessageBody(
  body: string,
  labels: Record<string, string>
): string {
  return applyPersonLabels(body, labels);
}

export function recapMessages(space: Pick<SpaceView, "recap">): SpaceMessage[] {
  return space.recap.messages;
}

/** Kickoff already lives in group chat; only surface missed messages on return. */
export function isReturnVisitRecap(space: Pick<SpaceView, "recap">): boolean {
  return Boolean(space.recap.since) && space.recap.messages.length > 0;
}

export function canCompose(space: Pick<SpaceView, "role">): boolean {
  return space.role === "member";
}

const PHASE_BANNER: Record<string, string> = {
  critique: "Critique",
  merge: "Shared rubric",
  scoring: "Private scoring",
  discussion: "Discuss scores",
  consensus: "Confirm final rubric",
  finalized: "Final rubric",
};

export function phaseBannerLabel(
  space: Pick<SpaceView, "phase" | "round">
): string {
  const name = PHASE_BANNER[space.phase] ?? (space.phase || "Team space");
  if (space.phase === "critique" && Number.isFinite(space.round) && space.round > 0) {
    return `${name} · Round ${space.round}`;
  }
  return name;
}

/** Keep the recap from the start of this visit while polls refresh chat/phase. */
export function retainVisitRecap(previous: SpaceView, next: SpaceView): SpaceView {
  return { ...next, recap: previous.recap };
}

function readMessage(value: unknown): SpaceMessage | null {
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
    id: record.id,
    authorKind: record.authorKind,
    authorUserId: record.authorUserId,
    body: record.body,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    kind: typeof record.kind === "string" ? record.kind : undefined,
  };
}

function readMessages(value: unknown): SpaceMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages: SpaceMessage[] = [];
  for (const entry of value) {
    const message = readMessage(entry);
    if (!message) return null;
    messages.push(message);
  }
  return messages;
}

function readScoreEntry(value: unknown): SpaceScoreEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.criterionKey !== "string" || !record.criterionKey.trim()) {
    return null;
  }
  if (typeof record.value !== "number" || !Number.isFinite(record.value)) {
    return null;
  }
  return { criterionKey: record.criterionKey, value: record.value };
}

function readOwnScores(value: unknown): SpaceScoreEntry[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const scores: SpaceScoreEntry[] = [];
  for (const entry of value) {
    const row = readScoreEntry(entry);
    if (!row) return null;
    scores.push(row);
  }
  return scores;
}

function readSubmittedBy(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (!value.every((id) => typeof id === "string")) return null;
  return value;
}

function readRevealedAt(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function readMatrix(value: unknown): SpaceMatrixRow[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const rows: SpaceMatrixRow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.userId !== "string") return null;
    const scores = readOwnScores(record.scores);
    if (!scores) return null;
    rows.push({ userId: record.userId, scores });
  }
  return rows;
}

function readSpaceView(body: unknown): SpaceView | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.role !== "member" && record.role !== "operator") return null;
  if (typeof record.phase !== "string" || !record.phase.trim()) return null;
  if (typeof record.round !== "number" || !Number.isFinite(record.round)) return null;
  if (typeof record.critiqueStage !== "string") return null;
  if (record.presenterUserId !== null && typeof record.presenterUserId !== "string") {
    return null;
  }
  if (!Array.isArray(record.criticUserIds)) return null;
  if (!record.criticUserIds.every((id) => typeof id === "string")) return null;
  if (typeof record.locked !== "boolean") return null;
  if (!record.recap || typeof record.recap !== "object" || Array.isArray(record.recap)) {
    return null;
  }
  const recapRecord = record.recap as Record<string, unknown>;
  if (recapRecord.since !== null && typeof recapRecord.since !== "string") {
    return null;
  }
  const recapList = readMessages(recapRecord.messages);
  const messages = readMessages(record.messages);
  const ownScores = readOwnScores(record.ownScores);
  const submittedBy = readSubmittedBy(record.submittedBy);
  const revealedAt = readRevealedAt(record.revealedAt);
  const matrix = readMatrix(record.matrix);
  const memberUserIds = readSubmittedBy(record.memberUserIds);
  const readyUserIds = readSubmittedBy(record.readyUserIds);
  if (!recapList || !messages || !ownScores || !submittedBy || revealedAt === undefined || !matrix || !memberUserIds || !readyUserIds) {
    return null;
  }
  return {
    role: record.role,
    phase: record.phase.trim(),
    round: record.round,
    critiqueStage: record.critiqueStage,
    presenterUserId: record.presenterUserId,
    criticUserIds: record.criticUserIds,
    recap: { since: recapRecord.since, messages: recapList },
    messages,
    locked: record.locked,
    ownScores,
    submittedBy,
    revealedAt,
    matrix,
    memberUserIds,
    readyUserIds,
    labels: readUserLabels(record.labels),
    avatars: readUserLabels(record.avatars),
  };
}

export function parseSpaceResponse(
  status: number,
  body: unknown
): ParseResult<{ space: SpaceView }> {
  if (status !== 200) {
    return { ok: false, error: errorFromBody(body, "Failed to load team space") };
  }
  const space = readSpaceView(body);
  if (!space) {
    return { ok: false, error: errorFromBody(body, "Invalid space response") };
  }
  return { ok: true, space };
}

export function parsePostedMessageResponse(
  status: number,
  body: unknown
): ParseResult<{ message: SpaceMessage; space: SpaceView }> {
  if (status !== 200) {
    return { ok: false, error: errorFromBody(body, "Failed to post message") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid message response" };
  }
  const message = readMessage((body as { message?: unknown }).message);
  const space = readSpaceView((body as { space?: unknown }).space);
  if (!message || !space) {
    return { ok: false, error: errorFromBody(body, "Invalid message response") };
  }
  return { ok: true, message, space };
}

export function applyPostedMessage(
  _current: SpaceView,
  posted: { message: SpaceMessage; space: SpaceView }
): SpaceView {
  return posted.space;
}
