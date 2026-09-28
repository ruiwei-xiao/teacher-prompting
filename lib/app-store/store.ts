import fs from "fs/promises";
import path from "path";
import { sql, type VercelPoolClient } from "@vercel/postgres";
import { snapshotFromApp } from "../app-config-versions/rules";
import type { ConfigVersionRecord } from "../app-config-versions/types";
import {
  AppConfig,
  ProjectShareVisibility,
  PromptBuilderState,
  SupportedProvider,
} from "./types";

type SqlQuery = VercelPoolClient["sql"];

const DATA_DIR = path.join(process.cwd(), ".data");
const APPS_FILE = path.join(DATA_DIR, "apps.json");
const VERSIONS_FILE = path.join(DATA_DIR, "app-config-versions.json");

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
  published_version_id: string | null;
  published_api_key: string | null;
  project_shared_at: string | Date | null;
  project_share_visibility: string | null;
  share_author_name: boolean | null;
  assisted_authoring_mode: boolean | null;
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
    publishedVersionId: row.published_version_id,
    publishedApiKey: row.published_api_key,
    projectSharedAt: row.project_shared_at
      ? new Date(row.project_shared_at).toISOString()
      : undefined,
    projectShareVisibility:
      parseProjectShareVisibility(row.project_share_visibility) || "private",
    shareAuthorName: row.share_author_name ?? false,
    assistedAuthoringMode: row.assisted_authoring_mode ?? undefined,
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
        ADD COLUMN IF NOT EXISTS assisted_authoring_mode BOOLEAN
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

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS published_version_id TEXT
      `;

      await sql`
        ALTER TABLE apps
        ADD COLUMN IF NOT EXISTS published_api_key TEXT
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

  await postgresReadyPromise;
  await prepareConfigVersionsOnce();
}

let configVersionPreparePromise: Promise<void> | null = null;

function prepareConfigVersionsOnce(): Promise<void> {
  if (!configVersionPreparePromise) {
    configVersionPreparePromise = import("../app-config-versions/store")
      .then((mod) => mod.prepareConfigVersionStore())
      .catch((error: unknown) => {
        configVersionPreparePromise = null;
        throw error;
      });
  }
  return configVersionPreparePromise;
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isSupportedProvider(value: string): value is SupportedProvider {
  return value === "openai" || value === "google" || value === "anthropic";
}

function snapshotChanged(before: AppConfig, after: AppConfig): boolean {
  return JSON.stringify(snapshotFromApp(before)) !== JSON.stringify(snapshotFromApp(after));
}

function applyDraftSnapshot(app: AppConfig, latest: ConfigVersionRecord): AppConfig {
  if (!isSupportedProvider(latest.provider)) {
    throw new Error(`App ${app.id} could not be snapshotted`);
  }
  // Keep an omitted optional field when it normalizes to the same snapshot value.
  const systemPrompt =
    latest.systemPrompt === "" &&
    (app.systemPrompt === undefined || app.systemPrompt === "")
      ? app.systemPrompt
      : latest.systemPrompt;
  const assistedAuthoringMode =
    app.assistedAuthoringMode === undefined && latest.assistedAuthoringMode
      ? undefined
      : latest.assistedAuthoringMode;
  return {
    ...app,
    name: latest.name,
    provider: latest.provider,
    model: latest.model,
    variability: latest.variability === null ? undefined : latest.variability,
    systemPrompt,
    assistedAuthoringMode,
    builderState: latest.builderState ?? undefined,
  };
}

async function readOptionalFile(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf-8");
  } catch (error) {
    if (isEnoent(error)) return null;
    throw error;
  }
}

async function restoreFile(file: string, previous: string | null): Promise<void> {
  if (previous === null) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, previous, "utf-8");
}

/** Test-only. Set APP_DRAFT_SAVE_FAULT=1 to fail the next draft save after the version write. */
function takeDraftSaveFault(): boolean {
  if (process.env.APP_DRAFT_SAVE_FAULT !== "1") return false;
  delete process.env.APP_DRAFT_SAVE_FAULT;
  return true;
}

