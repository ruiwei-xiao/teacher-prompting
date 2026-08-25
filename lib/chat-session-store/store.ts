/**
 * ChatSessionStore — dual persistence (Postgres + JSON fallback) for
 * recorded bot conversations.
 * Mirrors lib/star-store/store.ts and lib/calibration-store/store.ts chooser.
 *
 * upsertSessionTurn creates on first turn and replaces the transcript later.
 * Identity (appId + participantId) must match an existing row.
 * shared may start false or stay false, but never flips unshared → shared.
 * listSessionsForApp is shared-only; listSessionsForUser excludes anonymous.
 * disableSharing is true→false only; discardSession deletes the row.
 */
import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import { getAppById } from "@/lib/app-store/store";
import type {
  ChatSessionRecord,
  ChatSessionsFileData,
  ListPage,
  SessionSummary,
  SessionSurface,
  StoredChatMessage,
  UpsertSessionTurnInput,
} from "./types";

export type {
  ChatSessionRecord,
  ChatSessionsFileData,
  ListPage,
  SessionSummary,
  SessionSurface,
  StoredChatMessage,
  UpsertSessionTurnInput,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DEFAULT_SESSIONS_FILE = path.join(DATA_DIR, "chat-sessions.json");

type ChatSessionRow = {
  id: string;
  app_id: string;
  app_name: string;
  owner_id: string;
  participant_id: string | null;
  participant_name: string | null;
  surface: string;
  shared: boolean;
  messages: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

let postgresReadyPromise: Promise<void> | null = null;

function sessionsFilePath(): string {
  return process.env.CHAT_SESSIONS_DATA_FILE || DEFAULT_SESSIONS_FILE;
}

function shouldUsePostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function emptyFileData(): ChatSessionsFileData {
  return { sessions: [] };
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function parseSurface(value: unknown): SessionSurface {
  if (value === "public" || value === "editor-test") {
    return value;
  }
  throw new Error("Invalid session surface.");
}

function parseMessages(raw: unknown): StoredChatMessage[] {
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed)) {
    return [];
  }
  const messages: StoredChatMessage[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (
      (record.role !== "user" && record.role !== "assistant") ||
      typeof record.content !== "string"
    ) {
      continue;
    }
    const message: StoredChatMessage = {
      role: record.role,
      content: record.content,
      at: typeof record.at === "string" ? record.at : "",
    };
    if (record.imageOmitted === true) {
      message.imageOmitted = true;
    }
    messages.push(message);
  }
  return messages;
}

function normalizeMessages(
  messages: StoredChatMessage[],
  fallbackAt: string
): StoredChatMessage[] {
  return messages.map((message) => {
    const at =
      typeof message.at === "string" && message.at.trim()
        ? message.at
        : fallbackAt;
    const normalized: StoredChatMessage = {
      role: message.role,
      content: message.content,
      at,
    };
    if (message.imageOmitted === true) {
      normalized.imageOmitted = true;
    }
    return normalized;
  });
}

function identitiesMatch(
  existing: Pick<ChatSessionRecord, "appId" | "participantId">,
  input: Pick<UpsertSessionTurnInput, "appId" | "participantId">
): boolean {
  return (
    existing.appId === input.appId &&
    existing.participantId === input.participantId
  );
}

function nextShared(existingShared: boolean, requested?: boolean): boolean {
  if (!existingShared) {
    return false;
  }
  if (requested === false) {
    return false;
  }
  return true;
}

function applyTurn(
  existing: ChatSessionRecord | null,
  input: UpsertSessionTurnInput,
  now: string
): ChatSessionRecord {
  const messages = normalizeMessages(input.messages, now);
  if (!existing) {
    return {
      id: input.id,
      appId: input.appId,
      appName: input.appName,
      ownerId: input.ownerId,
      participantId: input.participantId,
      participantName: input.participantName,
      surface: input.surface,
      shared: input.shared ?? true,
      messages,
      createdAt: now,
      updatedAt: now,
    };
  }
  if (!identitiesMatch(existing, input)) {
    throw new Error("Session identity mismatch.");
  }
  return {
    ...existing,
    messages,
    shared: nextShared(existing.shared, input.shared),
    updatedAt: now,
  };
}

function rowToSession(row: ChatSessionRow): ChatSessionRecord {
  return {
    id: row.id,
    appId: row.app_id,
    appName: row.app_name,
    ownerId: row.owner_id,
    participantId: row.participant_id,
    participantName: row.participant_name,
    surface: parseSurface(row.surface),
    shared: Boolean(row.shared),
    messages: parseMessages(row.messages),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function compareRecency(a: ChatSessionRecord, b: ChatSessionRecord): number {
  if (a.updatedAt === b.updatedAt) {
    return b.id.localeCompare(a.id);
  }
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

function toSummary(
  session: ChatSessionRecord,
  appExists: boolean
): SessionSummary {
  const { messages, ...rest } = session;
  return {
    ...rest,
    messageCount: messages.length,
    appExists,
  };
}

async function resolveAppExists(
  appIds: string[]
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(appIds)];
  const entries = await Promise.all(
    uniqueIds.map(async (appId) => {
      const app = await getAppById(appId);
      return [appId, app !== null] as const;
    })
  );
  return new Map(entries);
}

async function toSummaries(
  sessions: ChatSessionRecord[]
): Promise<SessionSummary[]> {
  const existence = await resolveAppExists(
    sessions.map((session) => session.appId)
  );
  return sessions.map((session) =>
    toSummary(session, existence.get(session.appId) === true)
  );
}

function paginateRecords(
  records: ChatSessionRecord[],
  opts: { limit: number; offset: number }
): { items: ChatSessionRecord[]; hasMore: boolean } {
  const sliced = records.slice(opts.offset, opts.offset + opts.limit + 1);
  const hasMore = sliced.length > opts.limit;
  return {
    items: hasMore ? sliced.slice(0, opts.limit) : sliced,
    hasMore,
  };
}

async function ensureFileStore() {
  const filePath = sessionsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(emptyFileData(), null, 2), "utf-8");
  }
}

async function readFileData(): Promise<ChatSessionsFileData> {
  await ensureFileStore();
  const raw = await fs.readFile(sessionsFilePath(), "utf-8");
  const parsed = JSON.parse(raw) as Partial<ChatSessionsFileData>;
  return {
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
}

async function writeFileData(data: ChatSessionsFileData) {
  await ensureFileStore();
  await fs.writeFile(
    sessionsFilePath(),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

async function ensurePostgresStore() {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          app_name TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          participant_id TEXT,
          participant_name TEXT,
          surface TEXT NOT NULL CHECK (surface IN ('public', 'editor-test')),
          shared BOOLEAN NOT NULL DEFAULT TRUE,
          messages JSONB NOT NULL DEFAULT '[]',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_app
        ON chat_sessions (app_id, updated_at DESC)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_participant
        ON chat_sessions (participant_id, updated_at DESC)
      `;
    })();
  }

  return postgresReadyPromise;
}

// --- File implementations ---

async function getSessionByIdInFile(
  id: string
): Promise<ChatSessionRecord | null> {
  const data = await readFileData();
  return data.sessions.find((session) => session.id === id) ?? null;
}

async function upsertSessionTurnInFile(
  input: UpsertSessionTurnInput
): Promise<void> {
  const data = await readFileData();
  const index = data.sessions.findIndex((session) => session.id === input.id);
  const existing = index === -1 ? null : data.sessions[index]!;
  const next = applyTurn(existing, input, new Date().toISOString());
  if (index === -1) {
    data.sessions.push(next);
  } else {
    data.sessions[index] = next;
  }
  await writeFileData(data);
}

async function listSessionsForAppInFile(
  appId: string,
  opts: { limit: number; offset: number }
): Promise<ListPage<SessionSummary>> {
  const data = await readFileData();
  const matched = data.sessions
    .filter((session) => session.appId === appId && session.shared)
    .sort(compareRecency);
  const page = paginateRecords(matched, opts);
  return {
    items: await toSummaries(page.items),
    hasMore: page.hasMore,
  };
}

async function listSessionsForUserInFile(
  userId: string,
  opts: { limit: number; offset: number }
): Promise<ListPage<SessionSummary>> {
  const data = await readFileData();
  const matched = data.sessions
    .filter((session) => session.participantId === userId)
    .sort(compareRecency);
  const page = paginateRecords(matched, opts);
  return {
    items: await toSummaries(page.items),
    hasMore: page.hasMore,
  };
}

async function disableSharingInFile(id: string): Promise<void> {
  const data = await readFileData();
  const session = data.sessions.find((item) => item.id === id);
  if (!session || !session.shared) {
    return;
  }
  session.shared = false;
  await writeFileData(data);
}

async function discardSessionInFile(id: string): Promise<void> {
  const data = await readFileData();
  const next = data.sessions.filter((session) => session.id !== id);
  if (next.length === data.sessions.length) {
    return;
  }
  await writeFileData({ sessions: next });
}

// --- Postgres implementations ---

async function getSessionByIdInPostgres(
  id: string
): Promise<ChatSessionRecord | null> {
  await ensurePostgresStore();
  const result = await sql<ChatSessionRow>`
    SELECT
      id, app_id, app_name, owner_id, participant_id, participant_name,
      surface, shared, messages, created_at, updated_at
    FROM chat_sessions
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = result.rows[0];
  return row ? rowToSession(row) : null;
}

async function upsertSessionTurnInPostgres(
  input: UpsertSessionTurnInput
): Promise<void> {
  await ensurePostgresStore();
  const existing = await getSessionByIdInPostgres(input.id);
  const next = applyTurn(existing, input, new Date().toISOString());
  const messagesJson = JSON.stringify(next.messages);
  if (!existing) {
    await sql`
      INSERT INTO chat_sessions (
        id, app_id, app_name, owner_id, participant_id, participant_name,
        surface, shared, messages, created_at, updated_at
      )
      VALUES (
        ${next.id},
        ${next.appId},
        ${next.appName},
        ${next.ownerId},
        ${next.participantId},
        ${next.participantName},
        ${next.surface},
        ${next.shared},
        ${messagesJson},
        ${next.createdAt},
        ${next.updatedAt}
      )
    `;
    return;
  }
  await sql`
    UPDATE chat_sessions
    SET
      messages = ${messagesJson},
      shared = ${next.shared},
      updated_at = ${next.updatedAt}
    WHERE id = ${next.id}
  `;
}

async function pageFromRows(
  rows: ChatSessionRow[],
  limit: number
): Promise<ListPage<SessionSummary>> {
  const sessions = rows.map(rowToSession);
  const hasMore = sessions.length > limit;
  const page = hasMore ? sessions.slice(0, limit) : sessions;
  return {
    items: await toSummaries(page),
    hasMore,
  };
}

async function listSessionsForAppInPostgres(
  appId: string,
  opts: { limit: number; offset: number }
): Promise<ListPage<SessionSummary>> {
  await ensurePostgresStore();
  const result = await sql<ChatSessionRow>`
    SELECT
      id, app_id, app_name, owner_id, participant_id, participant_name,
      surface, shared, messages, created_at, updated_at
    FROM chat_sessions
    WHERE app_id = ${appId} AND shared = TRUE
    ORDER BY updated_at DESC
    LIMIT ${opts.limit + 1} OFFSET ${opts.offset}
  `;
  return pageFromRows(result.rows, opts.limit);
}

async function listSessionsForUserInPostgres(
  userId: string,
  opts: { limit: number; offset: number }
): Promise<ListPage<SessionSummary>> {
  await ensurePostgresStore();
  const result = await sql<ChatSessionRow>`
    SELECT
      id, app_id, app_name, owner_id, participant_id, participant_name,
      surface, shared, messages, created_at, updated_at
    FROM chat_sessions
    WHERE participant_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${opts.limit + 1} OFFSET ${opts.offset}
  `;
  return pageFromRows(result.rows, opts.limit);
}

async function disableSharingInPostgres(id: string): Promise<void> {
  await ensurePostgresStore();
  await sql`
    UPDATE chat_sessions
    SET shared = FALSE
    WHERE id = ${id} AND shared = TRUE
  `;
}

async function discardSessionInPostgres(id: string): Promise<void> {
  await ensurePostgresStore();
  await sql`
    DELETE FROM chat_sessions
    WHERE id = ${id}
  `;
}

// --- Public façade ---

export async function getSessionById(
  id: string
): Promise<ChatSessionRecord | null> {
  if (shouldUsePostgres()) {
    return getSessionByIdInPostgres(id);
  }
  return getSessionByIdInFile(id);
}

export async function upsertSessionTurn(
  input: UpsertSessionTurnInput
): Promise<void> {
  if (shouldUsePostgres()) {
    return upsertSessionTurnInPostgres(input);
  }
  return upsertSessionTurnInFile(input);
}

export async function listSessionsForApp(
  appId: string,
  opts: { limit: number; offset: number }
): Promise<ListPage<SessionSummary>> {
  if (shouldUsePostgres()) {
    return listSessionsForAppInPostgres(appId, opts);
  }
  return listSessionsForAppInFile(appId, opts);
}

export async function listSessionsForUser(
  userId: string,
  opts: { limit: number; offset: number }
): Promise<ListPage<SessionSummary>> {
  if (shouldUsePostgres()) {
    return listSessionsForUserInPostgres(userId, opts);
  }
  return listSessionsForUserInFile(userId, opts);
}

export async function disableSharing(id: string): Promise<void> {
  if (shouldUsePostgres()) {
    return disableSharingInPostgres(id);
  }
  return disableSharingInFile(id);
}

export async function discardSession(id: string): Promise<void> {
  if (shouldUsePostgres()) {
    return discardSessionInPostgres(id);
  }
  return discardSessionInFile(id);
}
