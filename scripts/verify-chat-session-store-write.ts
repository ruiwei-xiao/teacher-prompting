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

  const {
    upsertSessionTurn,
    getSessionById,
    attributeSessionsForVisitor,
    listSessionsForUser,
  } = await import("../lib/chat-session-store/store");

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
      name: "sharing can flip off and back on across upserts",
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
        const afterFlipOn = await getSessionById(unsharedId);
        assert(afterFlipOn, "unshared session should still exist");
        assertEqual(afterFlipOn.shared, true, "requested true re-enables sharing");
        assertEqual(
          afterFlipOn.messages,
          secondHistory,
          "transcript is replaced when sharing flips back on"
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
    {
      name: "public anonymous session round-trips visitor id without a participant account",
      run: async () => {
        const visitorId = "11111111-2222-4333-8444-555555555555";
        const id = "session-anon-visitor-1";
        await upsertSessionTurn({
          ...baseInput,
          id,
          participantId: null,
          participantName: null,
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: firstHistory,
        });
        const session = await getSessionById(id);
        assert(session, "expected a public anonymous session");
        assertEqual(session.anonymousVisitorId, visitorId, "anonymousVisitorId");
        assertEqual(session.participantId, null, "participantId stays null");
        assertEqual(session.participantName, null, "participantName stays null");
        assertEqual(session.surface, "public", "surface");

        await upsertSessionTurn({
          ...baseInput,
          id,
          participantId: null,
          participantName: null,
          surface: "public",
          messages: secondHistory,
        });
        const afterSecondTurn = await getSessionById(id);
        assert(afterSecondTurn, "expected the same session after a later turn");
        assertEqual(
          afterSecondTurn.anonymousVisitorId,
          visitorId,
          "visitor id is preserved on later turns"
        );
        assertEqual(
          afterSecondTurn.participantId,
          null,
          "later turns still have no participant account"
        );
      },
    },
    {
      name: "editor-test rows remain without a visitor id",
      run: async () => {
        const id = "session-editor-test-no-visitor";
        await upsertSessionTurn({
          ...baseInput,
          id,
          surface: "editor-test",
          messages: firstHistory,
        });
        const session = await getSessionById(id);
        assert(session, "expected an editor-test session");
        assertEqual(
          session.anonymousVisitorId,
          null,
          "editor-test has no visitor id"
        );
        assertEqual(session.surface, "editor-test", "surface");
      },
    },
    {
      name: "older records without the visitor id field read as absent",
      run: async () => {
        const id = "session-legacy-no-visitor-field";
        const raw = JSON.parse(await fs.readFile(dataFile, "utf-8")) as {
          sessions: Array<Record<string, unknown>>;
        };
        raw.sessions.push({
          id,
          appId: baseInput.appId,
          appName: baseInput.appName,
          ownerId: baseInput.ownerId,
          participantId: null,
          participantName: null,
          surface: "public",
          shared: true,
          messages: firstHistory,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
        await fs.writeFile(dataFile, JSON.stringify(raw, null, 2), "utf-8");

        const session = await getSessionById(id);
        assert(session, "expected a legacy session");
        assertEqual(
          session.anonymousVisitorId,
          null,
          "missing visitor id field reads as null"
        );
        assertEqual(session.participantId, null, "legacy participantId");
      },
    },
    {
      name: "attributeSessionsForVisitor promotes null-participant rows to the claimant",
      run: async () => {
        const visitorId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
        const id = "session-claim-null-participant";
        await upsertSessionTurn({
          ...baseInput,
          id,
          participantId: null,
          participantName: null,
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: firstHistory,
        });

        const result = await attributeSessionsForVisitor({
          anonymousVisitorId: visitorId,
          userId: "claimant-1",
          participantName: "Claimant One",
        });
        assertEqual(result.attributedCount, 1, "attributedCount");

        const session = await getSessionById(id);
        assert(session, "expected the promoted session");
        assertEqual(session.participantId, "claimant-1", "participantId");
        assertEqual(
          session.participantName,
          "Claimant One",
          "participantName uses the signed-in display name"
        );
        assertEqual(
          session.anonymousVisitorId,
          visitorId,
          "visitor id is retained after attribution"
        );
        assertEqual(session.messages, firstHistory, "transcript stays put");

        const mine = await listSessionsForUser("claimant-1", {
          limit: 20,
          offset: 0,
        });
        assert(
          mine.items.some((item) => item.id === id),
          "promoted session appears in My sessions"
        );

        const second = await attributeSessionsForVisitor({
          anonymousVisitorId: visitorId,
          userId: "claimant-1",
          participantName: "Claimant One",
        });
        assertEqual(second.attributedCount, 0, "repeat claim is a no-op");
      },
    },
    {
      name: "attributeSessionsForVisitor leaves already-claimed rows unchanged",
      run: async () => {
        const visitorId = "ffffffff-1111-4222-8333-444444444444";
        const claimedId = "session-already-claimed";
        const openId = "session-still-open-for-claim";
        await upsertSessionTurn({
          ...baseInput,
          id: claimedId,
          participantId: "earlier-user",
          participantName: "Earlier User",
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: firstHistory,
        });
        await upsertSessionTurn({
          ...baseInput,
          id: openId,
          participantId: null,
          participantName: null,
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: firstHistory,
        });

        const result = await attributeSessionsForVisitor({
          anonymousVisitorId: visitorId,
          userId: "later-user",
          participantName: "Later User",
        });
        assertEqual(result.attributedCount, 1, "only the unattributed row");

        const claimed = await getSessionById(claimedId);
        assert(claimed, "already-claimed session should still exist");
        assertEqual(
          claimed.participantId,
          "earlier-user",
          "already-claimed participantId stays put"
        );
        assertEqual(
          claimed.participantName,
          "Earlier User",
          "already-claimed display name stays put"
        );

        const open = await getSessionById(openId);
        assert(open, "unattributed session should still exist");
        assertEqual(open.participantId, "later-user", "open row becomes claimant");
        assertEqual(
          open.participantName,
          "Later User",
          "open row display name"
        );
      },
    },
    {
      name: "matching visitor ids allow one-way promotion on later turns",
      run: async () => {
        const visitorId = "99999999-8888-4777-8666-555555555555";
        const id = "session-midchat-login";
        await upsertSessionTurn({
          ...baseInput,
          id,
          participantId: null,
          participantName: null,
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: firstHistory,
        });

        await upsertSessionTurn({
          ...baseInput,
          id,
          participantId: "signed-in-user",
          participantName: "Signed In",
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: secondHistory,
        });

        const session = await getSessionById(id);
        assert(session, "expected the continued conversation");
        assertEqual(session.id, id, "same conversation id");
        assertEqual(session.participantId, "signed-in-user", "promoted participantId");
        assertEqual(
          session.participantName,
          "Signed In",
          "promoted participantName"
        );
        assertEqual(
          session.anonymousVisitorId,
          visitorId,
          "visitor id stays on the continued conversation"
        );
        assertEqual(session.messages, secondHistory, "later-turn transcript");
      },
    },
    {
      name: "mismatched participant still fails when visitor ids are present",
      run: async () => {
        const visitorId = "12121212-3434-4656-8787-909090909090";
        const claimedId = "session-mismatch-already-owned";
        const anonId = "session-mismatch-anon";
        await upsertSessionTurn({
          ...baseInput,
          id: claimedId,
          participantId: "owner-user",
          participantName: "Owner User",
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: firstHistory,
        });
        await upsertSessionTurn({
          ...baseInput,
          id: anonId,
          participantId: null,
          participantName: null,
          surface: "public",
          anonymousVisitorId: visitorId,
          messages: firstHistory,
        });

        const claimedBefore = await getSessionById(claimedId);
        assert(claimedBefore, "owned session should exist");
        let otherAccountRejected = false;
        try {
          await upsertSessionTurn({
            ...baseInput,
            id: claimedId,
            participantId: "other-user",
            participantName: "Other User",
            surface: "public",
            anonymousVisitorId: visitorId,
            messages: secondHistory,
          });
        } catch {
          otherAccountRejected = true;
        }
        assert(
          otherAccountRejected,
          "expected rejection when another account tries to take the session"
        );

        const anonBefore = await getSessionById(anonId);
        assert(anonBefore, "anonymous session should exist");
        let visitorMismatchRejected = false;
        try {
          await upsertSessionTurn({
            ...baseInput,
            id: anonId,
            participantId: "signed-in-user",
            participantName: "Signed In",
            surface: "public",
            anonymousVisitorId: "00000000-0000-4000-8000-000000000000",
            messages: secondHistory,
          });
        } catch {
          visitorMismatchRejected = true;
        }
        assert(
          visitorMismatchRejected,
          "expected rejection when visitor ids do not match"
        );

        let missingVisitorRejected = false;
        try {
          await upsertSessionTurn({
            ...baseInput,
            id: anonId,
            participantId: "signed-in-user",
            participantName: "Signed In",
            surface: "public",
            messages: secondHistory,
          });
        } catch {
          missingVisitorRejected = true;
        }
        assert(
          missingVisitorRejected,
          "expected rejection when the later turn has no visitor id"
        );

        const claimedAfter = await getSessionById(claimedId);
        assert(claimedAfter, "owned session should still exist");
        assertEqual(
          claimedAfter.participantId,
          claimedBefore.participantId,
          "owned participantId unchanged"
        );
        assertEqual(
          claimedAfter.messages,
          claimedBefore.messages,
          "owned transcript unchanged"
        );

        const anonAfter = await getSessionById(anonId);
        assert(anonAfter, "anonymous session should still exist");
        assertEqual(anonAfter.participantId, null, "anon participantId unchanged");
        assertEqual(
          anonAfter.messages,
          anonBefore.messages,
          "anon transcript unchanged"
        );
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