/** Test-only. Set APP_PUBLISH_FAULT=1 to fail the next publish after the version seal. */
function takePublishFault(): boolean {
  if (process.env.APP_PUBLISH_FAULT !== "1") return false;
  delete process.env.APP_PUBLISH_FAULT;
  return true;
}

function isNewPublish(existing: AppConfig, patch: Partial<AppConfig>): boolean {
  return (
    typeof patch.publishedAt === "string" &&
    patch.publishedAt.length > 0 &&
    patch.publishedAt !== existing.publishedAt
  );
}

function draftApiKeyChanged(existing: AppConfig, patch: Partial<AppConfig>): boolean {
  return typeof patch.apiKey === "string" && patch.apiKey !== existing.apiKey;
}

function hasPublishedPointer(app: AppConfig): boolean {
  return typeof app.publishedVersionId === "string" && app.publishedVersionId.length > 0;
}

type ConfigVersionModule = typeof import("../app-config-versions/store");

function applyPublishResult(
  existing: AppConfig,
  next: AppConfig,
  result: { versionId: string; noop: boolean }
): AppConfig {
  if (result.noop) {
    return {
      ...next,
      publishedVersionId: existing.publishedVersionId ?? null,
      publishedApiKey: existing.publishedApiKey ?? null,
    };
  }
  return {
    ...next,
    publishedVersionId: result.versionId,
    publishedApiKey: next.apiKey,
  };
}

async function alignPublishedApiKey(
  versions: ConfigVersionModule,
  existing: AppConfig,
  next: AppConfig,
  query?: SqlQuery
): Promise<AppConfig> {
  const pointer = existing.publishedVersionId;
  if (typeof pointer !== "string" || pointer.length === 0) return next;
  const provider = await versions.publishedSnapshotProvider(existing.id, pointer, query);
  if (provider !== null && provider === next.provider) {
    return {
      ...next,
      publishedVersionId: pointer,
      publishedApiKey: next.apiKey,
    };
  }
  return {
    ...next,
    publishedVersionId: pointer,
    publishedApiKey: existing.publishedApiKey ?? null,
  };
}

function logDraftSaveFailure(appId: string): void {
  console.error(`Configuration version store failed for app ${appId}`);
}

