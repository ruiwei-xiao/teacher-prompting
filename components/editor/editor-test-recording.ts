/**
 * Client-side recording identity for editor test chats (test-case rail and try-chat).
 * One UUID per test-case conversation; switching cases uses a different id,
 * and resetting a case starts a new session.
 */

export type EditorTestRecordingSurface = "editor-test";

export type EditorTestRecordingPayload = {
  sessionId: string;
  surface: EditorTestRecordingSurface;
  ownerSharing: boolean;
  messageTimes: string[];
};

export type EditorTestRecordingMessage = {
  role: string;
  content?: string;
};

export type EditorTestRecordingOptions = {
  now?: () => string;
  createId?: () => string;
  ownerSharing?: boolean;
};

export type EditorTestRecording = {
  buildPayload: (
    caseId: string,
    messages: readonly EditorTestRecordingMessage[]
  ) => EditorTestRecordingPayload;
  resetCase: (caseId: string) => void;
};

type CaseSession = {
  sessionId: string;
  rememberedTimes: string[];
};

export function createEditorTestRecording(
  options: EditorTestRecordingOptions = {}
): EditorTestRecording {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const ownerSharing = options.ownerSharing ?? true;
  const sessions = new Map<string, CaseSession>();

  function sessionFor(caseId: string): CaseSession {
    const existing = sessions.get(caseId);
    if (existing) {
      return existing;
    }
    const created: CaseSession = {
      sessionId: createId(),
      rememberedTimes: [],
    };
    sessions.set(caseId, created);
    return created;
  }

  function resetCase(caseId: string): void {
    sessions.set(caseId, {
      sessionId: createId(),
      rememberedTimes: [],
    });
  }

  function buildPayload(
    caseId: string,
    messages: readonly EditorTestRecordingMessage[]
  ): EditorTestRecordingPayload {
    const session = sessionFor(caseId);
    const messageTimes = messages.map((_, index) => {
      const existing = session.rememberedTimes[index];
      if (existing) {
        return existing;
      }
      const stamped = now();
      session.rememberedTimes[index] = stamped;
      return stamped;
    });

    return {
      sessionId: session.sessionId,
      surface: "editor-test",
      ownerSharing,
      messageTimes,
    };
  }

  return {
    buildPayload,
    resetCase,
  };
}
