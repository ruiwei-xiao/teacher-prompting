/**
 * Team-space sample-bot try-chat (Requirement 12.3).
 * Members and operators may talk to the offering's attached sample bot
 * using its stored prompt. The public /api/chat published-only gate is
 * not used, because a sample bot does not have to be published.
 */
import { sendChat, type ChatMsg } from "@/lib/ai/providers";
import { getAppById } from "@/lib/app-store/store";
import { normalizeVariability } from "@/lib/app-store/model-selection";
import type { AppConfig } from "@/lib/app-store/types";
import { resolveCaller } from "./access";
import type { ApiResult } from "./offerings";

export type SampleChatReply = {
  reply: string;
};

export type SampleChatDeps = {
  getAppById?: (id: string) => Promise<AppConfig | null>;
  sendChat?: typeof sendChat;
};

function unauthorized<T = never>(): ApiResult<T> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function forbidden(): ApiResult<never> {
  return { ok: false, status: 403, body: { error: "Forbidden" } };
}

function notFound(message: string): ApiResult<never> {
  return { ok: false, status: 404, body: { error: message } };
}

function badRequest(message: string): ApiResult<never> {
  return { ok: false, status: 400, body: { error: message } };
}

function readMessages(value: unknown): ChatMsg[] | { error: string } {
  if (!Array.isArray(value)) return { error: "Missing messages" };
  const messages: ChatMsg[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "Invalid messages" };
    }
    const record = item as Record<string, unknown>;
    if (record.role !== "user" && record.role !== "assistant") {
      return { error: "Invalid messages" };
    }
    if (typeof record.content !== "string") {
      return { error: "Invalid messages" };
    }
    const imageUrl =
      typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";
    messages.push({
      role: record.role,
      content: record.content,
      ...(record.role === "user" && imageUrl.startsWith("data:image/")
        ? { imageUrl }
        : {}),
    });
  }
  return messages;
}

export async function postSampleChat(
  userId: string | null,
  teamId: string,
  body: unknown,
  deps?: SampleChatDeps
): Promise<ApiResult<SampleChatReply>> {
  if (!userId) return unauthorized();

  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role === "denied") {
    return forbidden();
  }

  const sampleAppId = caller.offering.sampleAppId?.trim();
  if (!sampleAppId) {
    return notFound("Sample bot not found");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Invalid messages");
  }
  const messages = readMessages((body as { messages?: unknown }).messages);
  if (!Array.isArray(messages)) {
    return badRequest(messages.error);
  }

  const loadApp = deps?.getAppById ?? getAppById;
  const app = await loadApp(sampleAppId);
  if (!app) {
    return notFound("Sample bot not found");
  }
  if (!app.apiKey?.trim()) {
    return badRequest("This sample bot has no API key.");
  }

  const hasImageAttachment = messages.some(
    (message) => message.role === "user" && Boolean(message.imageUrl?.trim())
  );
  if (hasImageAttachment && app.provider !== "openai") {
    return badRequest(
      "Image attachments are only supported for bots that use OpenAI (e.g. GPT-5.4 mini)."
    );
  }

  const chat = deps?.sendChat ?? sendChat;
  try {
    const reply = await chat({
      provider: app.provider,
      model: app.model,
      apiKey: app.apiKey,
      system: app.systemPrompt,
      variability: normalizeVariability(app.variability),
      messages,
    });
    return { ok: true, status: 200, body: { reply } };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to send message";
    return { ok: false, status: 500, body: { error: message } };
  }
}
