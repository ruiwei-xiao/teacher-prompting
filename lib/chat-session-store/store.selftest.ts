/**
 * Runtime self-test for ChatSessionStore.
 * Covers multi-bot shared listing and the starting-version session stamp.
 * Forces JSON file mode (no Postgres) for reliable local runs.
 *
 * Run: npx tsx lib/chat-session-store/store.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  ChatSessionRecord,
  SessionSummary,
  StoredChatMessage,
  UpsertSessionTurnInput,
} from "./types";
import type {
  RecordChatTurnInput,
  RecordChatTurnResult,
} from "./record-chat-turn";

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

function stampTurn(id: string, content: string): UpsertSessionTurnInput {
  const at = "2026-09-28T15:00:00.000Z";
  const userMessage: StoredChatMessage = {
    role: "user",
    content,
    at,
  };
  Object.assign(userMessage, { configVersionId: "message-version" });
  return {
    id,
    appId: "bot-stamp",
    appName: "Stamp Bot",
    ownerId: "owner-1",
    participantId: "user-1",
    participantName: "Ada",
    surface: "public",
    shared: true,
    messages: [userMessage, { role: "assistant", content: "Reply", at }],
  };
}

async function readRawSessions(
  filePath: string
): Promise<Array<Record<string, unknown>>> {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf-8")) as {
    sessions?: Array<Record<string, unknown>>;
  };
  return Array.isArray(parsed.sessions) ? parsed.sessions : [];
}

function messagesOmitVersion(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((message) => {
    if (!message || typeof message !== "object") {
      return false;
    }
    return !Object.prototype.hasOwnProperty.call(message, "configVersionId");
  });
}

async function assertStartingVersionStamp(
  dataFile: string,
  getSessionById: (id: string) => Promise<ChatSessionRecord | null>,
  upsertSessionTurn: (
    input: UpsertSessionTurnInput,
    configVersionId?: string | null
  ) => Promise<void>,
  recordChatTurn: (
    input: RecordChatTurnInput
  ) => Promise<RecordChatTurnResult>
): Promise<void> {
  const existing = await readRawSessions(dataFile);
  const legacy = session({
    id: "stamp-legacy",
    appId: "bot-stamp",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
  const seeded: ChatSessionRecord = {
    ...session({
      id: "stamp-seeded",
      appId: "bot-stamp",
      updatedAt: "2026-09-02T00:00:00.000Z",
    }),
    configVersionId: "version-already-stored",
  };
  await fs.writeFile(
    dataFile,
    JSON.stringify({ sessions: [...existing, legacy, seeded] }, null, 2),
    "utf-8"
  );

  await upsertSessionTurn(
    stampTurn("stamp-new", "Hello"),
    "version-published-1"
  );
  const created = await getSessionById("stamp-new");
  assertEqual(
    created?.configVersionId,
    "version-published-1",
    "a new session stores the server-supplied starting version id"
  );
  let rawSessions = await readRawSessions(dataFile);
  const createdRaw = rawSessions.find((item) => item.id === "stamp-new");
  assertEqual(
    createdRaw?.configVersionId,
    "version-published-1",
    "json stores the starting version id on insert"
  );
  assert(
    messagesOmitVersion(createdRaw?.messages),
    "messages do not store a version id"
  );
  assert(
    !Object.prototype.hasOwnProperty.call(
      rawSessions.find((item) => item.id === "stamp-legacy") ?? {},
      "configVersionId"
    ),
    "inserting a stamped session does not backfill older sessions"
  );

  await upsertSessionTurn(stampTurn("stamp-new", "Next"), "version-other");
  const later = await getSessionById("stamp-new");
  assertEqual(
    later?.configVersionId,
    "version-published-1",
    "later turns do not change the starting version id"
  );
  rawSessions = await readRawSessions(dataFile);
  assert(
    messagesOmitVersion(
      rawSessions.find((item) => item.id === "stamp-new")?.messages
    ),
    "later-turn messages do not store a version id"
  );

  await upsertSessionTurn(
    stampTurn("stamp-legacy", "Still here"),
    "version-should-not-fill"
  );
  rawSessions = await readRawSessions(dataFile);
  const legacyRaw = rawSessions.find((item) => item.id === "stamp-legacy");
  assert(
    !Object.prototype.hasOwnProperty.call(legacyRaw ?? {}, "configVersionId"),
    "sessions that already exist stay without a version id"
  );
  const legacyLoaded = await getSessionById("stamp-legacy");
  assertEqual(
    legacyLoaded?.configVersionId,
    null,
    "a missing version id reads as null and is not filled in"
  );

  await upsertSessionTurn(
    stampTurn("stamp-seeded", "Again"),
    "version-replacement"
  );
  const seededLoaded = await getSessionById("stamp-seeded");
  assertEqual(
    seededLoaded?.configVersionId,
    "version-already-stored",
    "a later turn keeps the stored version id"
  );

  const stampApp = {
    id: "bot-stamp",
    name: "Stamp Bot",
    ownerId: "owner-1",
  };
  const stampedRecording = await recordChatTurn({
    recording: {
      sessionId: "stamp-body",
      surface: "public",
      configVersionId: "forged-from-body",
    },
    isPublishedRequest: true,
    app: stampApp,
    messages: [{ role: "user", content: "Question" }],
    assistantReply: "Answer",
    now: "2026-09-28T16:00:00.000Z",
    configVersionId: "server-version-9",
  });
  assertEqual(
    stampedRecording.status,
    "persisted",
    "recording persists when the body includes a version id"
  );
  const stamped = await getSessionById("stamp-body");
  assertEqual(
    stamped?.configVersionId,
    "server-version-9",
    "the server-supplied version id is stored and the client body id is ignored"
  );

  const replay = await recordChatTurn({
    recording: {
      sessionId: "stamp-body",
      surface: "public",
      configVersionId: "forged-again",
    },
    isPublishedRequest: true,
    app: stampApp,
    messages: [{ role: "user", content: "Follow up" }],
    assistantReply: "Still here",
    now: "2026-09-28T16:05:00.000Z",
    configVersionId: "server-version-later",
  });
  assertEqual(replay.status, "persisted", "later recording turn persists");
  const replayed = await getSessionById("stamp-body");
  assertEqual(
    replayed?.configVersionId,
    "server-version-9",
    "a later recording turn does not change the starting version id"
  );

  const bodyOnly = await recordChatTurn({
    recording: {
      sessionId: "stamp-body-only",
      surface: "public",
      configVersionId: "forged-from-body",
    },
    isPublishedRequest: true,
    app: stampApp,
    messages: [{ role: "user", content: "Only the body" }],
    assistantReply: "Ignored",
    now: "2026-09-28T16:10:00.000Z",
  });
  assertEqual(bodyOnly.status, "persisted", "body-only recording persists");
  const bodyOnlySession = await getSessionById("stamp-body-only");
  assertEqual(
    bodyOnlySession?.configVersionId,
    null,
    "a version id on the client recording body is ignored"
  );
  rawSessions = await readRawSessions(dataFile);
  const bodyOnlyRaw = rawSessions.find((item) => item.id === "stamp-body-only");
  assert(
    !Object.prototype.hasOwnProperty.call(bodyOnlyRaw ?? {}, "configVersionId"),
    "a client recording version id is not written onto the session"
  );
  assert(
    messagesOmitVersion(bodyOnlyRaw?.messages),
    "recorded messages do not store a version id"
  );
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

  const { getSessionById, listSharedSessionsForAppIds, upsertSessionTurn } =
    await import("./store");
  const { recordChatTurn } = await import("./record-chat-turn");

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

    await assertStartingVersionStamp(
      dataFile,
      getSessionById,
      upsertSessionTurn,
      recordChatTurn
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
