/**
 * Task-local verification for chat recording rules (task 2.1).
 * Forces the JSON-file backend and isolates storage to a temp file.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";

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

async function main() {
  const dataFile = path.join(
    os.tmpdir(),
    `chat-sessions-recording-${process.pid}-${Date.now()}.json`
  );
  process.env.CHAT_SESSIONS_DATA_FILE = dataFile;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const { getSessionById, upsertSessionTurn } = await import(
    "../lib/chat-session-store/store"
  );
  const { recordChatTurn, swallowRecordingFailure } = await import(
    "../lib/chat-session-store/record-chat-turn"
  );

  const now = "2026-08-24T15:00:00.000Z";
  const publishedApp = {
    id: "bot-public-1",
    name: "Public Tutor",
    ownerId: "owner-1",
  };
  const incomingMessages = [
    {
      role: "user" as const,
      content: "Hello",
    },
  ];

  const checks: Check[] = [
    {
      name: "no recording field skips persistence",
      run: async () => {
        let upserted = false;
        const result = await recordChatTurn(
          {
            isPublishedRequest: true,
            userId: null,
            userName: null,
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Hi there",
            now,
          },
          {
            upsert: async () => {
              upserted = true;
            },
          }
        );
        assertEqual(result.status, "skipped", "status");
        if (result.status === "skipped") {
          assertEqual(result.reason, "no-recording", "reason");
        }
        assertEqual(upserted, false, "upsert was not called");
        const session = await getSessionById("should-not-exist");
        assertEqual(session, null, "no session row without a recording payload");
      },
    },
    {
      name: "public-chat turn with recording creates a session row",
      run: async () => {
        const sessionId = "rec-public-create";
        const result = await recordChatTurn({
          recording: {
            sessionId,
            surface: "public",
            ownerSharing: true,
            messageTimes: ["2026-08-24T14:59:00.000Z"],
          },
          isPublishedRequest: true,
          userId: "learner-1",
          userName: "Ada",
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Hi Ada",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected a session after a recorded public turn");
        assertEqual(session.appId, publishedApp.id, "appId");
        assertEqual(session.appName, publishedApp.name, "appName");
        assertEqual(session.ownerId, publishedApp.ownerId, "ownerId");
        assertEqual(session.participantId, "learner-1", "participantId");
        assertEqual(session.participantName, "Ada", "participantName");
        assertEqual(session.surface, "public", "surface");
        assertEqual(session.shared, true, "shared");
        assertEqual(
          session.messages,
          [
            {
              role: "user",
              content: "Hello",
              at: "2026-08-24T14:59:00.000Z",
            },
            {
              role: "assistant",
              content: "Hi Ada",
              at: now,
            },
          ],
          "transcript includes incoming history plus the model reply"
        );
      },
    },
    {
      name: "same request without the payload changes nothing",
      run: async () => {
        const sessionId = "rec-public-omit";
        const result = await recordChatTurn({
          isPublishedRequest: true,
          userId: "learner-1",
          userName: "Ada",
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Hi Ada",
          now,
        });
        assertEqual(result.status, "skipped", "status");
        const session = await getSessionById(sessionId);
        assertEqual(session, null, "omitting recording creates no row");
      },
    },
    {
      name: "public surface on an editor request is a mismatch skip",
      run: async () => {
        let upserted = false;
        const result = await recordChatTurn(
          {
            recording: { sessionId: "rec-mismatch-public", surface: "public" },
            isPublishedRequest: false,
            userId: "owner-1",
            userName: "Owner",
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Nope",
            now,
          },
          {
            upsert: async () => {
              upserted = true;
            },
          }
        );
        assertEqual(result.status, "skipped", "status");
        if (result.status === "skipped") {
          assertEqual(result.reason, "surface-mismatch", "reason");
        }
        assertEqual(upserted, false, "upsert was not called");
      },
    },
    {
      name: "editor-test surface on a published request is a mismatch skip",
      run: async () => {
        let upserted = false;
        const result = await recordChatTurn(
          {
            recording: {
              sessionId: "rec-mismatch-editor",
              surface: "editor-test",
            },
            isPublishedRequest: true,
            userId: "owner-1",
            userName: "Owner",
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Nope",
            now,
          },
          {
            upsert: async () => {
              upserted = true;
            },
          }
        );
        assertEqual(result.status, "skipped", "status");
        if (result.status === "skipped") {
          assertEqual(result.reason, "surface-mismatch", "reason");
        }
        assertEqual(upserted, false, "upsert was not called");
      },
    },
    {
      name: "editor-test surface without app ownership is a mismatch skip",
      run: async () => {
        let upserted = false;
        const result = await recordChatTurn(
          {
            recording: {
              sessionId: "rec-mismatch-owner",
              surface: "editor-test",
            },
            isPublishedRequest: false,
            userId: "not-the-owner",
            userName: "Intruder",
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Nope",
            now,
          },
          {
            upsert: async () => {
              upserted = true;
            },
          }
        );
        assertEqual(result.status, "skipped", "status");
        if (result.status === "skipped") {
          assertEqual(result.reason, "surface-mismatch", "reason");
        }
        assertEqual(upserted, false, "upsert was not called");
      },
    },
    {
      name: "valid editor-test recording persists with editor-test surface",
      run: async () => {
        const sessionId = "rec-editor-ok";
        const result = await recordChatTurn({
          recording: { sessionId, surface: "editor-test" },
          isPublishedRequest: false,
          userId: "owner-1",
          userName: "Owner",
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Test reply",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected an editor-test session");
        assertEqual(session.surface, "editor-test", "surface");
        assertEqual(session.participantId, "owner-1", "participantId");
        assertEqual(session.participantName, "Owner", "participantName");
      },
    },
    {
      name: "anonymous identity stores no personally identifying fields",
      run: async () => {
        const sessionId = "rec-anon-on";
        const result = await recordChatTurn({
          recording: { sessionId, surface: "public" },
          isPublishedRequest: true,
          userId: null,
          userName: "Should be ignored",
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Hello stranger",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected an anonymous session");
        assertEqual(session.participantId, null, "participantId");
        assertEqual(session.participantName, null, "participantName");
      },
    },
    {
      name: "anonymous turn with sharing off skips persistence entirely",
      run: async () => {
        let upserted = false;
        const sessionId = "rec-anon-off";
        const result = await recordChatTurn(
          {
            recording: {
              sessionId,
              surface: "public",
              ownerSharing: false,
            },
            isPublishedRequest: true,
            userId: null,
            userName: null,
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Still chatting",
            now,
          },
          {
            upsert: async () => {
              upserted = true;
            },
          }
        );
        assertEqual(result.status, "skipped", "status");
        if (result.status === "skipped") {
          assertEqual(result.reason, "anonymous-unshared", "reason");
        }
        assertEqual(upserted, false, "upsert was not called");
        const session = await getSessionById(sessionId);
        assertEqual(session, null, "anonymous unshared turn leaves no row");
      },
    },
    {
      name: "signed-in turn with sharing off still records",
      run: async () => {
        const sessionId = "rec-signed-off";
        const result = await recordChatTurn({
          recording: {
            sessionId,
            surface: "public",
            ownerSharing: false,
          },
          isPublishedRequest: true,
          userId: "learner-2",
          userName: "Bea",
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Private hi",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "signed-in unshared turns are still recorded");
        assertEqual(session.shared, false, "shared");
        assertEqual(session.participantId, "learner-2", "participantId");
      },
    },
    {
      name: "image data URLs are stripped and marked omitted",
      run: async () => {
        const sessionId = "rec-image-strip";
        const result = await recordChatTurn({
          recording: { sessionId, surface: "public" },
          isPublishedRequest: true,
          userId: "learner-3",
          userName: "Cara",
          app: publishedApp,
          messages: [
            {
              role: "user",
              content: "What is this?",
              imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
            },
          ],
          assistantReply: "A diagram",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected a session after an image turn");
        const serialized = JSON.stringify(session.messages);
        assert(
          !serialized.includes("data:image"),
          "stored transcript must not contain image data URLs"
        );
        assertEqual(
          session.messages[0],
          {
            role: "user",
            content: "What is this?",
            at: now,
            imageOmitted: true,
          },
          "user message marks the omitted image"
        );
      },
    },
    {
      name: "missing message times fall back to the server now",
      run: async () => {
        const sessionId = "rec-times-fallback";
        await recordChatTurn({
          recording: { sessionId, surface: "public" },
          isPublishedRequest: true,
          userId: "learner-4",
          userName: "Dee",
          app: publishedApp,
          messages: [
            { role: "user", content: "One" },
            { role: "assistant", content: "Two" },
            { role: "user", content: "Three" },
          ],
          assistantReply: "Four",
          now,
        });
        const session = await getSessionById(sessionId);
        assert(session, "expected a session");
        assertEqual(
          session.messages.map((message) => message.at),
          [now, now, now, now],
          "all timestamps default to now"
        );
      },
    },
    {
      name: "recording cannot re-enable sharing on an unshared session",
      run: async () => {
        const sessionId = "rec-share-mono";
        await upsertSessionTurn({
          id: sessionId,
          appId: publishedApp.id,
          appName: publishedApp.name,
          ownerId: publishedApp.ownerId ?? "owner-1",
          participantId: "learner-5",
          participantName: "Eve",
          surface: "public",
          shared: false,
          messages: [
            { role: "user", content: "Hi", at: now },
            { role: "assistant", content: "Hello", at: now },
          ],
        });
        const result = await recordChatTurn({
          recording: {
            sessionId,
            surface: "public",
            ownerSharing: true,
          },
          isPublishedRequest: true,
          userId: "learner-5",
          userName: "Eve",
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Still unshared",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected the existing session");
        assertEqual(session.shared, false, "shared stays off");
      },
    },
    {
      name: "invalid recording payload skips without failing",
      run: async () => {
        let upserted = false;
        const result = await recordChatTurn(
          {
            recording: { surface: "public" },
            isPublishedRequest: true,
            userId: null,
            userName: null,
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Hi",
            now,
          },
          {
            upsert: async () => {
              upserted = true;
            },
          }
        );
        assertEqual(result.status, "skipped", "status");
        if (result.status === "skipped") {
          assertEqual(result.reason, "invalid-payload", "reason");
        }
        assertEqual(upserted, false, "upsert was not called");
      },
    },
    {
      name: "forced store failure is swallowed and does not throw",
      run: async () => {
        const result = await recordChatTurn(
          {
            recording: { sessionId: "rec-forced-fail", surface: "public" },
            isPublishedRequest: true,
            userId: "learner-6",
            userName: "Fay",
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Normal reply",
            now,
          },
          {
            upsert: async () => {
              throw new Error("forced store failure");
            },
          }
        );
        assertEqual(result.status, "failed", "status");
      },
    },
    {
      name: "route-level swallow still returns a normal reply",
      run: async () => {
        const reply = "Normal model reply";
        const response = await (async () => {
          await swallowRecordingFailure(async () => {
            throw new Error("forced store failure");
          });
          return { reply };
        })();
        assertEqual(response.reply, "Normal model reply", "reply");
      },
    },
    {
      name: "display-name resolver is used when the session name is blank",
      run: async () => {
        const sessionId = "rec-display-name";
        let resolvedFor: string | null = null;
        const result = await recordChatTurn(
          {
            recording: { sessionId, surface: "public" },
            isPublishedRequest: true,
            userId: "learner-7",
            userName: "   ",
            app: publishedApp,
            messages: incomingMessages,
            assistantReply: "Named",
            now,
          },
          {
            resolveDisplayName: async (userId) => {
              resolvedFor = userId;
              return "From Store";
            },
          }
        );
        assertEqual(result.status, "persisted", "status");
        assertEqual(resolvedFor, "learner-7", "resolver user id");
        const session = await getSessionById(sessionId);
        assert(session, "expected a session");
        assertEqual(session.participantName, "From Store", "participantName");
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`ok  ${check.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`fail ${check.name}: ${message}`);
    }
  }

  try {
    await fs.unlink(dataFile);
  } catch {
    // ignore cleanup failures
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log(`\n${checks.length} check(s) passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
