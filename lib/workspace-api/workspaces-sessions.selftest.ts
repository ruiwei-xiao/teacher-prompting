/**
 * Self-test: WorkspacesAPI shared session list (Task 4.1).
 * Uses JSON workspace + chat-session stores (auth injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-sessions.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { ChatSessionRecord, SessionSummary } from "@/lib/chat-session-store/types";

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
  appName?: string;
  ownerId?: string;
  updatedAt: string;
  createdAt?: string;
  shared?: boolean;
  surface?: ChatSessionRecord["surface"];
  participantId?: string | null;
  participantName?: string | null;
}): ChatSessionRecord {
  const at = partial.updatedAt;
  return {
    id: partial.id,
    appId: partial.appId,
    appName: partial.appName ?? `Bot ${partial.appId}`,
    ownerId: partial.ownerId ?? "owner_1",
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
    createdAt: partial.createdAt ?? at,
    updatedAt: at,
  };
}

function idsOf(items: SessionSummary[]): string[] {
  return items.map((item) => item.id);
}

function hasListFields(item: SessionSummary): boolean {
  return (
    typeof item.appName === "string" &&
    (typeof item.participantName === "string" || item.participantName === null) &&
    typeof item.createdAt === "string" &&
    (item.surface === "public" || item.surface === "editor-test")
  );
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(
    process.cwd(),
    ".data",
    "workspaces-sessions-selftest"
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");
  const sessionsFile = path.join(tempDir, "chat-sessions.json");
  process.env.CHAT_SESSIONS_DATA_FILE = sessionsFile;

  const { listWorkspaceSessions } = await import("./workspaces-sessions");
  const {
    addMember,
    appendActivity,
    createWorkspace,
    placeApp,
    removePlacement,
  } = await import("../workspace-store/store");
  const { listSharedSessionsForAppIds } = await import(
    "../chat-session-store/store"
  );

  try {
    assertEqual(
      (await listWorkspaceSessions(null, "any")).status,
      401,
      "GET sessions without auth → 401"
    );

    const ownerId = "owner_1";
    const facId = "fac_1";
    const partId = "part_1";
    const outsiderId = "outsider_1";
    const otherOwnerId = "other_owner";

    const ws = await createWorkspace({
      name: "Sessions Lab",
      ownerUserId: ownerId,
    });
    const emptyWs = await createWorkspace({
      name: "Empty Placements",
      ownerUserId: ownerId,
    });
    await addMember({ workspaceId: ws.id, userId: facId, role: "facilitator" });
    await addMember({
      workspaceId: ws.id,
      userId: partId,
      role: "participant",
    });

    const placedOwned = "bot_owned";
    const placedOthers = "bot_others";
    const unplacedBot = "bot_unplaced";

    await placeApp(ws.id, placedOwned, ownerId);
    await placeApp(ws.id, placedOthers, otherOwnerId);
    await placeApp(ws.id, unplacedBot, ownerId);
    await removePlacement(ws.id, unplacedBot);

    const newest = "2026-09-06T12:00:03.000Z";
    const middle = "2026-09-06T12:00:02.000Z";
    const older = "2026-09-06T12:00:01.000Z";

    const records: ChatSessionRecord[] = [
      session({
        id: "sess-owned-newest",
        appId: placedOwned,
        appName: "Owned Bot",
        ownerId,
        updatedAt: newest,
        createdAt: "2026-09-06T11:00:00.000Z",
        surface: "public",
        participantName: "Ada",
      }),
      session({
        id: "sess-owned-unshared",
        appId: placedOwned,
        ownerId,
        updatedAt: "2026-09-06T13:00:00.000Z",
        shared: false,
      }),
      session({
        id: "sess-others-middle",
        appId: placedOthers,
        appName: "Peer Bot",
        ownerId: otherOwnerId,
        updatedAt: middle,
        createdAt: "2026-09-06T10:30:00.000Z",
        surface: "editor-test",
        participantId: null,
        participantName: null,
      }),
      session({
        id: "sess-unplaced",
        appId: unplacedBot,
        ownerId,
        updatedAt: newest,
      }),
      session({
        id: "sess-owned-older",
        appId: placedOwned,
        appName: "Owned Bot",
        ownerId,
        updatedAt: older,
        createdAt: "2026-09-06T09:00:00.000Z",
      }),
    ];
    await fs.writeFile(
      sessionsFile,
      JSON.stringify({ sessions: records }, null, 2),
      "utf-8"
    );

    await appendActivity({
      workspaceId: ws.id,
      type: "member.joined",
      actorUserId: ownerId,
      payload: { userId: partId, role: "participant" },
    });
    await appendActivity({
      workspaceId: ws.id,
      type: "bot.placed",
      actorUserId: ownerId,
      payload: { appId: placedOwned },
    });

    assertEqual(
      (await listWorkspaceSessions(ownerId, "missing-id")).status,
      404,
      "GET sessions missing workspace → 404"
    );

    assertEqual(
      (await listWorkspaceSessions(outsiderId, ws.id)).status,
      403,
      "GET sessions non-member → 403"
    );

    const participantList = await listWorkspaceSessions(partId, ws.id);
    assertEqual(participantList.status, 403, "GET sessions Participant → 403");
    assert(
      !participantList.ok,
      "Participant must not receive a sessions payload"
    );

    const ownerList = await listWorkspaceSessions(ownerId, ws.id);
    assertEqual(ownerList.status, 200, "Owner GET sessions → 200");
    assert(
      ownerList.ok && Array.isArray(ownerList.body.sessions),
      "Owner response has sessions array"
    );
    assert(
      ownerList.ok && typeof ownerList.body.hasMore === "boolean",
      "Owner response has hasMore"
    );
    if (ownerList.ok) {
      assert(
        !("events" in ownerList.body),
        "sessions payload must not include event-feed events"
      );
      assertEqual(
        idsOf(ownerList.body.sessions),
        ["sess-owned-newest", "sess-others-middle", "sess-owned-older"],
        "operator list is shared sessions of current placements, newest first"
      );
      assert(
        !idsOf(ownerList.body.sessions).includes("sess-owned-unshared"),
        "unshared sessions are excluded"
      );
      assert(
        !idsOf(ownerList.body.sessions).includes("sess-unplaced"),
        "unplaced bot sessions are excluded"
      );
      assert(
        ownerList.body.sessions.every(hasListFields),
        "each row includes appName, participantName, createdAt, and surface"
      );
      const named = ownerList.body.sessions.find(
        (row) => row.id === "sess-owned-newest"
      );
      const anonymous = ownerList.body.sessions.find(
        (row) => row.id === "sess-others-middle"
      );
      assertEqual(named?.appName, "Owned Bot", "listed bot name");
      assertEqual(named?.participantName, "Ada", "listed participant display name");
      assertEqual(
        named?.createdAt,
        "2026-09-06T11:00:00.000Z",
        "listed session start time"
      );
      assertEqual(named?.surface, "public", "listed public surface");
      assertEqual(anonymous?.appName, "Peer Bot", "includes bots the operator does not own");
      assertEqual(
        anonymous?.participantName,
        null,
        "anonymous participantName is null for UI Anonymous"
      );
      assertEqual(
        anonymous?.surface,
        "editor-test",
        "listed editor-test surface"
      );
      assert(
        ownerList.body.sessions.every((row) => row.shared === true),
        "listed rows are shared"
      );

      const expected = await listSharedSessionsForAppIds(
        [placedOwned, placedOthers],
        { limit: 20, offset: 0 }
      );
      assertEqual(
        idsOf(ownerList.body.sessions),
        idsOf(expected.items),
        "operator list matches listSharedSessionsForAppIds of current placements only"
      );
    }

    const facList = await listWorkspaceSessions(facId, ws.id);
    assertEqual(facList.status, 200, "Facilitator GET sessions → 200");
    if (facList.ok && ownerList.ok) {
      assertEqual(
        idsOf(facList.body.sessions),
        idsOf(ownerList.body.sessions),
        "Facilitator sees the same shared placement sessions as Owner"
      );
    }

    const emptyList = await listWorkspaceSessions(ownerId, emptyWs.id);
    assertEqual(emptyList.status, 200, "Owner GET empty placements → 200");
    if (emptyList.ok) {
      assertEqual(
        emptyList.body.sessions,
        [],
        "empty placements yield an empty sessions list"
      );
      assertEqual(
        emptyList.body.hasMore,
        false,
        "empty placements hasMore is false"
      );
    }

    const implSource = await fs.readFile(
      path.join(process.cwd(), "lib/workspace-api/workspaces-sessions.ts"),
      "utf-8"
    );
    assert(
      !implSource.includes("workspaces-activity") &&
        !implSource.includes("listActivity") &&
        !implSource.includes("listWorkspaceActivity"),
      "workspaces-sessions.ts must not import or list the event-feed store"
    );

    const routeSource = await fs.readFile(
      path.join(
        process.cwd(),
        "app/api/workspaces/[workspaceId]/sessions/route.ts"
      ),
      "utf-8"
    );
    assert(
      routeSource.includes("listWorkspaceSessions") &&
        !routeSource.includes("listWorkspaceActivity") &&
        !routeSource.includes("listActivity"),
      "sessions route is a thin wrapper around listWorkspaceSessions, not the event feed"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nworkspaces-sessions.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("workspaces-sessions.selftest: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
