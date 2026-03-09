import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import { AppConfig, SupportedProvider } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const APPS_FILE = path.join(DATA_DIR, "apps.json");

type AppRow = {
  id: string;
  owner_id: string | null;
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
    ownerId: row.owner_id || undefined,
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
          owner_id TEXT,
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

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS owner_id TEXT
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
      owner_id,
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
      ${app.ownerId ?? null},
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

async function getAppByIdFromPostgres(id: string, ownerId?: string) {
  await ensurePostgresStore();
  const result = ownerId
    ? await sql<AppRow>`
        SELECT
          id,
          owner_id,
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
        WHERE id = ${id} AND owner_id = ${ownerId}
        LIMIT 1
      `
    : await sql<AppRow>`
        SELECT
          id,
          owner_id,
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

async function listAppsFromPostgres(ownerId?: string) {
  await ensurePostgresStore();
  const result = ownerId
    ? await sql<AppRow>`
        SELECT
          id,
          owner_id,
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
        WHERE owner_id = ${ownerId}
        ORDER BY updated_at DESC
      `
    : await sql<AppRow>`
        SELECT
          id,
          owner_id,
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

async function updateAppInPostgres(
  id: string,
  patch: Partial<AppConfig>,
  ownerId?: string
) {
  await ensurePostgresStore();
  const existing = await getAppByIdFromPostgres(id, ownerId);
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
      owner_id = ${next.ownerId ?? null},
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

async function getAppByIdFromFile(id: string, ownerId?: string) {
  const apps = await readAppsFromFile();
  return (
    apps.find(
      (app) => app.id === id && (!ownerId || app.ownerId === ownerId)
    ) ?? null
  );
}

async function listAppsFromFile(ownerId?: string) {
  const apps = await readAppsFromFile();
  if (!ownerId) return apps;
  return apps.filter((app) => app.ownerId === ownerId);
}

async function updateAppInFile(
  id: string,
  patch: Partial<AppConfig>,
  ownerId?: string
) {
  const apps = await readAppsFromFile();
  const idx = apps.findIndex(
    (app) => app.id === id && (!ownerId || app.ownerId === ownerId)
  );
  if (idx === -1) return null;

  apps[idx] = {
    ...apps[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await writeAppsToFile(apps);
  return apps[idx];
}

async function deleteAppInPostgres(id: string, ownerId?: string) {
  await ensurePostgresStore();
  const existing = await getAppByIdFromPostgres(id, ownerId);
  if (!existing) return null;

  await sql`
    DELETE FROM apps
    WHERE id = ${id}
  `;

  return existing;
}

async function deleteAppInFile(id: string, ownerId?: string) {
  const apps = await readAppsFromFile();
  const idx = apps.findIndex(
    (app) => app.id === id && (!ownerId || app.ownerId === ownerId)
  );
  if (idx === -1) return null;

  const [removed] = apps.splice(idx, 1);
  await writeAppsToFile(apps);
  return removed;
}

async function claimUnownedAppsInPostgres(ownerId: string) {
  await ensurePostgresStore();
  await sql`
    UPDATE apps
    SET owner_id = ${ownerId}
    WHERE owner_id IS NULL
  `;
}

async function claimUnownedAppsInFile(ownerId: string) {
  const apps = await readAppsFromFile();
  let changed = false;

  const nextApps = apps.map((app) => {
    if (app.ownerId) return app;
    changed = true;
    return {
      ...app,
      ownerId,
      updatedAt: new Date().toISOString(),
    };
  });

  if (changed) {
    await writeAppsToFile(nextApps);
  }
}

export async function createApp(app: AppConfig) {
  if (shouldUsePostgres()) {
    return createAppInPostgres(app);
  }

  return createAppInFile(app);
}

export async function getAppById(id: string, ownerId?: string) {
  if (shouldUsePostgres()) {
    return getAppByIdFromPostgres(id, ownerId);
  }

  return getAppByIdFromFile(id, ownerId);
}

export async function listApps(ownerId?: string) {
  if (shouldUsePostgres()) {
    return listAppsFromPostgres(ownerId);
  }

  return listAppsFromFile(ownerId);
}

export async function updateApp(
  id: string,
  patch: Partial<AppConfig>,
  ownerId?: string
) {
  if (shouldUsePostgres()) {
    return updateAppInPostgres(id, patch, ownerId);
  }

  return updateAppInFile(id, patch, ownerId);
}

export async function claimUnownedApps(ownerId: string) {
  if (shouldUsePostgres()) {
    return claimUnownedAppsInPostgres(ownerId);
  }

  return claimUnownedAppsInFile(ownerId);
}

export async function deleteApp(id: string, ownerId?: string) {
  if (shouldUsePostgres()) {
    return deleteAppInPostgres(id, ownerId);
  }

  return deleteAppInFile(id, ownerId);
}