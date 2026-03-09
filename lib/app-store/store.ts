import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import { AppConfig, SupportedProvider } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const APPS_FILE = path.join(DATA_DIR, "apps.json");

type AppRow = {
  id: string;
  name: string;
  description: string | null;
  provider: SupportedProvider;
  model: string;
  api_key: string;
  variability: number | null;
  system_prompt: string | null;
  published_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

let postgresReadyPromise: Promise<void> | null = null;

function shouldUsePostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function rowToApp(row: AppRow): AppConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    provider: row.provider,
    model: row.model,
    apiKey: row.api_key,
    variability: row.variability ?? undefined,
    systemPrompt: row.system_prompt || undefined,
    publishedAt: row.published_at
      ? new Date(row.published_at).toISOString()
      : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function ensureFileStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(APPS_FILE);
  } catch {
    await fs.writeFile(APPS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

async function readAppsFromFile(): Promise<AppConfig[]> {
  await ensureFileStore();
  const raw = await fs.readFile(APPS_FILE, "utf-8");
  return JSON.parse(raw) as AppConfig[];
}

async function readAppsFromFileIfPresent(): Promise<AppConfig[]> {
  try {
    const raw = await fs.readFile(APPS_FILE, "utf-8");
    return JSON.parse(raw) as AppConfig[];
  } catch {
    return [];
  }
}

async function writeAppsToFile(apps: AppConfig[]) {
  await ensureFileStore();
  await fs.writeFile(APPS_FILE, JSON.stringify(apps, null, 2), "utf-8");
}

async function ensurePostgresStore() {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS apps (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          api_key TEXT NOT NULL,
          variability INTEGER,
          system_prompt TEXT,
          published_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;

      const countResult = await sql<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM apps
      `;

      if ((countResult.rows[0]?.count ?? 0) > 0) {
        return;
      }

      const fileApps = await readAppsFromFileIfPresent();
      for (const app of fileApps) {
        await insertAppIntoPostgres(app);
      }
    })();
  }

  return postgresReadyPromise;
}

async function insertAppIntoPostgres(app: AppConfig) {
  await sql`
    INSERT INTO apps (
      id,
      name,
      description,
      provider,
      model,
      api_key,
      variability,
      system_prompt,
      published_at,
      created_at,
      updated_at
    ) VALUES (
      ${app.id},
      ${app.name},
      ${app.description ?? null},
      ${app.provider},
      ${app.model},
      ${app.apiKey},
      ${app.variability ?? null},
      ${app.systemPrompt ?? null},
      ${app.publishedAt ?? null},
      ${app.createdAt},
      ${app.updatedAt}
    )
  `;
}

async function createAppInPostgres(app: AppConfig) {
  await ensurePostgresStore();
  const existing = await getAppByIdFromPostgres(app.id);
  if (existing) {
    throw new Error(`App with id "${app.id}" already exists`);
  }

  await insertAppIntoPostgres(app);
  return app;
}

async function getAppByIdFromPostgres(id: string) {
  await ensurePostgresStore();
  const result = await sql<AppRow>`
    SELECT
      id,
      name,
      description,
      provider,
      model,
      api_key,
      variability,
      system_prompt,
      published_at,
      created_at,
      updated_at
    FROM apps
    WHERE id = ${id}
    LIMIT 1
  `;

  const row = result.rows[0];
  return row ? rowToApp(row) : null;
}

async function listAppsFromPostgres() {
  await ensurePostgresStore();
  const result = await sql<AppRow>`
    SELECT
      id,
      name,
      description,
      provider,
      model,
      api_key,
      variability,
      system_prompt,
      published_at,
      created_at,
      updated_at
    FROM apps
    ORDER BY updated_at DESC
  `;

  return result.rows.map(rowToApp);
}

async function updateAppInPostgres(id: string, patch: Partial<AppConfig>) {
  await ensurePostgresStore();
  const existing = await getAppByIdFromPostgres(id);
  if (!existing) return null;

  const next: AppConfig = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await sql`
    UPDATE apps
    SET
      name = ${next.name},
      description = ${next.description ?? null},
      provider = ${next.provider},
      model = ${next.model},
      api_key = ${next.apiKey},
      variability = ${next.variability ?? null},
      system_prompt = ${next.systemPrompt ?? null},
      published_at = ${next.publishedAt ?? null},
      updated_at = ${next.updatedAt}
    WHERE id = ${id}
  `;

  return next;
}

async function createAppInFile(app: AppConfig) {
  const apps = await readAppsFromFile();
  const exists = apps.find((item) => item.id === app.id);
  if (exists) {
    throw new Error(`App with id "${app.id}" already exists`);
  }

  apps.push(app);
  await writeAppsToFile(apps);
  return app;
}

async function getAppByIdFromFile(id: string) {
  const apps = await readAppsFromFile();
  return apps.find((app) => app.id === id) ?? null;
}

async function listAppsFromFile() {
  return readAppsFromFile();
}

async function updateAppInFile(id: string, patch: Partial<AppConfig>) {
  const apps = await readAppsFromFile();
  const idx = apps.findIndex((app) => app.id === id);
  if (idx === -1) return null;

  apps[idx] = {
    ...apps[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await writeAppsToFile(apps);
  return apps[idx];
}

export async function createApp(app: AppConfig) {
  if (shouldUsePostgres()) {
    return createAppInPostgres(app);
  }

  return createAppInFile(app);
}

export async function getAppById(id: string) {
  if (shouldUsePostgres()) {
    return getAppByIdFromPostgres(id);
  }

  return getAppByIdFromFile(id);
}

export async function listApps() {
  if (shouldUsePostgres()) {
    return listAppsFromPostgres();
  }

  return listAppsFromFile();
}

export async function updateApp(id: string, patch: Partial<AppConfig>) {
  if (shouldUsePostgres()) {
    return updateAppInPostgres(id, patch);
  }

  return updateAppInFile(id, patch);
}