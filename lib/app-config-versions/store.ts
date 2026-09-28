import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { sql, type VercelPoolClient } from "@vercel/postgres";
import {
  persistPublishedPointers,
  readAppsForVersionBackfill,
} from "../app-store/store";
import type { AppConfig, PromptBuilderState, SupportedProvider } from "../app-store/types";
import { decideVersionWrite, snapshotFromApp } from "./rules";
import type { ConfigVersionKind, ConfigVersionRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const VERSIONS_FILE = path.join(DATA_DIR, "app-config-versions.json");

type SqlQuery = VercelPoolClient["sql"];

type PointerUpdate = {
  appId: string;
  publishedVersionId: string | null;
  publishedApiKey: string | null;
};

type VersionsFile = {
  versions: ConfigVersionRecord[];
};

type RepairPlan =
  | { action: "return"; version: ConfigVersionRecord }
  | { action: "insert"; version: ConfigVersionRecord; update: PointerUpdate }
  | {
      action: "seal";
      version: ConfigVersionRecord;
      update: PointerUpdate;
      versions: ConfigVersionRecord[];
      sealChanged: boolean;
    };

type VersionRow = {
  id: string;
  app_id: string;
  name: string;
  provider: string;
  model: string;
  variability: number | string | null;
  system_prompt: string | null;
  builder_state: unknown;
  assisted_authoring_mode: boolean;
  kind: string;
  created_at: string | Date;
  updated_at: string | Date;
  sealed_at: string | Date | null;
};

type AppBackfillRow = {
  id: string;
  name: string;
  provider: string;
  model: string;
  api_key: string;
  variability: number | string | null;
  system_prompt: string | null;
  builder_state: string | null;
  assisted_authoring_mode: boolean | null;
  published_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

let storeQueue: Promise<void> = Promise.resolve();

function shouldUsePostgres(): boolean {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = storeQueue.then(fn, fn);
  storeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function logStoreFailure(appIds: readonly string[]): void {
  const ids = appIds.length > 0 ? appIds : ["unknown"];
  for (const appId of ids) {
    console.error(`Configuration version store failed for app ${appId}`);
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isPublished(app: AppConfig): boolean {
  return typeof app.publishedAt === "string" && app.publishedAt.length > 0;
}

function emptyPointer(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === "";
}

function compareVersions(a: ConfigVersionRecord, b: ConfigVersionRecord): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  if (aTime !== bTime) return aTime - bTime;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function isoTimestamp(value: string | Date): string {
  return new Date(value).toISOString();
}

function parseVariability(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBuilderState(raw: unknown): PromptBuilderState | null {
  if (raw == null) return null;
  const value = typeof raw === "string" ? parseJsonObject(raw) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PromptBuilderState;
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isProvider(value: string): value is SupportedProvider {
  return value === "openai" || value === "google" || value === "anthropic";
}

function isVersionKind(value: string): value is ConfigVersionKind {
  return value === "edit" || value === "session";
}

function versionFromApp(app: AppConfig, stampedAt: string, sealedAt: string | null): ConfigVersionRecord {
  return {
    ...snapshotFromApp(app),
    id: randomUUID(),
    appId: app.id,
    kind: "edit",
    createdAt: stampedAt,
    updatedAt: stampedAt,
    sealedAt,
  };
}

function planBackfill(
  apps: readonly AppConfig[],
  versions: readonly ConfigVersionRecord[]
): { created: ConfigVersionRecord[]; updates: PointerUpdate[] } {
  const seen = new Set(versions.map((version) => version.appId));
  const created: ConfigVersionRecord[] = [];
  const updates: PointerUpdate[] = [];
  for (const app of apps) {
    if (seen.has(app.id)) continue;
    const published = isPublished(app);
    const version = versionFromApp(app, app.updatedAt, published ? app.updatedAt : null);
    created.push(version);
    seen.add(app.id);
    if (published) {
      updates.push({
        appId: app.id,
        publishedVersionId: version.id,
        publishedApiKey: app.apiKey,
      });
    }
  }
  return { created, updates };
}

function planRepair(
  app: AppConfig,
  now: string,
  storedPointer: string | null | undefined,
  versions: readonly ConfigVersionRecord[]
): RepairPlan {
  const forApp = versions.filter((version) => version.appId === app.id);
  if (!emptyPointer(storedPointer)) {
    const found = forApp.find((version) => version.id === storedPointer);
    if (!found) {
      throw new Error(`Published configuration is unavailable for app ${app.id}`);
    }
    return { action: "return", version: found };
  }
  if (!isPublished(app)) {
    throw new Error(`App ${app.id} is not published`);
  }
  if (forApp.length === 0) {
    const version = versionFromApp(app, now, now);
    return {
      action: "insert",
      version,
      update: {
        appId: app.id,
        publishedVersionId: version.id,
        publishedApiKey: app.apiKey,
      },
    };
  }
  const edits = forApp.filter((version) => version.kind === "edit");
  if (edits.length === 0) {
    throw new Error(`No edit version to publish for app ${app.id}`);
  }
  const earliest = edits.reduce((current, version) =>
    compareVersions(version, current) < 0 ? version : current
  );
  const sealedAt = earliest.sealedAt ?? now;
  const sealed: ConfigVersionRecord = {
    ...earliest,
    sealedAt,
  };
  return {
    action: "seal",
    version: sealed,
    sealChanged: sealed.sealedAt !== earliest.sealedAt,
    update: {
      appId: app.id,
      publishedVersionId: sealed.id,
      publishedApiKey: app.apiKey,
    },
    versions: versions.map((version) => (version.id === sealed.id ? sealed : version)),
  };
}

async function readVersionsFile(): Promise<ConfigVersionRecord[]> {
  try {
    const raw = await fs.readFile(VERSIONS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid configuration version file");
    }
    const versions = (parsed as { versions?: unknown }).versions;
    if (!Array.isArray(versions)) {
      throw new Error("Invalid configuration version file");
    }
    return versions as ConfigVersionRecord[];
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
}

async function writeVersionsFile(versions: readonly ConfigVersionRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const body: VersionsFile = { versions: [...versions] };
  const temporary = path.join(DATA_DIR, `.app-config-versions.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(body, null, 2), "utf-8");
  try {
    await fs.rename(temporary, VERSIONS_FILE);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function latestEditVersion(
  versions: readonly ConfigVersionRecord[],
  appId: string
): ConfigVersionRecord | null {
  // Session copies are never the draft, even when they sort after the edit row.
  const edits = versions.filter((version) => version.appId === appId && version.kind === "edit");
  if (edits.length === 0) return null;
  return edits.reduce((latest, version) =>
    compareVersions(version, latest) > 0 ? version : latest
  );
}

function planDraftSync(
  versions: readonly ConfigVersionRecord[],
  app: AppConfig,
  now: string
): { versions: ConfigVersionRecord[]; latest: ConfigVersionRecord } {
  const latest = latestEditVersion(versions, app.id);
  const decision = decideVersionWrite({
    latest: latest
      ? {
          id: latest.id,
          updatedAt: latest.updatedAt,
          sealed: latest.sealedAt !== null,
        }
      : null,
    now,
  });
  if (decision.action === "update" && latest && latest.id === decision.versionId) {
    const updated: ConfigVersionRecord = {
      ...snapshotFromApp(app),
      id: latest.id,
      appId: app.id,
      kind: "edit",
      createdAt: latest.createdAt,
      updatedAt: now,
      sealedAt: null,
    };
    return {
      latest: updated,
      versions: versions.map((version) => (version.id === updated.id ? updated : version)),
    };
  }
  const created = versionFromApp(app, now, null);
  const sealed = versions.map((version) =>
    version.appId === app.id && version.kind === "edit" && version.sealedAt === null
      ? { ...version, sealedAt: now }
      : version
  );
  return { latest: created, versions: [...sealed, created] };
}

async function updateVersionSnapshot(query: SqlQuery, version: ConfigVersionRecord): Promise<void> {
  const builderState = version.builderState ? JSON.stringify(version.builderState) : null;
  const result = await query`
    UPDATE app_config_versions
    SET
      name = ${version.name},
      provider = ${version.provider},
      model = ${version.model},
      variability = ${version.variability},
      system_prompt = ${version.systemPrompt},
      builder_state = ${builderState}::jsonb,
      assisted_authoring_mode = ${version.assistedAuthoringMode},
      updated_at = ${version.updatedAt}
    WHERE id = ${version.id} AND app_id = ${version.appId}
  `;
  if (result.rowCount === 0) {
    throw new Error(`Configuration version ${version.id} was not found for app ${version.appId}`);
  }
}

async function sealUnsealedEdits(query: SqlQuery, appId: string, now: string): Promise<void> {
  await query`
    UPDATE app_config_versions
    SET sealed_at = ${now}
    WHERE app_id = ${appId}
      AND kind = 'edit'
      AND sealed_at IS NULL
  `;
}

async function syncDraftPostgres(
  query: SqlQuery,
  app: AppConfig,
  now: string
): Promise<ConfigVersionRecord> {
  await ensureVersionSchema(query);
  const existing = await listVersionRows(query, app.id);
  const plan = planDraftSync(existing, app, now);
  const updating = existing.some((version) => version.id === plan.latest.id);
  if (updating) {
    await updateVersionSnapshot(query, plan.latest);
  } else {
    await sealUnsealedEdits(query, app.id, now);
    await insertVersion(query, plan.latest);
  }
  return plan.latest;
}

async function syncDraftJson(app: AppConfig, now: string): Promise<ConfigVersionRecord> {
  const existing = await readVersionsFile();
  const plan = planDraftSync(existing, app, now);
  try {
    await writeVersionsFile(plan.versions);
  } catch (error) {
    logStoreFailure([app.id]);
    throw error;
  }
  return plan.latest;
}

async function ensureVersionSchema(query: SqlQuery = sql): Promise<void> {
  await query`
    CREATE TABLE IF NOT EXISTS app_config_versions (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      variability DOUBLE PRECISION,
      system_prompt TEXT,
      builder_state JSONB,
      assisted_authoring_mode BOOLEAN NOT NULL,
      kind TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      sealed_at TIMESTAMPTZ
    )
  `;
  await query`
    CREATE INDEX IF NOT EXISTS app_config_versions_app_id_created_at_idx
    ON app_config_versions (app_id, created_at)
  `;
  await query`
    ALTER TABLE apps
    ADD COLUMN IF NOT EXISTS published_version_id TEXT
  `;
  await query`
    ALTER TABLE apps
    ADD COLUMN IF NOT EXISTS published_api_key TEXT
  `;
}

function rowToBackfillApp(row: AppBackfillRow): AppConfig {
  if (!isProvider(row.provider)) {
    throw new Error(`App ${row.id} could not be snapshotted`);
  }
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    model: row.model,
    apiKey: row.api_key,
    variability: parseVariability(row.variability) ?? undefined,
    systemPrompt: row.system_prompt ?? undefined,
    builderState: parseBuilderState(row.builder_state) ?? undefined,
    assistedAuthoringMode: row.assisted_authoring_mode ?? undefined,
    publishedAt: row.published_at ? isoTimestamp(row.published_at) : undefined,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

function rowToVersion(row: VersionRow): ConfigVersionRecord {
  if (!isVersionKind(row.kind)) {
    throw new Error(`Configuration version ${row.id} could not be read for app ${row.app_id}`);
  }
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    provider: row.provider,
    model: row.model,
    variability: parseVariability(row.variability),
    systemPrompt: row.system_prompt ?? "",
    builderState: parseBuilderState(row.builder_state),
    assistedAuthoringMode: row.assisted_authoring_mode,
    kind: row.kind,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
    sealedAt: row.sealed_at ? isoTimestamp(row.sealed_at) : null,
  };
}

async function insertVersion(query: SqlQuery, version: ConfigVersionRecord): Promise<void> {
  const builderState = version.builderState ? JSON.stringify(version.builderState) : null;
  await query`
    INSERT INTO app_config_versions (
      id,
      app_id,
      name,
      provider,
      model,
      variability,
      system_prompt,
      builder_state,
      assisted_authoring_mode,
      kind,
      created_at,
      updated_at,
      sealed_at
    ) VALUES (
      ${version.id},
      ${version.appId},
      ${version.name},
      ${version.provider},
      ${version.model},
      ${version.variability},
      ${version.systemPrompt},
      ${builderState}::jsonb,
      ${version.assistedAuthoringMode},
      ${version.kind},
      ${version.createdAt},
      ${version.updatedAt},
      ${version.sealedAt}
    )
  `;
}

async function updatePointer(query: SqlQuery, update: PointerUpdate): Promise<void> {
  const result = await query`
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

async function listVersionRows(query: SqlQuery, appId: string): Promise<ConfigVersionRecord[]> {
  const result = await query<VersionRow>`
    SELECT
      id,
      app_id,
      name,
      provider,
      model,
      variability,
      system_prompt,
      builder_state,
      assisted_authoring_mode,
      kind,
      created_at,
      updated_at,
      sealed_at
    FROM app_config_versions
    WHERE app_id = ${appId}
  `;
  return result.rows.map(rowToVersion);
}

async function withPostgresTransaction<T>(
  appIds: readonly string[],
  fn: (query: SqlQuery) => Promise<T>
): Promise<T> {
  const client = await sql.connect();
  try {
    await client.sql`BEGIN`;
    try {
      const result = await fn(client.sql);
      await client.sql`COMMIT`;
      return result;
    } catch (error) {
      try {
        await client.sql`ROLLBACK`;
      } catch {
        // Surface the original failure.
      }
      logStoreFailure(appIds);
      throw error;
    }
  } finally {
    client.release();
  }
}

async function backfillPostgres(): Promise<void> {
  await ensureVersionSchema();
  const appIds: string[] = [];
  await withPostgresTransaction(appIds, async (query) => {
    const appResult = await query<AppBackfillRow>`
      SELECT
        id,
        name,
        provider,
        model,
        api_key,
        variability,
        system_prompt,
        builder_state,
        assisted_authoring_mode,
        published_at,
        created_at,
        updated_at
      FROM apps
    `;
    const versionResult = await query<{ app_id: string }>`
      SELECT app_id FROM app_config_versions
    `;
    const existing: ConfigVersionRecord[] = versionResult.rows.map((row) => ({
      id: "",
      appId: row.app_id,
      name: "",
      provider: "",
      model: "",
      variability: null,
      systemPrompt: "",
      builderState: null,
      assistedAuthoringMode: false,
      kind: "edit",
      createdAt: "",
      updatedAt: "",
      sealedAt: null,
    }));
    const apps = appResult.rows.map(rowToBackfillApp);
    const planned = planBackfill(apps, existing);
    appIds.push(...planned.created.map((version) => version.appId));
    for (const version of planned.created) {
      await insertVersion(query, version);
    }
    for (const update of planned.updates) {
      await updatePointer(query, update);
    }
  });
}

async function backfillJson(): Promise<void> {
  const apps = await readAppsForVersionBackfill();
  const existing = await readVersionsFile();
  const planned = planBackfill(apps, existing);
  if (planned.created.length === 0) return;
  const appIds = planned.created.map((version) => version.appId);
  const nextVersions = [...existing, ...planned.created];
  try {
    await writeVersionsFile(nextVersions);
  } catch (error) {
    logStoreFailure(appIds);
    throw error;
  }
  try {
    await persistPublishedPointers(planned.updates);
  } catch (error) {
    logStoreFailure(appIds);
    throw error;
  }
}

async function ensurePublishedVersionPostgres(
  app: AppConfig,
  now: string
): Promise<ConfigVersionRecord> {
  await ensureVersionSchema();
  return withPostgresTransaction([app.id], async (query) => {
    const pointerResult = await query<{ published_version_id: string | null }>`
      SELECT published_version_id
      FROM apps
      WHERE id = ${app.id}
      LIMIT 1
    `;
    const stored = pointerResult.rows[0];
    if (!stored) {
      throw new Error(`App ${app.id} was not found`);
    }
    const versions = await listVersionRows(query, app.id);
    const plan = planRepair(app, now, stored.published_version_id, versions);
    if (plan.action === "return") return plan.version;
    if (plan.action === "insert") {
      await insertVersion(query, plan.version);
    } else if (plan.sealChanged) {
      await query`
        UPDATE app_config_versions
        SET sealed_at = ${plan.version.sealedAt}
        WHERE id = ${plan.version.id} AND app_id = ${app.id}
      `;
    }
    await updatePointer(query, plan.update);
    return plan.version;
  });
}

async function ensurePublishedVersionJson(
  app: AppConfig,
  now: string
): Promise<ConfigVersionRecord> {
  const stored = (await readAppsForVersionBackfill()).find((item) => item.id === app.id);
  if (!stored) {
    logStoreFailure([app.id]);
    throw new Error(`App ${app.id} was not found`);
  }
  const versions = await readVersionsFile();
  let plan: RepairPlan;
  try {
    plan = planRepair(app, now, stored.publishedVersionId, versions);
  } catch (error) {
    logStoreFailure([app.id]);
    throw error;
  }
  if (plan.action === "return") return plan.version;
  try {
    if (plan.action === "insert") {
      await writeVersionsFile([...versions, plan.version]);
    } else if (plan.sealChanged) {
      await writeVersionsFile(plan.versions);
    }
  } catch (error) {
    logStoreFailure([app.id]);
    throw error;
  }
  try {
    await persistPublishedPointers([plan.update]);
  } catch (error) {
    logStoreFailure([app.id]);
    throw error;
  }
  return plan.version;
}

export async function withConfigVersionQuery<T>(
  appIds: readonly string[],
  fn: (query: SqlQuery) => Promise<T>
): Promise<T> {
  return enqueue(() => withPostgresTransaction(appIds, fn));
}

export async function syncDraftVersion(
  input: { app: AppConfig; now: string },
  query?: SqlQuery
): Promise<{ latest: ConfigVersionRecord }> {
  if (query) {
    const latest = await syncDraftPostgres(query, input.app, input.now);
    return { latest };
  }
  return enqueue(async () => {
    if (shouldUsePostgres()) {
      const latest = await withPostgresTransaction([input.app.id], (transaction) =>
        syncDraftPostgres(transaction, input.app, input.now)
      );
      return { latest };
    }
    const latest = await syncDraftJson(input.app, input.now);
    return { latest };
  });
}

export async function prepareConfigVersionStore(): Promise<void> {
  await enqueue(async () => {
    if (shouldUsePostgres()) {
      await backfillPostgres();
      return;
    }
    await backfillJson();
  });
}

export async function ensurePublishedVersion(
  app: AppConfig,
  now: string
): Promise<ConfigVersionRecord> {
  return enqueue(() =>
    shouldUsePostgres()
      ? ensurePublishedVersionPostgres(app, now)
      : ensurePublishedVersionJson(app, now)
  );
}

export async function listConfigVersions(appId: string): Promise<ConfigVersionRecord[]> {
  return enqueue(async () => {
    if (shouldUsePostgres()) {
      await ensureVersionSchema();
      const versions = await listVersionRows(sql, appId);
      return [...versions].sort(compareVersions);
    }
    const versions = (await readVersionsFile()).filter((version) => version.appId === appId);
    return [...versions].sort(compareVersions);
  });
}
