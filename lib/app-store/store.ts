import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import {
  AppConfig,
  ProjectShareVisibility,
  PromptBuilderState,
  SupportedProvider,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const APPS_FILE = path.join(DATA_DIR, "apps.json");

type AppRow = {
  id: string;
  public_slug: string | null;
  project_share_slug: string | null;
  owner_id: string | null;
  name: string;
  description: string | null;
  provider: SupportedProvider;
  model: string;
  api_key: string;
  variability: number | null;
  system_prompt: string | null;
  builder_state: string | null;
  community_subject: string | null;
  community_tags: string | null;
  published_at: string | Date | null;
  project_shared_at: string | Date | null;
  project_share_visibility: string | null;
  share_author_name: boolean | null;
  forked_from_project_name: string | null;
  forked_from_project_share_slug: string | null;
  forked_from_author_name: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function parseBuilderState(raw: string | null): PromptBuilderState | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PromptBuilderState;
  } catch {
    return undefined;
  }
}

function parseStringArray(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function parseProjectShareVisibility(
  raw: string | null
): ProjectShareVisibility | undefined {
  if (raw === "private" || raw === "public") return raw;
  return undefined;
}

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
    publicSlug: row.public_slug || undefined,
    projectShareSlug: row.project_share_slug || undefined,
    ownerId: row.owner_id || undefined,
    name: row.name,
    description: row.description || undefined,
    provider: row.provider,
    model: row.model,
    apiKey: row.api_key,
    variability: row.variability ?? undefined,
    systemPrompt: row.system_prompt || undefined,
    builderState: parseBuilderState(row.builder_state),
    communitySubject: row.community_subject || undefined,
    communityTags: parseStringArray(row.community_tags),
    publishedAt: row.published_at
      ? new Date(row.published_at).toISOString()
      : undefined,
    projectSharedAt: row.project_shared_at
      ? new Date(row.project_shared_at).toISOString()
      : undefined,
    projectShareVisibility:
      parseProjectShareVisibility(row.project_share_visibility) || "private",
    shareAuthorName: row.share_author_name ?? false,
    forkedFromProjectName: row.forked_from_project_name || undefined,
    forkedFromProjectShareSlug: row.forked_from_project_share_slug || undefined,
    forkedFromAuthorName: row.forked_from_author_name || undefined,
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
          public_slug TEXT,
          project_share_slug TEXT,
          owner_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          api_key TEXT NOT NULL,
          variability INTEGER,
          system_prompt TEXT,
          builder_state TEXT,
          community_subject TEXT,
          community_tags TEXT,
          published_at TIMESTAMPTZ,
          project_shared_at TIMESTAMPTZ,
          project_share_visibility TEXT,
          share_author_name BOOLEAN,
          forked_from_project_name TEXT,
          forked_from_project_share_slug TEXT,
          forked_from_author_name TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS public_slug TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS owner_id TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS project_share_slug TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS builder_state TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS project_shared_at TIMESTAMPTZ
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS community_subject TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS community_tags TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS project_share_visibility TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS share_author_name BOOLEAN
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS forked_from_project_name TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS forked_from_project_share_slug TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS forked_from_author_name TEXT
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
      public_slug,
      project_share_slug,
      owner_id,
      name,
      description,
      provider,
      model,
      api_key,
      variability,
      system_prompt,
      builder_state,
      community_subject,
      community_tags,
      published_at,
      project_shared_at,
      project_share_visibility,
      share_author_name,
      forked_from_project_name,
      forked_from_project_share_slug,
      forked_from_author_name,
      created_at,
      updated_at
    ) VALUES (
      ${app.id},
      ${app.publicSlug ?? null},
      ${app.projectShareSlug ?? null},
      ${app.ownerId ?? null},
      ${app.name},
      ${app.description ?? null},
      ${app.provider},
      ${app.model},
      ${app.apiKey},
      ${app.variability ?? null},
      ${app.systemPrompt ?? null},
      ${app.builderState ? JSON.stringify(app.builderState) : null},
      ${app.communitySubject ?? null},
      ${app.communityTags ? JSON.stringify(app.communityTags) : null},
      ${app.publishedAt ?? null},
      ${app.projectSharedAt ?? null},
      ${app.projectShareVisibility ?? "private"},
      ${app.shareAuthorName ?? false},
      ${app.forkedFromProjectName ?? null},
      ${app.forkedFromProjectShareSlug ?? null},
      ${app.forkedFromAuthorName ?? null},
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
          public_slug,
          project_share_slug,
          owner_id,
          name,
          description,
          provider,
          model,
          api_key,
          variability,
          system_prompt,
          builder_state,
          community_subject,
          community_tags,
          published_at,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          forked_from_project_name,
          forked_from_project_share_slug,
          forked_from_author_name,
          created_at,
          updated_at
        FROM apps
        WHERE id = ${id} AND owner_id = ${ownerId}
        LIMIT 1
      `
    : await sql<AppRow>`
        SELECT
          id,
          public_slug,
          project_share_slug,
          owner_id,
          name,
          description,
          provider,
          model,
          api_key,
          variability,
          system_prompt,
          builder_state,
          community_subject,
          community_tags,
          published_at,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          forked_from_project_name,
          forked_from_project_share_slug,
          forked_from_author_name,
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
          public_slug,
          project_share_slug,
          owner_id,
          name,
          description,
          provider,
          model,
          api_key,
          variability,
          system_prompt,
          builder_state,
          community_subject,
          community_tags,
          published_at,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          forked_from_project_name,
          forked_from_project_share_slug,
          forked_from_author_name,
          created_at,
          updated_at
        FROM apps
        WHERE owner_id = ${ownerId}
        ORDER BY updated_at DESC
      `
    : await sql<AppRow>`
        SELECT
          id,
          public_slug,
          project_share_slug,
          owner_id,
          name,
          description,
          provider,
          model,
          api_key,
          variability,
          system_prompt,
          builder_state,
          community_subject,
          community_tags,
          published_at,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          forked_from_project_name,
          forked_from_project_share_slug,
          forked_from_author_name,
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
      public_slug = ${next.publicSlug ?? null},
      project_share_slug = ${next.projectShareSlug ?? null},
      owner_id = ${next.ownerId ?? null},
      description = ${next.description ?? null},
      provider = ${next.provider},
      model = ${next.model},
      api_key = ${next.apiKey},
      variability = ${next.variability ?? null},
      system_prompt = ${next.systemPrompt ?? null},
      builder_state = ${next.builderState ? JSON.stringify(next.builderState) : null},
      community_subject = ${next.communitySubject ?? null},
      community_tags = ${next.communityTags ? JSON.stringify(next.communityTags) : null},
      published_at = ${next.publishedAt ?? null},
      project_shared_at = ${next.projectSharedAt ?? null},
      project_share_visibility = ${next.projectShareVisibility ?? "private"},
      share_author_name = ${next.shareAuthorName ?? false},
      forked_from_project_name = ${next.forkedFromProjectName ?? null},
      forked_from_project_share_slug = ${next.forkedFromProjectShareSlug ?? null},
      forked_from_author_name = ${next.forkedFromAuthorName ?? null},
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

async function getAppByPublicSlugFromPostgres(publicSlug: string) {
  await ensurePostgresStore();
  const result = await sql<AppRow>`
    SELECT
      id,
      public_slug,
      project_share_slug,
      owner_id,
      name,
      description,
      provider,
      model,
      api_key,
      variability,
      system_prompt,
      builder_state,
      community_subject,
      community_tags,
      published_at,
      project_shared_at,
      project_share_visibility,
      share_author_name,
      forked_from_project_name,
      forked_from_project_share_slug,
      forked_from_author_name,
      created_at,
      updated_at
    FROM apps
    WHERE public_slug = ${publicSlug}
    LIMIT 1
  `;

  const row = result.rows[0];
  return row ? rowToApp(row) : null;
}

async function getAppByPublicSlugFromFile(publicSlug: string) {
  const apps = await readAppsFromFile();
  return apps.find((app) => app.publicSlug === publicSlug) ?? null;
}

async function getAppByProjectShareSlugFromPostgres(projectShareSlug: string) {
  await ensurePostgresStore();
  const result = await sql<AppRow>`
    SELECT
      id,
      public_slug,
      project_share_slug,
      owner_id,
      name,
      description,
      provider,
      model,
      api_key,
      variability,
      system_prompt,
      builder_state,
      community_subject,
      community_tags,
      published_at,
      project_shared_at,
      project_share_visibility,
      share_author_name,
      forked_from_project_name,
      forked_from_project_share_slug,
      forked_from_author_name,
      created_at,
      updated_at
    FROM apps
    WHERE project_share_slug = ${projectShareSlug}
    LIMIT 1
  `;

  const row = result.rows[0];
  return row ? rowToApp(row) : null;
}

async function getAppByProjectShareSlugFromFile(projectShareSlug: string) {
  const apps = await readAppsFromFile();
  return apps.find((app) => app.projectShareSlug === projectShareSlug) ?? null;
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

export async function getAppByPublicSlug(publicSlug: string) {
  if (shouldUsePostgres()) {
    return getAppByPublicSlugFromPostgres(publicSlug);
  }

  return getAppByPublicSlugFromFile(publicSlug);
}

export async function getAppByProjectShareSlug(projectShareSlug: string) {
  if (shouldUsePostgres()) {
    return getAppByProjectShareSlugFromPostgres(projectShareSlug);
  }

  return getAppByProjectShareSlugFromFile(projectShareSlug);
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