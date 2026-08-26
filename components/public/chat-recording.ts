/**
 * Client-side recording identity for the published chat page.
 * One instance = one conversation. A remount or reset starts a new session.
 */

export type PublicChatRecordingSurface = "public";

export type PublicChatRecordingPayload = {
  sessionId: string;
  surface: PublicChatRecordingSurface;
  ownerSharing: boolean;
  messageTimes: string[];
};

export type PublicChatRecordingMessage = {
  role: string;
  content?: string;
};

export type PublicChatRecordingOptions = {
  now?: () => string;
  createId?: () => string;
  ownerSharing?: boolean;
};

export type PublicChatRecording = {
  readonly sessionId: string;
  reset: () => void;
  setOwnerSharing: (value: boolean) => void;
  buildPayload: (
    messages: readonly PublicChatRecordingMessage[],
    payloadOptions?: { ownerSharing?: boolean }
  ) => PublicChatRecordingPayload;
};

export function createPublicChatRecording(
  options: PublicChatRecordingOptions = {}
): PublicChatRecording {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  let ownerSharing = options.ownerSharing ?? true;

  let sessionId = createId();
  const rememberedTimes: string[] = [];

  function reset(): void {
    sessionId = createId();
    rememberedTimes.length = 0;
    ownerSharing = options.ownerSharing ?? true;
  }

  function setOwnerSharing(value: boolean): void {
    ownerSharing = value;
  }

  function buildPayload(
    messages: readonly PublicChatRecordingMessage[],
    payloadOptions?: { ownerSharing?: boolean }
  ): PublicChatRecordingPayload {
    if (typeof payloadOptions?.ownerSharing === "boolean") {
      ownerSharing = payloadOptions.ownerSharing;
    }

    const messageTimes = messages.map((_, index) => {
      const existing = rememberedTimes[index];
      if (existing) {
        return existing;
      }
      const stamped = now();
      rememberedTimes[index] = stamped;
      return stamped;
    });

    return {
      sessionId,
      surface: "public",
      ownerSharing,
      messageTimes,
    };
  }

  return {
    get sessionId() {
      return sessionId;
    },
    reset,
    setOwnerSharing,
    buildPayload,
  };
}
