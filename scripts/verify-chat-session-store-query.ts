/**
 * Task-local verification for chat-session-store query and sharing mutations (task 1.2).
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const dataFile = path.join(
    os.tmpdir(),
    `chat-sessions-query-${process.pid}-${Date.now()}.json`
  );
  process.env.CHAT_SESSIONS_DATA_FILE = dataFile;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const {
    upsertSessionTurn,
    getSessionById,
    listSessionsForApp,
    listSessionsForUser,
    disableSharing,
    enableSharing,
    discardSession,
  } = await import("../lib/chat-session-store/store");
  const {
    MY_SESSIONS_HREF,
    isMySessionsPath,
    activityHrefForApp,
  } = await import("../lib/chat-session-ui/nav");

  const messages = [
    {
      role: "user" as const,
      content: "Hello",
      at: "2026-08-24T12:00:00.000Z",
    },
    {
      role: "assistant" as const,
      content: "Hi",
      at: "2026-08-24T12:00:01.000Z",
    },
  ];

  const longerMessages = [
    ...messages,
    {
      role: "user" as const,
      content: "More",
      at: "2026-08-24T12:00:02.000Z",
    },
  ];

  const botA = {
    appId: "query-bot-a",
    appName: "Bot A",
    ownerId: "owner-a",
  };
  const botB = {
    appId: "query-bot-b",
    appName: "Bot B",
    ownerId: "owner-b",
  };
  const missingBot = {
    appId: `missing-bot-${Date.now()}`,
    appName: "Deleted Bot",
    ownerId: "owner-gone",
  };

  const user1 = { participantId: "user-1", participantName: "Ada" };
  const user2 = { participantId: "user-2", participantName: "Bea" };

  const checks: Check[] = [
    {
      name: "nav constants: My sessions path and per-bot activity href",
      run: async () => {
        assertEqual(MY_SESSIONS_HREF, "/sessions", "MY_SESSIONS_HREF");
        assertEqual(isMySessionsPath("/sessions"), true, "exact /sessions");
        assertEqual(isMySessionsPath("/sessions/"), true, "trailing slash");
        assertEqual(
          isMySessionsPath("/sessions/abc"),
          true,
          "nested under /sessions"
        );
        assertEqual(isMySessionsPath("/"), false, "root is not My sessions");
        assertEqual(
          isMySessionsPath("/starred"),
          false,
          "unrelated path is not My sessions"
        );
        assertEqual(
          activityHrefForApp("bot-42"),
          "/app/bot-42/activity",
          "activityHrefForApp"
        );
      },
    },
    {
      name: "owner list is scoped to one bot, shared only, newest first",
      run: async () => {
        await upsertSessionTurn({
          id: "own-shared-old",
          ...botA,
          ...user1,
          surface: "public",
          shared: true,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "own-unshared",
          ...botA,
          ...user1,
          surface: "public",
          shared: false,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "own-shared-new",
          ...botA,
          ...user2,
          surface: "editor-test",
          shared: true,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "own-other-bot",
          ...botB,
          ...user1,
          surface: "public",
          shared: true,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "own-anonymous-shared",
          ...botA,
          participantId: null,
          participantName: null,
          surface: "public",
          shared: true,
          messages,
        });

        const page = await listSessionsForApp(botA.appId, {
          limit: 20,
          offset: 0,
        });
        const ids = page.items.map((item) => item.id);
        assertEqual(
          ids.includes("own-unshared"),
          false,
          "owner list excludes unshared"
        );
        assertEqual(
          ids.includes("own-other-bot"),
          false,
          "owner list excludes other bots"
        );
        assert(
          ids.includes("own-shared-old") &&
            ids.includes("own-shared-new") &&
            ids.includes("own-anonymous-shared"),
          "owner list includes shared sessions for this bot"
        );
        assertEqual(page.hasMore, false, "owner list hasMore when fully loaded");
        assertEqual(
          ids[0],
          "own-anonymous-shared",
          "newest shared activity first"
        );
        assertEqual(ids[1], "own-shared-new", "second-newest shared");
        assertEqual(ids[2], "own-shared-old", "oldest shared last");
        for (const item of page.items) {
          assertEqual(item.shared, true, `${item.id} shared`);
          assertEqual(
            "messages" in item,
            false,
            `${item.id} summary omits transcript`
          );
          assertEqual(item.messageCount, messages.length, "messageCount");
        }
      },
    },
    {
      name: "participant list is across bots, newest first, never anonymous",
      run: async () => {
        await upsertSessionTurn({
          id: "part-own-unshared",
          ...botA,
          ...user1,
          surface: "public",
          shared: false,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "part-other-bot",
          ...botB,
          ...user1,
          surface: "public",
          shared: true,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "part-editor-test",
          ...botA,
          ...user1,
          surface: "editor-test",
          shared: true,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "part-anonymous",
          ...botA,
          participantId: null,
          participantName: null,
          surface: "public",
          shared: true,
          messages,
        });
        await sleep(15);
        await upsertSessionTurn({
          id: "part-other-user",
          ...botA,
          ...user2,
          surface: "public",
          shared: true,
          messages,
        });

        const page = await listSessionsForUser(user1.participantId, {
          limit: 50,
          offset: 0,
        });
        const ids = page.items.map((item) => item.id);
        assert(
          ids.includes("part-own-unshared"),
          "participant list includes unshared"
        );
        assert(
          ids.includes("part-other-bot"),
          "participant list includes other users' bots"
        );
        assert(
          ids.includes("part-editor-test"),
          "participant list includes editor tests"
        );
        assertEqual(
          ids.includes("part-anonymous"),
          false,
          "participant list excludes anonymous"
        );
        assertEqual(
          ids.includes("part-other-user"),
          false,
          "participant list excludes other users"
        );
        for (const item of page.items) {
          assertEqual(
            item.participantId,
            user1.participantId,
            `${item.id} participantId`
          );
        }
        const seeded = [
          "part-own-unshared",
          "part-other-bot",
          "part-editor-test",
        ];
        const seededOrder = ids.filter((id) => seeded.includes(id));
        assertEqual(
          seededOrder,
          ["part-editor-test", "part-other-bot", "part-own-unshared"],
          "participant newest first among seeded"
        );
      },
    },
    {
      name: "paging returns a has-more signal",
      run: async () => {
        const pageAppId = "query-page-bot";
        for (let i = 0; i < 3; i += 1) {
          await upsertSessionTurn({
            id: `page-session-${i}`,
            appId: pageAppId,
            appName: "Paged",
            ownerId: "owner-page",
            participantId: "page-user",
            participantName: "Page",
            surface: "public",
            shared: true,
            messages,
          });
          await sleep(15);
        }

        const first = await listSessionsForApp(pageAppId, {
          limit: 2,
          offset: 0,
        });
        assertEqual(first.items.length, 2, "first page size");
        assertEqual(first.hasMore, true, "first page hasMore");
        assertEqual(first.items[0]?.id, "page-session-2", "newest on first page");
        assertEqual(first.items[1]?.id, "page-session-1", "next on first page");

        const second = await listSessionsForApp(pageAppId, {
          limit: 2,
          offset: 2,
        });
        assertEqual(second.items.length, 1, "second page size");
        assertEqual(second.hasMore, false, "second page hasMore");
        assertEqual(second.items[0]?.id, "page-session-0", "oldest on last page");

        const userFirst = await listSessionsForUser("page-user", {
          limit: 2,
          offset: 0,
        });
        assertEqual(userFirst.items.length, 2, "user first page size");
        assertEqual(userFirst.hasMore, true, "user first page hasMore");
      },
    },
    {
      name: "single-session lookup returns the full transcript",
      run: async () => {
        await upsertSessionTurn({
          id: "lookup-full",
          ...botA,
          ...user1,
          surface: "public",
          shared: true,
          messages: longerMessages,
        });
        const session = await getSessionById("lookup-full");
        assert(session, "expected the recorded session");
        assertEqual(session.messages, longerMessages, "full transcript");
      },
    },
    {
      name: "summaries expose messageCount and appExists false when bot is missing",
      run: async () => {
        await upsertSessionTurn({
          id: "missing-bot-session",
          ...missingBot,
          ...user1,
          surface: "public",
          shared: true,
          messages: longerMessages,
        });
        const ownerPage = await listSessionsForApp(missingBot.appId, {
          limit: 10,
          offset: 0,
        });
        const ownerItem = ownerPage.items.find(
          (item) => item.id === "missing-bot-session"
        );
        assert(ownerItem, "owner list should include the missing-bot session");
        assertEqual(ownerItem.messageCount, longerMessages.length, "owner messageCount");
        assertEqual(ownerItem.appExists, false, "owner appExists when bot missing");

        const userPage = await listSessionsForUser(user1.participantId, {
          limit: 50,
          offset: 0,
        });
        const userItem = userPage.items.find(
          (item) => item.id === "missing-bot-session"
        );
        assert(userItem, "participant list should include the missing-bot session");
        assertEqual(userItem.messageCount, longerMessages.length, "user messageCount");
        assertEqual(userItem.appExists, false, "user appExists when bot missing");
      },
    },
    {
      name: "disableSharing hides from owner; enableSharing restores it",
      run: async () => {
        await upsertSessionTurn({
          id: "share-toggle",
          ...botA,
          ...user1,
          surface: "public",
          shared: true,
          messages,
        });
        const beforeOwner = await listSessionsForApp(botA.appId, {
          limit: 50,
          offset: 0,
        });
        assert(
          beforeOwner.items.some((item) => item.id === "share-toggle"),
          "shared session is visible to the owner"
        );

        await disableSharing("share-toggle");
        const after = await getSessionById("share-toggle");
        assert(after, "session remains after disableSharing");
        assertEqual(after.shared, false, "shared flipped to false");
        assertEqual(after.messages, messages, "transcript unchanged");

        await disableSharing("share-toggle");
        const stillOff = await getSessionById("share-toggle");
        assert(stillOff, "session still exists after second disableSharing");
        assertEqual(stillOff.shared, false, "already-false stays false");

        const afterOwner = await listSessionsForApp(botA.appId, {
          limit: 50,
          offset: 0,
        });
        assertEqual(
          afterOwner.items.some((item) => item.id === "share-toggle"),
          false,
          "unshared session disappears from the owner list"
        );

        const afterUser = await listSessionsForUser(user1.participantId, {
          limit: 50,
          offset: 0,
        });
        const kept = afterUser.items.find((item) => item.id === "share-toggle");
        assert(kept, "unshared session remains in the participant list");
        assertEqual(kept.shared, false, "participant summary shows unshared");

        await enableSharing("share-toggle");
        const reenabled = await getSessionById("share-toggle");
        assert(reenabled, "session remains after enableSharing");
        assertEqual(reenabled.shared, true, "shared flipped back to true");

        const ownerAgain = await listSessionsForApp(botA.appId, {
          limit: 50,
          offset: 0,
        });
        assert(
          ownerAgain.items.some((item) => item.id === "share-toggle"),
          "re-shared session returns to the owner list"
        );
      },
    },
    {
      name: "discardSession deletes the row",
      run: async () => {
        await upsertSessionTurn({
          id: "anon-discard",
          ...botA,
          participantId: null,
          participantName: null,
          surface: "public",
          shared: true,
          messages,
        });
        const before = await getSessionById("anon-discard");
        assert(before, "anonymous session should exist before discard");

        await discardSession("anon-discard");
        const after = await getSessionById("anon-discard");
        assertEqual(after, null, "discarded session is gone");

        const ownerPage = await listSessionsForApp(botA.appId, {
          limit: 50,
          offset: 0,
        });
        assertEqual(
          ownerPage.items.some((item) => item.id === "anon-discard"),
          false,
          "discarded session is absent from the owner list"
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
