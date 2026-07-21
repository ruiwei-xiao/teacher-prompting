/**
 * Client-safe peer bot inspect + duplicate helpers (Task 6.7).
 * GET snapshot / POST duplicate via Workspace bots API — no authoring edit.
 */
import type { PromptBuilderState, SupportedProvider } from "@/lib/app-store/types";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

/** Read-only peer inspect payload — never includes apiKey. */
export type PeerBotPreviewSnapshot = {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  provider: SupportedProvider;
  model: string;
  systemPrompt?: string;
  builderState?: PromptBuilderState;
  forkedFromProjectName?: string;
  forkedFromAuthorName?: string;
  createdAt: string;
  updatedAt: string;
};

export type PeerBotDuplicateResult = {
  id: string;
  name: string;
  ownerId?: string;
  forkedFromProjectName?: string;
  forkedFromAuthorName?: string;
};

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

const PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "google",
  "anthropic",
]);

function isProvider(value: unknown): value is SupportedProvider {
  return typeof value === "string" && PROVIDERS.has(value);
}

function stripApiKey<T extends Record<string, unknown>>(
  app: T
): Omit<T, "apiKey"> {
  const { apiKey: _secret, ...rest } = app as T & { apiKey?: unknown };
  return rest;
}

function isPeerSnapshot(value: unknown): value is PeerBotPreviewSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const app = value as Record<string, unknown>;
  return (
    typeof app.id === "string" &&
    typeof app.name === "string" &&
    isProvider(app.provider) &&
    typeof app.model === "string" &&
    typeof app.createdAt === "string" &&
    typeof app.updatedAt === "string"
  );
}

function isDuplicateApp(value: unknown): value is PeerBotDuplicateResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const app = value as Record<string, unknown>;
  return typeof app.id === "string" && typeof app.name === "string";
}

/** Page route for non-edit peer inspect. */
export function peerBotPreviewHref(
  workspaceId: string,
  appId: string
): string {
  return `/workspace/${workspaceId}/bots/${appId}`;
}

/** GET read-only snapshot API. */
export function peerBotSnapshotApiHref(
  workspaceId: string,
  appId: string
): string {
  return `/api/workspaces/${workspaceId}/bots/${appId}`;
}

/** POST duplicate into caller's My bots. */
export function peerBotDuplicateApiHref(
  workspaceId: string,
  appId: string
): string {
  return `/api/workspaces/${workspaceId}/bots/${appId}/duplicate`;
}

/**
 * Authoring edit controls belong only to the bot owner.
 * Peer preview must never rely on Workspace membership for edit (Req 4.6).
 */
export function canShowAuthoringEditControls(input: {
  viewerUserId: string;
  ownerId: string | undefined;
}): boolean {
  if (!input.ownerId) return false;
  return input.viewerUserId === input.ownerId;
}

/** Parse GET /api/workspaces/:id/bots/:appId (apiKey stripped if present). */
export function parsePeerBotSnapshotResponse(
  status: number,
  body: unknown
): ParseResult<{ app: PeerBotPreviewSnapshot }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load bot preview"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid bot preview response" };
  }
  const rawApp = (body as { app?: unknown }).app;
  if (!rawApp || typeof rawApp !== "object" || Array.isArray(rawApp)) {
    return { ok: false, error: "Invalid bot preview response" };
  }
  const stripped = stripApiKey(rawApp as Record<string, unknown>);
  if (!isPeerSnapshot(stripped)) {
    return { ok: false, error: "Invalid bot preview response" };
  }
  return { ok: true, app: stripped };
}

/** Parse POST .../duplicate — new app owned by caller. */
export function parsePeerBotDuplicateResponse(
  status: number,
  body: unknown
): ParseResult<{ app: PeerBotDuplicateResult }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to duplicate bot"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid duplicate response" };
  }
  const rawApp = (body as { app?: unknown }).app;
  if (!isDuplicateApp(rawApp)) {
    return { ok: false, error: "Invalid duplicate response" };
  }
  const stripped = stripApiKey(rawApp as Record<string, unknown>);
  return {
    ok: true,
    app: {
      id: stripped.id as string,
      name: stripped.name as string,
      ownerId:
        typeof stripped.ownerId === "string" ? stripped.ownerId : undefined,
      forkedFromProjectName:
        typeof stripped.forkedFromProjectName === "string"
          ? stripped.forkedFromProjectName
          : undefined,
      forkedFromAuthorName:
        typeof stripped.forkedFromAuthorName === "string"
          ? stripped.forkedFromAuthorName
          : undefined,
    },
  };
}
