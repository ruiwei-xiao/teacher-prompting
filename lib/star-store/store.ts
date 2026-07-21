/**
 * StarStore — dual persistence (Postgres + JSON fallback) for personal stars.
 * Mirrors lib/workspace-store/store.ts and lib/app-store/store.ts chooser.
 *
 * Unique key: (userId, appId). Starring upserts and refreshes starredAt.
 * listStarsForUser returns rows ordered by starredAt descending.
 * unstarApp is idempotent. No eligibility logic here (persistence only).
 */
import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import type { StarRecord, StarsFileData } from "./types";

export type { StarRecord, StarsFileData } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DEFAULT_STARS_FILE = path.join(DATA_DIR, "stars.json");

type StarRow = {
  user_id: string;
  app_id: string;
  starred_at: string | Date;
};

let postgresReadyPromise: Promise<void> | null = null;

function starsFilePath(): string {
  return process.env.STARS_DATA_FILE || DEFAULT_STARS_FILE;
}

function shouldUsePostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function rowToStar(row: StarRow): StarRecord {
  return {
    userId: row.user_id,
    appId: row.app_id,
    starredAt: new Date(row.starred_at).toISOString(),
  };
}

function emptyFileData(): StarsFileData {
  return { stars: [] };
}

function sortByStarredAtDesc(a: StarRecord, b: StarRecord): number {
  return new Date(b.starredAt).getTime() - new Date(a.starredAt).getTime();
}

async function ensureFileStore() {
  const filePath = starsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(emptyFileData(), null, 2), "utf-8");
  }
}

async function readFileData(): Promise<StarsFileData> {
  await ensureFileStore();
  const raw = await fs.readFile(starsFilePath(), "utf-8");
  const parsed = JSON.parse(raw) as Partial<StarsFileData>;
  return {
    stars: Array.isArray(parsed.stars) ? parsed.stars : [],
  };
}

async function writeFileData(data: StarsFileData) {
  await ensureFileStore();
  await fs.writeFile(
    starsFilePath(),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

async function ensurePostgresStore() {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS user_stars (
          user_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          starred_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (user_id, app_id)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS user_stars_user_starred_at_idx
        ON user_stars (user_id, starred_at DESC)
      `;
    })();
  }

  return postgresReadyPromise;
}

// --- File implementations ---

async function listStarsForUserInFile(userId: string): Promise<StarRecord[]> {
  const data = await readFileData();
  return data.stars
    .filter((s) => s.userId === userId)
    .slice()
    .sort(sortByStarredAtDesc);
}

async function starAppInFile(
  userId: string,
  appId: string,
  at: Date
): Promise<StarRecord> {
  const data = await readFileData();
  const starredAt = at.toISOString();
  const idx = data.stars.findIndex(
    (s) => s.userId === userId && s.appId === appId
  );
  const record: StarRecord = { userId, appId, starredAt };
  if (idx === -1) {
    data.stars.push(record);
  } else {
    data.stars[idx] = record;
  }
  await writeFileData(data);
  return record;
}

async function unstarAppInFile(userId: string, appId: string): Promise<void> {
  const data = await readFileData();
  const next = data.stars.filter(
    (s) => !(s.userId === userId && s.appId === appId)
  );
  if (next.length === data.stars.length) {
    return;
  }
  data.stars = next;
  await writeFileData(data);
}

// --- Postgres implementations ---

async function listStarsForUserInPostgres(userId: string): Promise<StarRecord[]> {
  await ensurePostgresStore();
  const result = await sql<StarRow>`
    SELECT user_id, app_id, starred_at
    FROM user_stars
    WHERE user_id = ${userId}
    ORDER BY starred_at DESC
  `;
  return result.rows.map(rowToStar);
}

async function starAppInPostgres(
  userId: string,
  appId: string,
  at: Date
): Promise<StarRecord> {
  await ensurePostgresStore();
  const starredAt = at.toISOString();
  await sql`
    INSERT INTO user_stars (user_id, app_id, starred_at)
    VALUES (${userId}, ${appId}, ${starredAt})
    ON CONFLICT (user_id, app_id)
    DO UPDATE SET starred_at = EXCLUDED.starred_at
  `;
  return { userId, appId, starredAt };
}

async function unstarAppInPostgres(userId: string, appId: string): Promise<void> {
  await ensurePostgresStore();
  await sql`
    DELETE FROM user_stars
    WHERE user_id = ${userId} AND app_id = ${appId}
  `;
}

// --- Public façade ---

export async function listStarsForUser(userId: string): Promise<StarRecord[]> {
  if (shouldUsePostgres()) {
    return listStarsForUserInPostgres(userId);
  }
  return listStarsForUserInFile(userId);
}

export async function starApp(
  userId: string,
  appId: string,
  at?: Date
): Promise<StarRecord> {
  const when = at ?? new Date();
  if (shouldUsePostgres()) {
    return starAppInPostgres(userId, appId, when);
  }
  return starAppInFile(userId, appId, when);
}

/** Idempotent: missing star is a no-op. */
export async function unstarApp(userId: string, appId: string): Promise<void> {
  if (shouldUsePostgres()) {
    return unstarAppInPostgres(userId, appId);
  }
  return unstarAppInFile(userId, appId);
}

export async function listStarredAppIds(userId: string): Promise<Set<string>> {
  const stars = await listStarsForUser(userId);
  return new Set(stars.map((s) => s.appId));
}
