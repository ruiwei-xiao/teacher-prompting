/**
 * Task-local verification for chat-session-store write path (task 1.1).
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
    `chat-sessions-verify-${process.pid}-${Date.now()}.json`
  );
  process.env.CHAT_SESSIONS_DATA_FILE = dataFile;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const { upsertSessionTurn, getSessionById } = await import(
    "../lib/chat-session-store/store"
  );

  const baseInput = {
    id: "session-write-1",
    appId: "app-bot-1",
    appName: "Tutor Bot",
    ownerId: "owner-1",
    participantId: "user-1",
    participantName: "Ada",
    surface: "public" as const,
  };

  const firstHistory = [
    {
      role: "user" as const,
      content: "Hello",
      at: "2026-08-24T12:00:00.000Z",
    },
    {
      role: "assistant" as const,
      content: "Hi there",
      at: "2026-08-24T12:00:01.000Z",
    },
  ];

  const secondHistory = [
    ...firstHistory,
    {
      role: "user" as const,
      content: "Show the diagram",
      at: "2026-08-24T12:01:00.000Z",
      imageOmitted: true as const,
    },
    {
      role: "assistant" as const,
      content: "Here it is",
      at: "2026-08-24T12:01:01.000Z",
    },
  ];

  const checks: Check[] = [
    {
      name: "first-turn create persists metadata and transcript",
      run: async () => {
        await upsertSessionTurn({
          ...baseInput,
          messages: firstHistory,
        });
        const session = await getSessionById(baseInput.id);
        assert(session, "expected a session after the first turn");
        assertEqual(session.appId, baseInput.appId, "appId");
        assertEqual(session.appName, baseInput.appName, "appName");
        assertEqual(session.ownerId, baseInput.ownerId, "ownerId");
        assertEqual(
          session.participantId,
          baseInput.participantId,
          "participantId"
        );
        assertEqual(
          session.participantName,
          baseInput.participantName,
          "participantName"
        );
        assertEqual(session.surface, "public", "surface");
        assertEqual(session.shared, true, "default shared");
        assertEqual(session.messages, firstHistory, "first-turn transcript");
        assert(session.createdAt, "createdAt is required");
        assert(session.updatedAt, "updatedAt is required");
      },
    },
    {
      name: "second-turn replace keeps one session with the latest transcript",
      run: async () => {
        const before = await getSessionById(baseInput.id);
        assert(before, "session should already exist");
        await upsertSessionTurn({
          ...baseInput,
          messages: secondHistory,
        });
        const after = await getSessionById(baseInput.id);
        assert(after, "expected the same session after the second turn");
        assertEqual(after.id, baseInput.id, "session id");
        assertEqual(after.createdAt, before.createdAt, "createdAt preserved");
        assertEqual(after.messages, secondHistory, "replaced transcript");
        const raw = await fs.readFile(dataFile, "utf-8");
        const parsed = JSON.parse(raw) as { sessions?: unknown[] };
        assertEqual(parsed.sessions?.length, 1, "session count after two upserts");
      },
    },
    {
      name: "identity mismatch on bot or participant is rejected",
      run: async () => {
        const before = await getSessionById(baseInput.id);
        assert(before, "session should already exist");

        let botRejected = false;
        try {
          await upsertSessionTurn({
            ...baseInput,
            appId: "other-bot",
            messages: secondHistory,
          });
        } catch {
          botRejected = true;
        }
        assert(botRejected, "expected rejection when appId does not match");

        let participantRejected = false;
        try {
          await upsertSessionTurn({
            ...baseInput,
            participantId: "other-user",
            messages: secondHistory,
          });
        } catch {
          participantRejected = true;
        }
        assert(
          participantRejected,
          "expected rejection when participantId does not match"
        );

        const after = await getSessionById(baseInput.id);
        assert(after, "session should still exist after rejected writes");
        assertEqual(after.messages, before.messages, "transcript unchanged");
        assertEqual(after.appId, before.appId, "appId unchanged");
        assertEqual(
          after.participantId,
          before.participantId,
          "participantId unchanged"
        );
      },
    },
    {
      name: "sharing is monotonic: create-off stays off and cannot flip back on",
      run: async () => {
        const unsharedId = "session-unshared-1";
        await upsertSessionTurn({
          ...baseInput,
          id: unsharedId,
          shared: false,
          messages: firstHistory,
        });
        const created = await getSessionById(unsharedId);
        assert(created, "expected an unshared session on create");
        assertEqual(created.shared, false, "create with sharing off");

        await upsertSessionTurn({
          ...baseInput,
          id: unsharedId,
          shared: true,
          messages: secondHistory,
        });
        const afterFlipAttempt = await getSessionById(unsharedId);
        assert(afterFlipAttempt, "unshared session should still exist");
        assertEqual(
          afterFlipAttempt.shared,
          false,
          "must not flip unshared back to shared"
        );
        assertEqual(
          afterFlipAttempt.messages,
          secondHistory,
          "transcript still replaced while sharing stays off"
        );

        const sharedId = "session-shared-then-off";
        await upsertSessionTurn({
          ...baseInput,
          id: sharedId,
          shared: true,
          messages: firstHistory,
        });
        await upsertSessionTurn({
          ...baseInput,
          id: sharedId,
          shared: false,
          messages: secondHistory,
        });
        const turnedOff = await getSessionById(sharedId);
        assert(turnedOff, "expected session after turning sharing off");
        assertEqual(turnedOff.shared, false, "true → false is allowed");
      },
    },
  ];

  let failed = 0;
  try {
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
  } finally {
    await fs.rm(dataFile, { force: true });
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${checks.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\n${checks.length} checks passed.`);
}

void main();
