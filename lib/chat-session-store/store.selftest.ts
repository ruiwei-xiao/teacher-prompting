/**
 * Runtime self-test for ChatSessionStore multi-bot shared listing (Task 1.3).
 * Forces JSON file mode (no Postgres) for reliable local runs.
 *
 * Run: npx tsx lib/chat-session-store/store.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { ChatSessionRecord, SessionSummary } from "./types";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function session(partial: {
  id: string;
  appId: string;
  updatedAt: string;
  shared?: boolean;
  surface?: ChatSessionRecord["surface"];
  participantId?: string | null;
  participantName?: string | null;
}): ChatSessionRecord {
  const at = partial.updatedAt;
  return {
    id: partial.id,
    appId: partial.appId,
    appName: `Bot ${partial.appId}`,
    ownerId: "owner-1",
    participantId:
      partial.participantId === undefined ? "user-1" : partial.participantId,
    participantName:
      partial.participantName === undefined
        ? "Ada"
        : partial.participantName,
    surface: partial.surface ?? "public",
    shared: partial.shared ?? true,
    messages: [
      { role: "user", content: "Hello", at },
      { role: "assistant", content: "Hi", at },
    ],
    createdAt: at,
    updatedAt: at,
  };
}

function idsOf(page: { items: SessionSummary[] }): string[] {
  return page.items.map((item) => item.id);
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(process.cwd(), ".data", "chat-session-store-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  const dataFile = path.join(tempDir, "chat-sessions.json");
  process.env.CHAT_SESSIONS_DATA_FILE = dataFile;

  const { listSharedSessionsForAppIds } = await import("./store");

  try {
    const botA = "bot-a";
    const botB = "bot-b";
    const botC = "bot-c";

    const newest = "2026-09-06T12:00:03.000Z";
    const middle = "2026-09-06T12:00:02.000Z";
    const older = "2026-09-06T12:00:01.000Z";
    const tied = "2026-09-06T11:00:00.000Z";

    const records: ChatSessionRecord[] = [
      session({ id: "sess-a-newest", appId: botA, updatedAt: newest }),
      session({
        id: "sess-a-unshared",
        appId: botA,
        updatedAt: "2026-09-06T13:00:00.000Z",
        shared: false,
      }),
      session({
        id: "sess-b-middle",
        appId: botB,
        updatedAt: middle,
        surface: "editor-test",
        participantId: null,
        participantName: null,
      }),
      session({ id: "sess-c-other", appId: botC, updatedAt: newest }),
      session({ id: "sess-a-older", appId: botA, updatedAt: older }),
      session({ id: "sess-tie-z", appId: botB, updatedAt: tied }),
      session({ id: "sess-tie-a", appId: botA, updatedAt: tied }),
    ];

    await fs.writeFile(
      dataFile,
      JSON.stringify({ sessions: records }, null, 2),
      "utf-8"
    );

    const emptyIds = await listSharedSessionsForAppIds([], {
      limit: 10,
      offset: 0,
    });
    assertEqual(emptyIds.items, [], "empty appIds returns no items");
    assertEqual(emptyIds.hasMore, false, "empty appIds hasMore is false");

    const emptyStillEmpty = await listSharedSessionsForAppIds([], {
      limit: 1,
      offset: 0,
    });
    assertEqual(
      emptyStillEmpty.items.length,
      0,
      "empty appIds stays empty even when shared sessions exist"
    );

    const page = await listSharedSessionsForAppIds([botA, botB], {
      limit: 20,
      offset: 0,
    });
    assertEqual(
      idsOf(page),
      [
        "sess-a-newest",
        "sess-b-middle",
        "sess-a-older",
        "sess-tie-z",
        "sess-tie-a",
      ],
      "shared sessions across bots ordered by updatedAt desc then id desc"
    );
    assertEqual(page.hasMore, false, "full page hasMore is false");
    assert(
      !idsOf(page).includes("sess-a-unshared"),
      "unshared sessions are excluded"
    );
    assert(
      !idsOf(page).includes("sess-c-other"),
      "sessions for bots outside the id set are excluded"
    );

    for (const item of page.items) {
      assertEqual(item.shared, true, `${item.id} is shared`);
      assertEqual("messages" in item, false, `${item.id} summary omits transcript`);
      assertEqual(item.messageCount, 2, `${item.id} messageCount`);
      assertEqual(item.appExists, false, `${item.id} fake appExists is false`);
    }

    const first = await listSharedSessionsForAppIds([botA, botB], {
      limit: 2,
      offset: 0,
    });
    assertEqual(
      idsOf(first),
      ["sess-a-newest", "sess-b-middle"],
      "first page is the combined recency list, not per-bot pages"
    );
    assertEqual(first.hasMore, true, "first page hasMore when more remain");

    const second = await listSharedSessionsForAppIds([botA, botB], {
      limit: 2,
      offset: 2,
    });
    assertEqual(
      idsOf(second),
      ["sess-a-older", "sess-tie-z"],
      "offset continues the combined recency list"
    );
    assertEqual(second.hasMore, true, "middle page hasMore");

    const last = await listSharedSessionsForAppIds([botA, botB], {
      limit: 2,
      offset: 4,
    });
    assertEqual(idsOf(last), ["sess-tie-a"], "final page remainder");
    assertEqual(last.hasMore, false, "final page hasMore is false");

    const reversedIds = await listSharedSessionsForAppIds([botB, botA], {
      limit: 20,
      offset: 0,
    });
    const duplicatedIds = await listSharedSessionsForAppIds(
      [botA, botA, botB],
      { limit: 20, offset: 0 }
    );
    assertEqual(
      idsOf(reversedIds),
      idsOf(page),
      "equivalent app ids in different order return the same page"
    );
    assertEqual(
      idsOf(duplicatedIds),
      idsOf(page),
      "equivalent app ids with duplicates return the same page"
    );

    const fileRaw = await fs.readFile(dataFile, "utf-8");
    assert(
      !fileRaw.includes("workspaceId"),
      "chat session records are not stamped with workspaceId"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nstore.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("store.selftest: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