async function insertAppIntoPostgres(app: AppConfig, query: SqlQuery = sql) {
  await query`
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
      assisted_authoring_mode,
      forked_from_project_name,
      forked_from_project_share_slug,
      forked_from_author_name,
      published_version_id,
      published_api_key,
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
      ${app.assistedAuthoringMode ?? null},
      ${app.forkedFromProjectName ?? null},
      ${app.forkedFromProjectShareSlug ?? null},
      ${app.forkedFromAuthorName ?? null},
      ${app.publishedVersionId ?? null},
      ${app.publishedApiKey ?? null},
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

  const versions = await import("../app-config-versions/store");
  await versions.withConfigVersionQuery([app.id], async (query) => {
    await insertAppIntoPostgres(app, query);
    await versions.syncDraftVersion({ app, now: app.updatedAt }, query);
    if (takeDraftSaveFault()) {
      throw new Error("Failed to update app settings");
    }
  });
  return app;
}

async function updateAppRow(query: SqlQuery, id: string, next: AppConfig) {
  await query`
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
      published_version_id = ${next.publishedVersionId ?? null},
      published_api_key = ${next.publishedApiKey ?? null},
      project_shared_at = ${next.projectSharedAt ?? null},
      project_share_visibility = ${next.projectShareVisibility ?? "private"},
      share_author_name = ${next.shareAuthorName ?? false},
      assisted_authoring_mode = ${next.assistedAuthoringMode ?? null},
      forked_from_project_name = ${next.forkedFromProjectName ?? null},
      forked_from_project_share_slug = ${next.forkedFromProjectShareSlug ?? null},
      forked_from_author_name = ${next.forkedFromAuthorName ?? null},
      updated_at = ${next.updatedAt}
    WHERE id = ${id}
  `;
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
          published_version_id,
          published_api_key,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          assisted_authoring_mode,
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
          published_version_id,
          published_api_key,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          assisted_authoring_mode,
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
          published_version_id,
          published_api_key,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          assisted_authoring_mode,
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
          published_version_id,
          published_api_key,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          assisted_authoring_mode,
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

  const now = new Date().toISOString();
  const merged: AppConfig = {
    ...existing,
    ...patch,
    updatedAt: now,
  };

  const publishing = isNewPublish(existing, patch);
  const keySync =
    !publishing &&
    draftApiKeyChanged(existing, patch) &&
    hasPublishedPointer(existing);
  if (!snapshotChanged(existing, merged) && !publishing && !keySync) {
    await updateAppRow(sql, id, merged);
    return merged;
  }

  const versions = await import("../app-config-versions/store");
  return versions.withConfigVersionQuery([id], async (query) => {
    let next = merged;
    if (snapshotChanged(existing, next)) {
      const { latest } = await versions.syncDraftVersion({ app: next, now }, query);
      next = applyDraftSnapshot(next, latest);
      if (takeDraftSaveFault()) {
        throw new Error("Failed to update app settings");
      }
    }
    if (publishing) {
      const result = await versions.publishLatestEdit(
        {
          appId: id,
          publishedVersionId: existing.publishedVersionId,
          now,
        },
        query
      );
      next = applyPublishResult(existing, next, result);
      if (takePublishFault()) {
        throw new Error("Failed to update app settings");
      }
    } else if (keySync) {
      next = await alignPublishedApiKey(versions, existing, next, query);
    }
    await updateAppRow(query, id, next);
    return next;
  });
}

async function createAppInFile(app: AppConfig) {
  const apps = await readAppsFromFile();
  const exists = apps.find((item) => item.id === app.id);
  if (exists) {
    throw new Error(`App with id "${app.id}" already exists`);
  }

  const previousApps = await readOptionalFile(APPS_FILE);
  const previousVersions = await readOptionalFile(VERSIONS_FILE);
  try {
    const versions = await import("../app-config-versions/store");
    await versions.syncDraftVersion({ app, now: app.updatedAt });
    if (takeDraftSaveFault()) {
      throw new Error("Failed to update app settings");
    }
    apps.push(app);
    await writeAppsToFile(apps);
    return app;
  } catch (error) {
    await restoreFile(APPS_FILE, previousApps);
    await restoreFile(VERSIONS_FILE, previousVersions);
    logDraftSaveFailure(app.id);
    throw error;
  }
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
          published_version_id,
          published_api_key,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          assisted_authoring_mode,
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
          published_version_id,
          published_api_key,
          project_shared_at,
          project_share_visibility,
          share_author_name,
          assisted_authoring_mode,
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

  const current = apps[idx];
  if (!current) return null;
  const now = new Date().toISOString();
  let next: AppConfig = {
    ...current,
    ...patch,
    updatedAt: now,
  };

  const publishing = isNewPublish(current, patch);
  const keySync =
    !publishing &&
    draftApiKeyChanged(current, patch) &&
    hasPublishedPointer(current);
  if (!snapshotChanged(current, next) && !publishing && !keySync) {
    apps[idx] = next;
    await writeAppsToFile(apps);
    return apps[idx];
  }

  const previousApps = await readOptionalFile(APPS_FILE);
  const previousVersions = await readOptionalFile(VERSIONS_FILE);
  try {
    const versions = await import("../app-config-versions/store");
    if (snapshotChanged(current, next)) {
      const { latest } = await versions.syncDraftVersion({ app: next, now });
      next = applyDraftSnapshot(next, latest);
      if (takeDraftSaveFault()) {
        throw new Error("Failed to update app settings");
      }
    }
    if (publishing) {
      const result = await versions.publishLatestEdit({
        appId: id,
        publishedVersionId: current.publishedVersionId,
        now,
      });
      next = applyPublishResult(current, next, result);
      if (takePublishFault()) {
        throw new Error("Failed to update app settings");
      }
    } else if (keySync) {
      next = await alignPublishedApiKey(versions, current, next);
    }
    apps[idx] = next;
    await writeAppsToFile(apps);
    return apps[idx];
  } catch (error) {
    await restoreFile(APPS_FILE, previousApps);
    await restoreFile(VERSIONS_FILE, previousVersions);
    logDraftSaveFailure(id);
    throw error;
  }
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

export async function persistPublishedPointers(
  updates: readonly {
    appId: string;
    publishedVersionId: string | null;
    publishedApiKey: string | null;
  }[]
): Promise<void> {
  if (updates.length === 0) return;

  if (shouldUsePostgres()) {
    await ensurePostgresStore();
    for (const update of updates) {
      const result = await sql`
        UPDATE apps
        SET
          published_version_id = ${update.publishedVersionId},
          published_api_key = ${update.publishedApiKey}
        WHERE id = ${update.appId}
      `;
      if (result.rowCount === 0) {
        throw new Error(`App ${update.appId} was not found`);
      }
    }
    return;
  }

  const apps = await readAppsFromFile();
  const missing = updates.find(
    (update) => !apps.some((app) => app.id === update.appId)
  );
  if (missing) {
    throw new Error(`App ${missing.appId} was not found`);
  }

  const byId = new Map(updates.map((update) => [update.appId, update]));
  const nextApps = apps.map((app) => {
    const update = byId.get(app.id);
    if (!update) return app;
    return {
      ...app,
      publishedVersionId: update.publishedVersionId,
      publishedApiKey: update.publishedApiKey,
    };
  });
  await writeAppsToFile(nextApps);
}

/** Reads the file store without starting version backfill, so backfill can load apps. */
export async function readAppsForVersionBackfill(): Promise<AppConfig[]> {
  return listAppsFromFile();
}

export async function createApp(app: AppConfig) {
  if (shouldUsePostgres()) {
    return createAppInPostgres(app);
  }

  await prepareConfigVersionsOnce();
  return createAppInFile(app);
}

export async function getAppById(id: string, ownerId?: string) {
  if (shouldUsePostgres()) {
    return getAppByIdFromPostgres(id, ownerId);
  }

  await prepareConfigVersionsOnce();
  return getAppByIdFromFile(id, ownerId);
}

export async function getAppByPublicSlug(publicSlug: string) {
  if (shouldUsePostgres()) {
    return getAppByPublicSlugFromPostgres(publicSlug);
  }

  await prepareConfigVersionsOnce();
  return getAppByPublicSlugFromFile(publicSlug);
}

export async function getAppByProjectShareSlug(projectShareSlug: string) {
  if (shouldUsePostgres()) {
    return getAppByProjectShareSlugFromPostgres(projectShareSlug);
  }

  await prepareConfigVersionsOnce();
  return getAppByProjectShareSlugFromFile(projectShareSlug);
}

export async function listApps(ownerId?: string) {
  if (shouldUsePostgres()) {
    return listAppsFromPostgres(ownerId);
  }

  await prepareConfigVersionsOnce();
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

  await prepareConfigVersionsOnce();
  return updateAppInFile(id, patch, ownerId);
}

export async function claimUnownedApps(ownerId: string) {
  if (shouldUsePostgres()) {
    return claimUnownedAppsInPostgres(ownerId);
  }

  await prepareConfigVersionsOnce();
  return claimUnownedAppsInFile(ownerId);
}

export async function deleteApp(id: string, ownerId?: string) {
  if (shouldUsePostgres()) {
    return deleteAppInPostgres(id, ownerId);
  }

  await prepareConfigVersionsOnce();
  return deleteAppInFile(id, ownerId);
}
