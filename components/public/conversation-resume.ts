/**
 * Tab-local resume of an in-progress public chat across the sign-in round-trip.
 * This is a conversation id, not the anonymous visitor cookie.
 */

export const PUBLIC_CHAT_RESUME_KEY = "tp_public_chat_resume";

export type PublicChatResume = {
  appId: string;
  sessionId: string;
};

export type ResumeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function rememberPublicChatResume(
  resume: PublicChatResume,
  storage: ResumeStorage
): void {
  storage.setItem(PUBLIC_CHAT_RESUME_KEY, JSON.stringify(resume));
}

export function readPublicChatResume(
  storage: ResumeStorage
): PublicChatResume | null {
  const raw = storage.getItem(PUBLIC_CHAT_RESUME_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PublicChatResume>;
    const appId = parsed.appId?.trim();
    const sessionId = parsed.sessionId?.trim();
    if (!appId || !sessionId) {
      return null;
    }
    return { appId, sessionId };
  } catch {
    return null;
  }
}

export function rememberPublicChatResumeInSession(
  resume: PublicChatResume
): void {
  if (typeof window === "undefined") {
    return;
  }
  rememberPublicChatResume(resume, window.sessionStorage);
}
