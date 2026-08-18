/**
 * Self-test: collaborative rubric/notes editor wiring (Tasks 6.2–6.3).
 * Proves room id, two Yjs doc keys, CollaborationPlugin + LiveblocksYjsProvider,
 * identity cursors, snapshot POST, outage degradation, post-lock read-only,
 * SpaceLayout composition, and that chat/artifacts/scores stay free of
 * Liveblocks/Yjs. Two-browser live proof is E2E (task 8.2).
 * Run: npx tsx lib/calibration-ui/docs.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { UserState } from "@lexical/yjs";
import * as Y from "yjs";
import {
  DOC_YJS_KEYS,
  LIVEBLOCKS_AUTH_ENDPOINT,
  LIVEBLOCKS_OUTAGE_BANNER,
  SNAPSHOT_DEBOUNCE_MS,
  canPushDocSnapshot,
  cursorIdentity,
  isLiveblocksOutage,
  liveblocksRoomId,
  shouldShowReadOnly,
  snapshotApiHref,
  snapshotPostBody,
  snapshotsFromDocs,
} from "./docs";
import {
  createSharedDocProvider,
  type AwarenessRoom,
  type RoomYjsHost,
} from "./docs-provider";

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

function cursorState(name: string): UserState {
  return {
    anchorPos: null,
    color: "#0ea5e9",
    focusing: true,
    focusPos: null,
    name,
    awarenessData: {},
  };
}

function fakeRoomProvider(): {
  host: RoomYjsHost;
  disconnectCalls: { count: number };
} {
  const root = new Y.Doc();
  const disconnectCalls = { count: 0 };
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const host: RoomYjsHost = {
    getYDoc: () => root,
    loadSubdoc: (guid: string) => {
      for (const subdoc of root.subdocs) {
        if (subdoc.guid === guid) {
          subdoc.load();
          return true;
        }
      }
      return false;
    },
    connect: () => undefined,
    disconnect: () => {
      disconnectCalls.count += 1;
    },
    on: (type, cb) => {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(cb);
      listeners.set(type, bucket);
    },
    off: (type, cb) => {
      listeners.get(type)?.delete(cb);
    },
  };
  return { host, disconnectCalls };
}

function fakeAwarenessRoom(): AwarenessRoom {
  let presence: Record<string, unknown> = {};
  return {
    getPresence: () => presence,
    getOthers: () => [],
    getSelf: () => ({ presence }),
    updatePresence: (patch) => {
      presence = { ...presence, ...patch };
    },
  };
}

async function main(): Promise<void> {
  // --- Room id and auth endpoint (7.2; design: one room per team) ---
  assertEqual(
    liveblocksRoomId("team_9"),
    "calibration:team_9",
    "room id is calibration:{teamId}"
  );
  assertEqual(
    liveblocksRoomId("abc-123"),
    "calibration:abc-123",
    "room id prefixes any team id"
  );
  assertEqual(
    liveblocksRoomId("team_9", "rubric"),
    "calibration:team_9:rubric",
    "each shared doc gets its own Liveblocks room"
  );
  assertEqual(
    LIVEBLOCKS_AUTH_ENDPOINT,
    "/api/calibration/liveblocks-auth",
    "auth endpoint is the existing Liveblocks token route"
  );

  // --- Exactly two Yjs documents: rubric + notes (7.1, 7.4) ---
  assertEqual(
    [...DOC_YJS_KEYS],
    ["rubric", "notes"],
    "Yjs keys are rubric and notes only"
  );
  assertEqual(DOC_YJS_KEYS.length, 2, "exactly two shared documents");
  assert(
    !DOC_YJS_KEYS.includes("chat" as (typeof DOC_YJS_KEYS)[number]) &&
      !DOC_YJS_KEYS.includes("scores" as (typeof DOC_YJS_KEYS)[number]),
    "chat and scores are not Yjs documents"
  );

  // --- Cursor identity from session token userInfo (7.2) ---
  assertEqual(
    cursorIdentity({ name: "Alice", color: "#ff00aa" }),
    { username: "Alice", cursorColor: "#ff00aa" },
    "cursors use token name and color"
  );
  assertEqual(
    cursorIdentity({ name: "  Bob  ", color: "  #111111  " }),
    { username: "Bob", cursorColor: "#111111" },
    "cursor identity trims name and color"
  );
  const missing = cursorIdentity(null);
  assert(missing.username.length > 0, "missing identity still has a display name");
  assert(
    /^#[0-9a-fA-F]{3,8}$/.test(missing.cursorColor),
    "missing color falls back to a hex cursor color"
  );
  assertEqual(
    cursorIdentity({ name: "", color: "" }).username.length > 0,
    true,
    "blank name still has a display name"
  );

  // --- Snapshot POST contract (4.3; design: idle debounce ≈3–5s, { text }) ---
  assert(
    SNAPSHOT_DEBOUNCE_MS >= 3000 && SNAPSHOT_DEBOUNCE_MS <= 5000,
    `debounce is 3–5s (got ${SNAPSHOT_DEBOUNCE_MS})`
  );
  assertEqual(
    snapshotApiHref("team_9", "rubric"),
    "/api/calibration/teams/team_9/docs/rubric",
    "rubric snapshot POST is /api/calibration/teams/{teamId}/docs/rubric"
  );
  assertEqual(
    snapshotApiHref("team_9", "notes"),
    "/api/calibration/teams/team_9/docs/notes",
    "notes snapshot POST is /api/calibration/teams/{teamId}/docs/notes"
  );
  assertEqual(
    snapshotPostBody("Clarity — one-line rationale"),
    { text: "Clarity — one-line rationale" },
    "POST body is { text }"
  );
  assertEqual(
    canPushDocSnapshot({ locked: false, role: "member" }),
    true,
    "unlocked members push snapshots"
  );
  assertEqual(
    canPushDocSnapshot({ locked: true, role: "member" }),
    false,
    "locked members do not push snapshots"
  );
  assertEqual(
    canPushDocSnapshot({ locked: false, role: "operator" }),
    false,
    "operators do not push snapshots"
  );
  assertEqual(
    snapshotsFromDocs([
      { docKind: "rubric", snapshotText: "R1" },
      { docKind: "notes", snapshotText: "N1" },
    ]),
    { rubric: "R1", notes: "N1" },
    "SSR docs become initial snapshot texts"
  );
  assertEqual(
    snapshotsFromDocs(null),
    { rubric: "", notes: "" },
    "missing member docs (operators) become empty snapshots"
  );

  // --- Read-only: lock (10.4) and Liveblocks outage (design degradation) ---
  assertEqual(
    shouldShowReadOnly({ locked: true, liveblocksDown: false }),
    true,
    "locked teams are read-only"
  );
  assertEqual(
    shouldShowReadOnly({ locked: false, liveblocksDown: true }),
    true,
    "Liveblocks outage is read-only"
  );
  assertEqual(
    shouldShowReadOnly({ locked: false, liveblocksDown: false }),
    false,
    "unlocked live editing is not forced read-only"
  );
  assertEqual(
    isLiveblocksOutage({ status: "disconnected" }),
    false,
    "disconnected status is not a permanent outage"
  );
  assertEqual(
    isLiveblocksOutage({
      errorType: "ROOM_CONNECTION_ERROR",
      errorCode: -1,
    }),
    false,
    "ROOM_CONNECTION_ERROR -1 is a retried auth hiccup, not an outage"
  );
  assertEqual(
    isLiveblocksOutage({
      errorType: "ROOM_CONNECTION_ERROR",
      errorCode: 4001,
    }),
    true,
    "ROOM_CONNECTION_ERROR 4001 (no room access) is an outage"
  );
  assertEqual(
    isLiveblocksOutage({ status: "connected" }),
    false,
    "connected status is not an outage"
  );
  assertEqual(
    isLiveblocksOutage({ lostConnection: "lost" }),
    false,
    "lost-connection 'lost' is reconnecting, not a permanent outage"
  );
  assertEqual(
    isLiveblocksOutage({ lostConnection: "failed" }),
    true,
    "lost-connection 'failed' is an outage"
  );
  assertEqual(
    isLiveblocksOutage({ lostConnection: "restored" }),
    false,
    "restored connection is not an outage"
  );
  assert(
    /liveblocks is unavailable/i.test(LIVEBLOCKS_OUTAGE_BANNER) &&
      /read-only/i.test(LIVEBLOCKS_OUTAGE_BANNER),
    "outage banner says Liveblocks is unavailable and the view is read-only"
  );

  // --- Distinct providers per document (7.2, 7.4; CollaborationPlugin cleanup) ---
  const { host, disconnectCalls } = fakeRoomProvider();
  const awarenessRoom = fakeAwarenessRoom();
  const yjsDocMap = new Map<string, Y.Doc>();
  const rubricProvider = createSharedDocProvider(
    "rubric",
    yjsDocMap,
    host,
    awarenessRoom
  );
  const notesProvider = createSharedDocProvider(
    "notes",
    yjsDocMap,
    host,
    awarenessRoom
  );
  assert(
    rubricProvider !== notesProvider,
    "rubric and notes factories must return distinct provider objects"
  );
  assert(
    rubricProvider !== host && notesProvider !== host,
    "factories must not return the room-level getYjsProviderForRoom host"
  );
  assert(
    yjsDocMap.get("rubric") instanceof Y.Doc &&
      yjsDocMap.get("notes") instanceof Y.Doc,
    "each id gets a dedicated Y.Doc in yjsDocMap"
  );
  assert(
    yjsDocMap.get("rubric") !== yjsDocMap.get("notes"),
    "rubric and notes Y.Docs must be distinct objects"
  );
  assert(
    (rubricProvider.awareness as { clientID?: number }).clientID ===
      yjsDocMap.get("rubric")?.clientID,
    "rubric awareness clientID matches its Y.Doc"
  );
  assert(
    (notesProvider.awareness as { clientID?: number }).clientID ===
      yjsDocMap.get("notes")?.clientID,
    "notes awareness clientID matches its Y.Doc"
  );
  assert(
    rubricProvider.awareness !== notesProvider.awareness,
    "each document has its own awareness"
  );
  rubricProvider.awareness.setLocalState(cursorState("Rubric cursor"));
  notesProvider.awareness.setLocalState(cursorState("Notes cursor"));
  assertEqual(
    rubricProvider.awareness.getLocalState()?.name,
    "Rubric cursor",
    "rubric awareness keeps its own cursor identity"
  );
  assertEqual(
    notesProvider.awareness.getLocalState()?.name,
    "Notes cursor",
    "notes awareness keeps its own cursor identity"
  );
  rubricProvider.disconnect();
  assertEqual(
    disconnectCalls.count,
    0,
    "disconnecting rubric must not disconnect the room-level host"
  );
  notesProvider.awareness.setLocalStateField("focusing", false);
  assertEqual(
    notesProvider.awareness.getLocalState()?.focusing,
    false,
    "notes provider still works after rubric disconnect"
  );
  notesProvider.disconnect();
  assertEqual(
    disconnectCalls.count,
    0,
    "disconnecting notes must not disconnect the room-level host"
  );

  // --- Source: helpers stay client-safe ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/docs.ts");
  const providerPath = path.join(
    process.cwd(),
    "lib/calibration-ui/docs-provider.ts"
  );
  const editorPath = path.join(
    process.cwd(),
    "components/calibration/SharedDocEditor.tsx"
  );
  const layoutPath = path.join(
    process.cwd(),
    "components/calibration/SpaceLayout.tsx"
  );
  const chatPath = path.join(
    process.cwd(),
    "components/calibration/GroupChatPanel.tsx"
  );
  const artifactsPath = path.join(
    process.cwd(),
    "components/calibration/ArtifactsPanel.tsx"
  );
  const scoresPath = path.join(
    process.cwd(),
    "components/calibration/ScoreSheet.tsx"
  );
  const teamPagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/team/[teamId]/page.tsx"
  );
  const authPath = path.join(
    process.cwd(),
    "lib/calibration-api/liveblocks-auth.ts"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const providerSource = await fs.readFile(providerPath, "utf8").catch(() => "");
  const editorSource = await fs.readFile(editorPath, "utf8").catch(() => "");
  const layoutSource = await fs.readFile(layoutPath, "utf8").catch(() => "");
  const chatSource = await fs.readFile(chatPath, "utf8").catch(() => "");
  const artifactsSource = await fs.readFile(artifactsPath, "utf8").catch(() => "");
  const scoresSource = await fs.readFile(scoresPath, "utf8").catch(() => "");
  const teamPageSource = await fs.readFile(teamPagePath, "utf8").catch(() => "");
  const authSource = await fs.readFile(authPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/docs.ts exists");
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store") &&
      !helpersSource.includes("calibration-api"),
    "doc helpers do not import engine/store/api"
  );
  assert(
    helpersSource.includes("liveblocksRoomId") &&
      helpersSource.includes("DOC_YJS_KEYS") &&
      helpersSource.includes("LIVEBLOCKS_AUTH_ENDPOINT"),
    "doc helpers export room id, Yjs keys, and auth endpoint"
  );
  assert(providerSource.length > 0, "lib/calibration-ui/docs-provider.ts exists");
  assert(
    providerSource.includes("createSharedDocProvider") &&
      providerSource.includes("DocScopedProvider"),
    "docs-provider exports a dedicated per-document provider"
  );
  assert(
    !providerSource.includes("calibration-engine") &&
      !providerSource.includes("calibration-store") &&
      !providerSource.includes("calibration-api"),
    "docs-provider does not import engine/store/api"
  );
  assert(
    !providerSource.includes('from "@liveblocks/yjs"') &&
      !providerSource.includes("from '@liveblocks/yjs'"),
    "docs-provider does not import the room-level Yjs host"
  );

  // --- Source: SharedDocEditor wiring (7.1–7.4) ---
  assert(editorSource.includes("SharedDocEditor"), "SharedDocEditor component exists");
  assert(
    editorSource.includes('"use client"') || editorSource.includes("'use client'"),
    "SharedDocEditor is a client component"
  );
  assert(
    editorSource.includes("RoomProvider"),
    "RoomProvider wraps the shared-docs region"
  );
  assert(
    editorSource.includes("LiveblocksProvider") ||
      editorSource.includes("createRoomContext"),
    "LiveblocksProvider authenticates the room"
  );
  assert(
    editorSource.includes("LIVEBLOCKS_AUTH_ENDPOINT") ||
      editorSource.includes("/api/calibration/liveblocks-auth"),
    "authEndpoint is POST /api/calibration/liveblocks-auth"
  );
  assert(
    editorSource.includes("liveblocksRoomId") ||
      editorSource.includes("calibration:"),
    "room id is calibration:{teamId}"
  );
  assert(
    editorSource.includes("CollaborationPlugin"),
    "Lexical CollaborationPlugin is mounted"
  );
  assert(
    editorSource.includes("LiveblocksYjsProvider") ||
      editorSource.includes("getYjsProviderForRoom"),
    "LiveblocksYjsProvider is used for the room-level Yjs host"
  );
  assert(
    editorSource.includes("createSharedDocProvider"),
    "CollaborationPlugin factories use createSharedDocProvider"
  );
  assert(
    !/return\s+provider(\s+as\s+unknown\s+as\s+Provider)?\s*;/.test(editorSource),
    "providerFactory does not return the getYjsProviderForRoom singleton"
  );
  assert(
    editorSource.includes("DOC_YJS_KEYS") ||
      (editorSource.includes('"rubric"') && editorSource.includes('"notes"')) ||
      (editorSource.includes("'rubric'") && editorSource.includes("'notes'")),
    "both rubric and notes Yjs documents are bound"
  );
  assert(
    editorSource.includes("username") && editorSource.includes("cursorColor"),
    "CollaborationPlugin cursors show name and color"
  );
  assert(
    editorSource.includes("cursorIdentity") ||
      editorSource.includes("userInfo") ||
      editorSource.includes("useSelf"),
    "cursor identity comes from the Liveblocks session userInfo"
  );
  assert(
    editorSource.includes("LexicalComposer") &&
      editorSource.includes("RichTextPlugin"),
    "each document is a Lexical editor"
  );
  assert(
    !editorSource.includes("calibration-engine") &&
      !editorSource.includes("calibration-store") &&
      !editorSource.includes("calibration-api"),
    "SharedDocEditor does not import engine/store/api"
  );

  // --- Source: snapshot push (4.3) ---
  assert(
    editorSource.includes("SNAPSHOT_DEBOUNCE_MS") &&
      editorSource.includes("setTimeout"),
    "SharedDocEditor debounces snapshot POSTs"
  );
  assert(
    editorSource.includes("snapshotApiHref") ||
      editorSource.includes("/docs/"),
    "SharedDocEditor POSTs to /api/calibration/teams/{teamId}/docs/{docKind}"
  );
  assert(
    editorSource.includes("snapshotPostBody") ||
      /["']POST["']/.test(editorSource),
    "SharedDocEditor POSTs the snapshot"
  );
  assert(
    editorSource.includes("canPushDocSnapshot") ||
      (editorSource.includes("locked") && editorSource.includes("member")),
    "snapshot POST is members-only and skipped when locked"
  );
  assert(
    !editorSource.includes("<textarea") &&
      !editorSource.includes("<textarea "),
    "shared docs have no chat-style composer"
  );

  // --- Source: locked / outage read-only (10.4, design degradation) ---
  assert(
    editorSource.includes("shouldShowReadOnly") ||
      editorSource.includes("liveblocksDown"),
    "SharedDocEditor has a lock/outage read-only path"
  );
  assert(
    editorSource.includes("aria-readonly") ||
      editorSource.includes('aria-readonly="true"'),
    "read-only snapshot view exposes no editing affordance"
  );
  assert(
    editorSource.includes("LIVEBLOCKS_OUTAGE_BANNER") ||
      /Liveblocks is unavailable/i.test(editorSource),
    "outage path shows a Liveblocks-unavailable banner"
  );
  assert(
    editorSource.includes("useLostConnectionListener") ||
      editorSource.includes("useStatus") ||
      editorSource.includes("useErrorListener"),
    "SharedDocEditor listens for Liveblocks connection loss"
  );
  assert(
    editorSource.includes("CollaborationPlugin"),
    "unlocked Yjs path still mounts CollaborationPlugin (7.3)"
  );

  // --- Source: composed into SpaceLayout; RoomProvider stays in the docs region ---
  assert(
    layoutSource.includes("SharedDocEditor"),
    "SharedDocEditor is composed into SpaceLayout"
  );
  assert(
    !layoutSource.includes("The shared rubric and notes will open here."),
    "SpaceLayout Shared documents placeholder is gone"
  );
  assert(
    !/!deliverableLocked\s*&&\s*\(?\s*<SharedDocEditor/.test(layoutSource),
    "SpaceLayout still mounts SharedDocEditor when locked"
  );
  assert(
    layoutSource.includes("locked=") || layoutSource.includes("locked={"),
    "SpaceLayout passes lock state into SharedDocEditor"
  );
  assert(
    !layoutSource.toLowerCase().includes("liveblocks") &&
      !layoutSource.toLowerCase().includes("yjs") &&
      !layoutSource.includes("CollaborationPlugin"),
    "SpaceLayout itself has no Liveblocks/Yjs; RoomProvider stays in SharedDocEditor"
  );
  assert(
    !layoutSource.includes("calibration-engine") &&
      !layoutSource.includes("calibration-store"),
    "SpaceLayout still does not import engine/store"
  );
  assert(
    !teamPageSource.includes("SharedDocEditor") &&
      !teamPageSource.includes("RoomProvider") &&
      !teamPageSource.toLowerCase().includes("liveblocks"),
    "team page does not wrap the app in RoomProvider"
  );
  assert(
    teamPageSource.includes("snapshotText") ||
      teamPageSource.includes("snapshotsFromDocs") ||
      teamPageSource.includes("docSnapshots") ||
      teamPageSource.includes("snapshots="),
    "team page passes initial snapshot texts into the space"
  );

  // --- Source: no collaborative cursors elsewhere (7.5) ---
  assert(
    !chatSource.toLowerCase().includes("liveblocks") &&
      !chatSource.toLowerCase().includes("yjs") &&
      !chatSource.toLowerCase().includes("collaborationplugin"),
    "GroupChatPanel has no Liveblocks/Yjs/cursors"
  );
  assert(
    !artifactsSource.toLowerCase().includes("liveblocks") &&
      !artifactsSource.toLowerCase().includes("yjs") &&
      !artifactsSource.toLowerCase().includes("collaborationplugin"),
    "ArtifactsPanel has no Liveblocks/Yjs/cursors"
  );
  assert(
    !scoresSource.toLowerCase().includes("liveblocks") &&
      !scoresSource.toLowerCase().includes("yjs") &&
      !scoresSource.toLowerCase().includes("collaborationplugin"),
    "ScoreSheet has no Liveblocks/Yjs/cursors"
  );

  // --- Auth endpoint behavior is unchanged (6.1) ---
  assert(
    authSource.includes('calibration:') || authSource.includes("calibration:"),
    "liveblocks-auth still scopes rooms as calibration:{teamId}"
  );
  assert(
    authSource.includes("issueLiveblocksToken"),
    "liveblocks-auth handler is unchanged in role"
  );

  if (failures > 0) {
    console.error(`\ndocs.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("docs.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("docs.selftest crashed:", err);
  process.exit(1);
});
