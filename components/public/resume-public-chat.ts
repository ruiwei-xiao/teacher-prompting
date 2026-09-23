/**
 * After a later sign-in, reload the in-progress public chat and keep its id.
 * A failed load returns null so the page can start a fresh welcome thread.
 */
import {
  clearPublicChatResume,
  readPublicChatResume,
  type ResumeStorage,
} from "./conversation-resume";

export type ResumedPublicChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ResumedPublicChat = {
  sessionId: string;
  messages: ResumedPublicChatMessage[];
  messageTimes: string[];
};

export type TranscriptResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type StoredTranscriptMessage = {
  role?: string;
  content?: string;
  at?: string;
};

export async function loadResumedPublicChat(input: {
  isSignedIn: boolean;
  appId: string;
  storage: ResumeStorage;
  claim: () => Promise<void>;
  fetchTranscript: (sessionId: string) => Promise<TranscriptResponse>;
}): Promise<ResumedPublicChat | null> {
  if (!input.isSignedIn) {
    return null;
  }

  // Both Strict Mode effect setups must capture the same resume before either
  // asynchronous claim can finish and consume the storage key.
  const resume = readPublicChatResume(input.storage);
  try {
    await input.claim();
  } catch (error: unknown) {
    console.error("Failed to claim anonymous visitor history:", error);
  }

  if (!resume || resume.appId !== input.appId) {
    return null;
  }

  try {
    const response = await input.fetchTranscript(resume.sessionId);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      session?: {
        appId?: string;
        messages?: StoredTranscriptMessage[];
      };
    };
    if (body.session?.appId !== input.appId) {
      return null;
    }
    const messages: ResumedPublicChatMessage[] = [];
    const messageTimes: string[] = [];
    for (const message of body.session.messages ?? []) {
      if (message.role !== "user" && message.role !== "assistant") {
        continue;
      }
      messages.push({
        role: message.role,
        content: message.content ?? "",
      });
      messageTimes.push(message.at ?? "");
    }
    return {
      sessionId: resume.sessionId,
      messages,
      messageTimes,
    };
  } catch (error: unknown) {
    console.error("Failed to resume public chat:", error);
    return null;
  } finally {
    // Keep the key until loading finishes so React Strict Mode's repeated
    // effect setup can observe the same resume instead of losing it.
    clearPublicChatResume(input.storage);
  }
}
