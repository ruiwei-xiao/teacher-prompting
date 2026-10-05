/**
 * Chooses the tutoring configuration for one chat turn.
 * Public replies use the published snapshot. Editor tests use the saved draft.
 * The public page title uses the published snapshot name.
 */
import type { AppConfig, SupportedProvider } from "../app-store/types";
import { getAppById, getAppByPublicSlug } from "../app-store/store";
import {
  ensurePublishedVersion,
  listConfigVersions,
  pinSessionSnapshot,
} from "../app-config-versions/store";
import type { ConfigVersionRecord } from "../app-config-versions/types";
import { getSessionById } from "../chat-session-store/store";

export type PublishedSnapshot =
  | {
      ok: true;
      appName: string;
      systemPrompt: string;
      provider: SupportedProvider;
      model: string;
      variability: number | null;
      apiKey: string | null;
      configVersionId: string;
    }
  | { ok: false; error: "Published configuration is unavailable." };

export type EditorDraftChat =
  | {
      ok: true;
      appName: string;
      systemPrompt: string;
      provider: SupportedProvider;
      model: string;
      variability: number | null;
      apiKey: string;
    }
  | { ok: false; status: 500; error: string };

export type PublicChatPageModel =
  | { status: "not-found" }
  | { status: "unavailable" }
  | { status: "ok"; appId: string; title: string; systemPrompt: string };

const PUBLISHED_UNAVAILABLE = "Published configuration is unavailable." as const;

function emptyPointer(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === "";
}

function isProvider(value: string): value is SupportedProvider {
  return value === "openai" || value === "google" || value === "anthropic";
}

function missingKey(appId: string): { ok: false; status: 500; error: string } {
  return { ok: false, status: 500, error: `Missing API key for app "${appId}"` };
}

function compareVersions(a: ConfigVersionRecord, b: ConfigVersionRecord): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  if (aTime !== bTime) return aTime - bTime;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function latestEditVersion(
  versions: readonly ConfigVersionRecord[]
): ConfigVersionRecord | null {
  let latest: ConfigVersionRecord | null = null;
  for (const version of versions) {
    if (version.kind !== "edit") continue;
    if (!latest || compareVersions(version, latest) > 0) {
      latest = version;
    }
  }
  return latest;
}

function snapshotFromVersion(
  version: ConfigVersionRecord,
  publishedApiKey: string | null | undefined
): PublishedSnapshot {
  if (!isProvider(version.provider)) {
    return { ok: false, error: PUBLISHED_UNAVAILABLE };
  }
  const apiKey = typeof publishedApiKey === "string" ? publishedApiKey.trim() : "";
  return {
    ok: true,
    appName: version.name,
    systemPrompt: version.systemPrompt,
    provider: version.provider,
    model: version.model,
    variability: version.variability,
    apiKey: apiKey.length > 0 ? apiKey : null,
    configVersionId: version.id,
  };
}

async function publishedSnapshotFromStore(
  app: AppConfig,
  now: string
): Promise<PublishedSnapshot> {
  if (emptyPointer(app.publishedVersionId)) {
    // Repair lives in version storage. This path does not insert a version row.
    const repaired = await ensurePublishedVersion(app, now);
    const stored = await getAppById(app.id);
    return snapshotFromVersion(repaired, stored?.publishedApiKey);
  }

  const versions = await listConfigVersions(app.id);
  const found = versions.find((version) => version.id === app.publishedVersionId);
  if (!found) {
    return { ok: false, error: PUBLISHED_UNAVAILABLE };
  }
  return snapshotFromVersion(found, app.publishedApiKey);
}

export async function resolvePublishedSnapshot(
  app: AppConfig,
  now: string
): Promise<PublishedSnapshot> {
  return publishedSnapshotFromStore(app, now);
}

export function resolveEditorDraftChat(input: {
  app: AppConfig;
  clientSystem: string | undefined;
}): EditorDraftChat {
  if (!input.app.apiKey.trim()) {
    return missingKey(input.app.id);
  }
  const supplied = input.clientSystem?.trim() ?? "";
  return {
    ok: true,
    appName: input.app.name,
    systemPrompt: supplied || input.app.systemPrompt || "",
    provider: input.app.provider,
    model: input.app.model,
    variability: input.app.variability ?? null,
    apiKey: input.app.apiKey,
  };
}

function editorSessionId(recording: unknown): string | null {
  if (!recording || typeof recording !== "object" || Array.isArray(recording)) {
    return null;
  }
  const record = recording as Record<string, unknown>;
  if (record.surface !== "editor-test") return null;
  if (typeof record.sessionId !== "string") return null;
  const sessionId = record.sessionId.trim();
  return sessionId.length > 0 ? sessionId : null;
}

export async function editorTestConfigVersionId(input: {
  app: AppConfig;
  userId: string | null;
  recording: unknown;
  now: string;
}): Promise<string | null> {
  if (!input.userId || !input.app.ownerId || input.userId !== input.app.ownerId) {
    return null;
  }
  const sessionId = editorSessionId(input.recording);
  if (!sessionId) return null;
  const existing = await getSessionById(sessionId);
  if (existing) return null;
  const latest = latestEditVersion(await listConfigVersions(input.app.id));
  if (!latest) return null;
  const pinned = await pinSessionSnapshot({
    appId: input.app.id,
    versionId: latest.id,
    now: input.now,
  });
  return pinned.configVersionId;
}

export async function loadPublicChatPage(appId: string): Promise<PublicChatPageModel> {
  const app = (await getAppById(appId)) || (await getAppByPublicSlug(appId));
  if (!app?.publishedAt) {
    return { status: "not-found" };
  }
  const snapshot = await resolvePublishedSnapshot(app, new Date().toISOString());
  if (!snapshot.ok) {
    return { status: "unavailable" };
  }
  return {
    status: "ok",
    appId: app.id,
    title: snapshot.appName.trim() || app.id,
    systemPrompt: snapshot.systemPrompt,
  };
}
