/**
 * Task-local verification for the single-session transcript API (task 3.3).
 * Injects store deps so the handler can be proven without Next HTTP.
 *
 * Run: npx tsx scripts/verify-transcript-api.ts
 */
import fs from "fs/promises";
import path from "path";
import type { ChatSessionRecord } from "../lib/chat-session-store/types";

type Check = { name: string; run: () => Promise<void> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expected ${expectedJson}, received ${actualJson}`
    );
  }
}

function sampleSession(
  overrides: Partial<ChatSessionRecord> = {}
): ChatSessionRecord {
  return {
    id: "sess-1",
    appId: "bot-1",
    appName: "Tutor",
    ownerId: "owner-1",
    participantId: "user-1",
    participantName: "Ada",
    surface: "public",
    shared: true,
    messages: [
      {
        role: "user",
        content: "hello",
        at: "2026-08-24T12:00:00.000Z",
      },
      {
        role: "assistant",
        content: "hi",
        at: "2026-08-24T12:00:01.000Z",
      },
    ],
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:05:00.000Z",
    ...overrides,
  };
}

async function main() {
  const { getSessionTranscript } = await import(
    "../lib/chat-session-api/transcript"
  );

  const ownerId = "owner-1";
  const participantId = "user-1";
  const sessionId = "sess-1";
  const sharedSession = sampleSession({ id: sessionId, shared: true });
  const unsharedSession = sampleSession({ id: sessionId, shared: false });

  const checks: Check[] = [
    {
      name: "no user → 401 and does not load session",
      run: async () => {
        let loaded = false;
        const result = await getSessionTranscript(null, sessionId, {
          getSessionById: async () => {
            loaded = true;
            return sharedSession;
          },
        });
        assertEqual(result.status, 401, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Unauthorized" }, "body");
        }
        assertEqual(loaded, false, "getSessionById not called");
      },
    },
    {
      name: "missing session → 404",
      run: async () => {
        let seenId: string | undefined;
        const result = await getSessionTranscript(participantId, sessionId, {
          getSessionById: async (id) => {
            seenId = id;
            return null;
          },
        });
        assertEqual(result.status, 404, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Session not found" }, "body");
        }
        assertEqual(seenId, sessionId, "getSessionById id");
      },
    },
    {
      name: "participant of unshared session → 200 with full record",
      run: async () => {
        let seenId: string | undefined;
        const result = await getSessionTranscript(
          participantId,
          sessionId,
          {
            getSessionById: async (id) => {
              seenId = id;
              return unsharedSession;
            },
          }
        );
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body.session, unsharedSession, "session");
          assert(
            Array.isArray(result.body.session.messages),
            "includes transcript messages"
          );
          assertEqual(
            result.body.session.shared,
            false,
            "unshared flag preserved"
          );
        }
        assertEqual(seenId, sessionId, "getSessionById id");
      },
    },
    {
      name: "owner of unshared session → 403 (shared re-checked)",
      run: async () => {
        let seenId: string | undefined;
        const result = await getSessionTranscript(ownerId, sessionId, {
          getSessionById: async (id) => {
            seenId = id;
            return unsharedSession;
          },
        });
        assertEqual(result.status, 403, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Forbidden" }, "body");
        }
        assertEqual(seenId, sessionId, "looked up known id");
      },
    },
    {
      name: "owner of shared session → 200 with full record",
      run: async () => {
        const result = await getSessionTranscript(ownerId, sessionId, {
          getSessionById: async () => sharedSession,
        });
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body.session, sharedSession, "session");
          assertEqual(result.body.session.shared, true, "shared");
        }
      },
    },
    {
      name: "participant of shared session → 200",
      run: async () => {
        const result = await getSessionTranscript(participantId, sessionId, {
          getSessionById: async () => sharedSession,
        });
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body.session, sharedSession, "session");
        }
      },
    },
    {
      name: "third party → 403 even when shared",
      run: async () => {
        const result = await getSessionTranscript("intruder", sessionId, {
          getSessionById: async () => sharedSession,
        });
        assertEqual(result.status, 403, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Forbidden" }, "body");
        }
      },
    },
    {
      name: "owner who is also participant of unshared session → 200",
      run: async () => {
        const selfUnshared = sampleSession({
          ownerId: participantId,
          participantId,
          shared: false,
        });
        const result = await getSessionTranscript(participantId, sessionId, {
          getSessionById: async () => selfUnshared,
        });
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body.session, selfUnshared, "session");
        }
      },
    },
    {
      name: "owner of anonymous shared session → 200",
      run: async () => {
        const anonymous = sampleSession({
          participantId: null,
          participantName: null,
          shared: true,
        });
        const result = await getSessionTranscript(ownerId, sessionId, {
          getSessionById: async () => anonymous,
        });
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body.session, anonymous, "session");
        }
      },
    },
    {
      name: "owner of anonymous unshared session → 403",
      run: async () => {
        const anonymous = sampleSession({
          participantId: null,
          participantName: null,
          shared: false,
        });
        const result = await getSessionTranscript(ownerId, sessionId, {
          getSessionById: async () => anonymous,
        });
        assertEqual(result.status, 403, "status");
        assertEqual(result.ok, false, "ok");
      },
    },
    {
      name: "route is a thin auth wrapper around getSessionTranscript",
      run: async () => {
        const routePath = path.join(
          process.cwd(),
          "app/api/sessions/[sessionId]/route.ts"
        );
        const source = await fs.readFile(routePath, "utf-8");
        assert(
          source.includes('from "@/auth"') && source.includes("auth()"),
          "route calls auth()"
        );
        assert(
          source.includes("getSessionTranscript"),
          "route delegates to getSessionTranscript"
        );
        assert(
          source.includes("sessionId"),
          "route reads sessionId from params"
        );
        assert(
          !source.includes("getSessionById"),
          "route does not call store functions directly"
        );
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS  ${check.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL  ${check.name}`);
      console.error(`      ${message}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${checks.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\n${checks.length} checks passed.`);
}

void main();
