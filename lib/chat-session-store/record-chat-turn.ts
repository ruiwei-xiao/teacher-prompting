/**
 * Opt-in chat recording rules for POST /api/chat.
 * Skip mismatches and anonymous-unshared turns; never throw to the route.
 */
import { getDisplayProfiles, getUserById } from "@/lib/auth/user-store";
import { upsertSessionTurn } from "./store";
import type { SessionSurface, StoredChatMessage, UpsertSessionTurnInput } from "./types";

export type ChatRecordingPayload = {
  sessionId: string;
  surface: SessionSurface;
  ownerSharing?: boolean;
  messageTimes?: string[];
};

export type ChatTurnMessage = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
};

export type RecordChatTurnApp = {
  id: string;
  name: string;
  ownerId?: string;
};

export type RecordChatTurnInput = {
  recording?: unknown;
  isPublishedRequest: boolean;
  userId?: string | null;
  userName?: string | null;
  app: RecordChatTurnApp;
  messages: ChatTurnMessage[];
  assistantReply: string;
  now?: string;
};

export type RecordChatTurnSkipReason =
  | "no-recording"
  | "invalid-payload"
  | "surface-mismatch"
  | "anonymous-unshared";

export type RecordChatTurnResult =
  | { status: "skipped"; reason: RecordChatTurnSkipReason }
  | { status: "persisted"; sessionId: string }
  | { status: "failed"; error: unknown };

export type RecordChatTurnDeps = {
  upsert?: (input: UpsertSessionTurnInput) => Promise<void>;
  resolveDisplayName?: (userId: string) => Promise<string | null>;
};

type ParsedRecording =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "ok"; payload: ChatRecordingPayload };

const DATA_IMAGE_PREFIX = "data:image/";

export async function swallowRecordingFailure(
  work: () => Promise<void>
): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error("chat session recording failed:", error);
  }
}

export async function recordChatTurn(
  input: RecordChatTurnInput,
  deps: RecordChatTurnDeps = {}
): Promise<RecordChatTurnResult> {
  try {
    return await recordChatTurnUnchecked(input, deps);
  } catch (error) {
    console.error("chat session recording failed:", error);
    return { status: "failed", error };
  }
}

async function recordChatTurnUnchecked(
  input: RecordChatTurnInput,
  deps: RecordChatTurnDeps
): Promise<RecordChatTurnResult> {
  const parsed = parseRecordingPayload(input.recording);
  if (parsed.status === "absent") {
    return { status: "skipped", reason: "no-recording" };
  }
  if (parsed.status === "invalid") {
    return { status: "skipped", reason: "invalid-payload" };
  }

  const { payload } = parsed;
  if (!isSurfaceClaimValid(payload.surface, input)) {
    return { status: "skipped", reason: "surface-mismatch" };
  }

  const participantId = normalizeOptionalId(input.userId);
  if (!participantId && payload.ownerSharing === false) {
    return { status: "skipped", reason: "anonymous-unshared" };
  }

  const now = input.now?.trim() || new Date().toISOString();
  const participantName = participantId
    ? await resolveParticipantName(participantId, input.userName, deps)
    : null;
  const upsert = deps.upsert ?? upsertSessionTurn;

  await upsert({
    id: payload.sessionId,
    appId: input.app.id,
    appName: input.app.name,
    ownerId: input.app.ownerId ?? "",
    participantId,
    participantName,
    surface: payload.surface,
    shared: payload.ownerSharing !== false,
    messages: buildStoredMessages(
      input.messages,
      input.assistantReply,
      payload.messageTimes,
      now
    ),
  });

  return { status: "persisted", sessionId: payload.sessionId };
}

function parseRecordingPayload(value: unknown): ParsedRecording {
  if (value === undefined || value === null) {
    return { status: "absent" };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { status: "invalid" };
  }

  const record = value as Record<string, unknown>;
  const sessionId =
    typeof record.sessionId === "string" ? record.sessionId.trim() : "";
  if (!sessionId) {
    return { status: "invalid" };
  }
  if (record.surface !== "public" && record.surface !== "editor-test") {
    return { status: "invalid" };
  }

  const payload: ChatRecordingPayload = {
    sessionId,
    surface: record.surface,
  };
  if (typeof record.ownerSharing === "boolean") {
    payload.ownerSharing = record.ownerSharing;
  }
  if (Array.isArray(record.messageTimes)) {
    payload.messageTimes = record.messageTimes.filter(
      (item): item is string => typeof item === "string"
    );
  }
  return { status: "ok", payload };
}

function isSurfaceClaimValid(
  surface: SessionSurface,
  input: Pick<RecordChatTurnInput, "isPublishedRequest" | "userId" | "app">
): boolean {
  if (surface === "public") {
    return input.isPublishedRequest;
  }
  const userId = normalizeOptionalId(input.userId);
  const ownerId = normalizeOptionalId(input.app.ownerId);
  return !input.isPublishedRequest && Boolean(userId && ownerId && userId === ownerId);
}

function normalizeOptionalId(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function resolveParticipantName(
  userId: string,
  userName: string | null | undefined,
  deps: RecordChatTurnDeps
): Promise<string | null> {
  const fromSession = userName?.trim();
  if (fromSession) {
    return fromSession;
  }
  const resolve = deps.resolveDisplayName ?? defaultResolveDisplayName;
  try {
    const resolved = await resolve(userId);
    return resolved?.trim() || null;
  } catch (error) {
    console.error("chat session display name lookup failed:", error);
    return null;
  }
}

async function defaultResolveDisplayName(userId: string): Promise<string | null> {
  const user = await getUserById(userId);
  const fromUser = user?.name?.trim();
  if (fromUser) {
    return fromUser;
  }
  const profiles = await getDisplayProfiles([userId]);
  return profiles.get(userId)?.name?.trim() || null;
}

function buildStoredMessages(
  messages: ChatTurnMessage[],
  assistantReply: string,
  messageTimes: string[] | undefined,
  now: string
): StoredChatMessage[] {
  const stored = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => toStoredMessage(message, messageTimes?.[index], now));
  stored.push({
    role: "assistant",
    content: assistantReply,
    at: now,
  });
  return stored;
}

function toStoredMessage(
  message: ChatTurnMessage,
  providedAt: string | undefined,
  now: string
): StoredChatMessage {
  const at = providedAt?.trim() ? providedAt : now;
  const stored: StoredChatMessage = {
    role: message.role,
    content: typeof message.content === "string" ? message.content : "",
    at,
  };
  const imageUrl = message.imageUrl?.trim() ?? "";
  if (imageUrl.startsWith(DATA_IMAGE_PREFIX)) {
    stored.imageOmitted = true;
  }
  return stored;
}
