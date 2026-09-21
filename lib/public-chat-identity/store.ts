/**
 * AnonymousVisitorStore — dual persistence (Postgres + JSON fallback) for
 * visitor-to-account links.
 * Mirrors lib/star-store/store.ts chooser.
 *
 * Unique key: (anonymousVisitorId, userId). Repeating the same pair is a
 * no-op. The same visitor id may later also link to a different user.
 */
import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import type {
  AnonymousVisitorLink,
  AnonymousVisitorLinksFileData,
} from "./types";

export type { AnonymousVisitorLink, AnonymousVisitorLinksFileData } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DEFAULT_LINKS_FILE = path.join(DATA_DIR, "anonymous-visitor-links.json");

type AnonymousVisitorLinkRow = {
  anonymous_visitor_id: string;
  user_id: string;
  linked_at: string | Date;
};

let postgresReadyPromise: Promise<void> | null = null;

function linksFilePath(): string {
  return process.env.ANONYMOUS_VISITOR_LINKS_DATA_FILE || DEFAULT_LINKS_FILE;
}

function shouldUsePostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function rowToLink(row: AnonymousVisitorLinkRow): AnonymousVisitorLink {
  return {
    anonymousVisitorId: row.anonymous_visitor_id,
    userId: row.user_id,
    linkedAt: new Date(row.linked_at).toISOString(),
  };
}

function emptyFileData(): AnonymousVisitorLinksFileData {
  return { links: [] };
}

function isSamePair(
  link: AnonymousVisitorLink,
  anonymousVisitorId: string,
  userId: string
): boolean {
  return (
    link.anonymousVisitorId === anonymousVisitorId && link.userId === userId
  );
}

async function ensureFileStore() {
  const filePath = linksFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(emptyFileData(), null, 2), "utf-8");
  }
}

async function readFileData(): Promise<AnonymousVisitorLinksFileData> {
  await ensureFileStore();
  const raw = await fs.readFile(linksFilePath(), "utf-8");
  const parsed = JSON.parse(raw) as Partial<AnonymousVisitorLinksFileData>;
  return {
    links: Array.isArray(parsed.links) ? parsed.links : [],
  };
}

async function writeFileData(data: AnonymousVisitorLinksFileData) {
  await ensureFileStore();
  await fs.writeFile(
    linksFilePath(),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

async function ensurePostgresStore() {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS anonymous_visitor_links (
          anonymous_visitor_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (anonymous_visitor_id, user_id)
        )
      `;
    })();
  }

  return postgresReadyPromise;
}

// --- File implementations ---

async function rememberAnonymousVisitorLinkInFile(
  anonymousVisitorId: string,
  userId: string
): Promise<void> {
  const data = await readFileData();
  const exists = data.links.some((link) =>
    isSamePair(link, anonymousVisitorId, userId)
  );
  if (exists) {
    return;
  }
  data.links.push({
    anonymousVisitorId,
    userId,
    linkedAt: new Date().toISOString(),
  });
  await writeFileData(data);
}

async function listAnonymousVisitorLinksForVisitorInFile(
  anonymousVisitorId: string
): Promise<AnonymousVisitorLink[]> {
  const data = await readFileData();
  return data.links.filter(
    (link) => link.anonymousVisitorId === anonymousVisitorId
  );
}

// --- Postgres implementations ---

async function rememberAnonymousVisitorLinkInPostgres(
  anonymousVisitorId: string,
  userId: string
): Promise<void> {
  await ensurePostgresStore();
  const linkedAt = new Date().toISOString();
  await sql`
    INSERT INTO anonymous_visitor_links (anonymous_visitor_id, user_id, linked_at)
    VALUES (${anonymousVisitorId}, ${userId}, ${linkedAt})
    ON CONFLICT (anonymous_visitor_id, user_id) DO NOTHING
  `;
}

async function listAnonymousVisitorLinksForVisitorInPostgres(
  anonymousVisitorId: string
): Promise<AnonymousVisitorLink[]> {
  await ensurePostgresStore();
  const result = await sql<AnonymousVisitorLinkRow>`
    SELECT anonymous_visitor_id, user_id, linked_at
    FROM anonymous_visitor_links
    WHERE anonymous_visitor_id = ${anonymousVisitorId}
    ORDER BY linked_at ASC
  `;
  return result.rows.map(rowToLink);
}

// --- Public façade ---

export async function rememberAnonymousVisitorLink(
  anonymousVisitorId: string,
  userId: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return rememberAnonymousVisitorLinkInPostgres(anonymousVisitorId, userId);
  }
  return rememberAnonymousVisitorLinkInFile(anonymousVisitorId, userId);
}

export async function listAnonymousVisitorLinksForVisitor(
  anonymousVisitorId: string
): Promise<AnonymousVisitorLink[]> {
  if (shouldUsePostgres()) {
    return listAnonymousVisitorLinksForVisitorInPostgres(anonymousVisitorId);
  }
  return listAnonymousVisitorLinksForVisitorInFile(anonymousVisitorId);
}
