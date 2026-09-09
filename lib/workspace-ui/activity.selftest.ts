/**
 * Self-test: Workspace activity helpers + Activity browse UI (Tasks 6.6 / 6).
 * Run: npx tsx lib/workspace-ui/activity.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  WorkspaceActivityEvent,
  WorkspaceActivityType,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import {
  FACILITATION_ONLY_ACTIVITY_TYPES,
  PARTICIPANT_VISIBLE_ACTIVITY_TYPES,
  activityApiHref,
  canViewFacilitationActivity,
  formatActivitySummary,
  isFacilitationOnlyActivityType,
  parseActivityListResponse,
  sortActivityNewestFirst,
} from "./activity";

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

function event(input: {
  id: string;
  type: WorkspaceActivityType;
  actorUserId?: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}): WorkspaceActivityEvent {
  return {
    id: input.id,
    workspaceId: "ws_1",
    type: input.type,
    actorUserId: input.actorUserId ?? "actor_1",
    payload: input.payload ?? {},
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

async function main(): Promise<void> {
  // --- Facilitation vs participant visibility (Req 6.1–6.4) ---
  const facilitationTypes: WorkspaceActivityType[] = [
    "member.joined",
    "member.left",
    "member.removed",
    "workspace.renamed",
    "permissions.updated",
  ];
  for (const type of facilitationTypes) {
    assert(
      isFacilitationOnlyActivityType(type),
      `${type} is facilitation-only`
    );
    assert(
      FACILITATION_ONLY_ACTIVITY_TYPES.has(type),
      `${type} listed in FACILITATION_ONLY_ACTIVITY_TYPES`
    );
  }

  assert(
    !isFacilitationOnlyActivityType("bot.placed"),
    "bot.placed is not facilitation-only"
  );
  assert(
    !isFacilitationOnlyActivityType("bot.unplaced"),
    "bot.unplaced is not facilitation-only"
  );
  assert(
    PARTICIPANT_VISIBLE_ACTIVITY_TYPES.has("bot.placed") &&
      PARTICIPANT_VISIBLE_ACTIVITY_TYPES.has("bot.unplaced"),
    "Participants may see bot place/unplace (Req 6.4)"
  );
  assert(
    !PARTICIPANT_VISIBLE_ACTIVITY_TYPES.has("member.joined") &&
      !PARTICIPANT_VISIBLE_ACTIVITY_TYPES.has("member.removed") &&
      !PARTICIPANT_VISIBLE_ACTIVITY_TYPES.has("permissions.updated"),
    "Participants omit membership management / settings activity (Req 6.4)"
  );

  // Role helpers: Owners/Facilitators vs Participant (Req 6.1–6.4)
  assertEqual(
    canViewFacilitationActivity("owner"),
    true,
    "Owner can view facilitation activity"
  );
  assertEqual(
    canViewFacilitationActivity("facilitator"),
    true,
    "Facilitator can view facilitation activity"
  );
  assertEqual(
    canViewFacilitationActivity("participant"),
    false,
    "Participant cannot view facilitation activity"
  );
  const facilitationRoles: WorkspaceRole[] = ["owner", "facilitator"];
  assert(
    facilitationRoles.every((r) => canViewFacilitationActivity(r)),
    "facilitation roles can view facilitation activity"
  );

  // --- Summaries for facilitator-visible event kinds (Req 6.1–6.3) ---
  assert(
    formatActivitySummary(
      event({
        id: "e1",
        type: "member.joined",
        payload: { userId: "u_join" },
      })
    ).toLowerCase().includes("join"),
    "member.joined summary mentions join"
  );
  assert(
    formatActivitySummary(
      event({
        id: "e2",
        type: "bot.placed",
        payload: { appId: "bot_1" },
      })
    ).toLowerCase().includes("place"),
    "bot.placed summary mentions place"
  );
  assert(
    formatActivitySummary(
      event({
        id: "e3",
        type: "permissions.updated",
        payload: { canSeeOthersBots: true },
      })
    ).toLowerCase().includes("permission"),
    "permissions.updated summary mentions permission"
  );
  assert(
    formatActivitySummary(
      event({
        id: "e4",
        type: "workspace.renamed",
        payload: { from: "A", to: "B" },
      })
    ).toLowerCase().includes("rename") ||
      formatActivitySummary(
        event({
          id: "e4b",
          type: "workspace.renamed",
          payload: { from: "A", to: "B" },
        })
      ).includes("B"),
    "workspace.renamed summary mentions rename or new name"
  );

  // --- Chronological newest-first (Req 6.5) ---
  const sorted = sortActivityNewestFirst([
    event({
      id: "old",
      type: "bot.placed",
      createdAt: "2026-01-01T00:00:00.000Z",
      payload: { appId: "a" },
    }),
    event({
      id: "new",
      type: "member.joined",
      createdAt: "2026-01-03T00:00:00.000Z",
      payload: { userId: "u" },
    }),
    event({
      id: "mid",
      type: "permissions.updated",
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
  ]);
  assertEqual(
    sorted.map((e) => e.id),
    ["new", "mid", "old"],
    "sortActivityNewestFirst is chronological newest-first"
  );

  // --- API helpers ---
  assertEqual(
    activityApiHref("ws_1"),
    "/api/workspaces/ws_1/activity",
    "activity API href"
  );

  const listed = parseActivityListResponse(200, {
    events: [
      event({
        id: "e1",
        type: "member.joined",
        payload: { userId: "u1" },
      }),
      event({
        id: "e2",
        type: "bot.placed",
        payload: { appId: "bot_1" },
      }),
      event({
        id: "e3",
        type: "permissions.updated",
      }),
    ],
  });
  assert(listed.ok === true, "200 activity list is ok");
  if (listed.ok) {
    assertEqual(listed.events.length, 3, "parses activity events");
    assert(
      listed.events.some((e) => e.type === "member.joined") &&
        listed.events.some((e) => e.type === "bot.placed") &&
        listed.events.some((e) => e.type === "permissions.updated"),
      "Facilitator-style payload keeps join/place/permission events"
    );
  }

  const participantShaped = parseActivityListResponse(200, {
    events: [
      event({
        id: "p1",
        type: "bot.placed",
        payload: { appId: "bot_visible" },
      }),
      event({
        id: "p2",
        type: "bot.unplaced",
        payload: { appId: "bot_visible" },
      }),
    ],
  });
  assert(participantShaped.ok === true, "200 participant-shaped list is ok");
  if (participantShaped.ok) {
    assert(
      participantShaped.events.every(
        (e) => !isFacilitationOnlyActivityType(e.type)
      ),
      "participant-shaped feed has no facilitation-only types"
    );
  }

  const listForbidden = parseActivityListResponse(403, { error: "Forbidden" });
  assert(listForbidden.ok === false, "403 activity list fails");

  const listUnauthorized = parseActivityListResponse(401, {
    error: "Unauthorized",
  });
  assert(listUnauthorized.ok === false, "401 activity list fails");

  const listInvalid = parseActivityListResponse(200, { events: "nope" });
  assert(listInvalid.ok === false, "invalid events payload fails");

  // --- UI intentionally hidden (helpers + API remain for later) ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/activity.ts");
  const feedPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceActivityFeed.tsx"
  );
  const hubPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceHub.tsx"
  );
  const tabsPath = path.join(process.cwd(), "lib/workspace-ui/tabs.ts");

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const feedSource = await fs.readFile(feedPath, "utf8").catch(() => "");
  const hubSource = await fs.readFile(hubPath, "utf8").catch(() => "");
  const tabsSource = await fs.readFile(tabsPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/activity.ts exists");
  assert(
    feedSource.length === 0,
    "WorkspaceActivityFeed UI component is removed"
  );
  assert(
    !hubSource.includes("WorkspaceActivityFeed"),
    "hub does not render activity feed"
  );
  assert(
    tabsSource.includes('"activity"') || tabsSource.includes("'activity'"),
    "activity is a hub tab id"
  );
  assert(
    !hubSource.includes("WorkspaceActivityFeed") &&
      !hubSource.includes("activityApiHref") &&
      !hubSource.includes("parseActivityListResponse"),
    "hub does not render the membership/placement event feed as Activity"
  );

  // --- Workspace Activity browse view (Req 3.1–3.3, 3.5, 3.8, 3.9) ---
  const viewPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceActivityView.tsx"
  );
  const listPath = path.join(
    process.cwd(),
    "components/sessions/SessionList.tsx"
  );
  const displayPath = path.join(
    process.cwd(),
    "components/sessions/session-display.ts"
  );
  const clientPath = path.join(
    process.cwd(),
    "components/sessions/session-client.ts"
  );
  const mySessionsPath = path.join(
    process.cwd(),
    "components/sessions/MySessionsView.tsx"
  );
  const botActivityPath = path.join(
    process.cwd(),
    "components/sessions/BotActivityView.tsx"
  );

  const viewSource = await fs.readFile(viewPath, "utf8").catch(() => "");
  const listSource = await fs.readFile(listPath, "utf8").catch(() => "");
  const displaySource = await fs.readFile(displayPath, "utf8").catch(() => "");
  const clientSource = await fs.readFile(clientPath, "utf8").catch(() => "");
  const mySessionsSource = await fs
    .readFile(mySessionsPath, "utf8")
    .catch(() => "");
  const botActivitySource = await fs
    .readFile(botActivityPath, "utf8")
    .catch(() => "");

  assert(viewSource.length > 0, "WorkspaceActivityView exists");
  assert(
    hubSource.includes("WorkspaceActivityView"),
    "hub mounts WorkspaceActivityView on the Activity tab"
  );
  assert(
    /activeTab === ["']activity["']/.test(hubSource) &&
      hubSource.includes("<WorkspaceActivityView"),
    "hub Activity tab renders WorkspaceActivityView"
  );
  assert(
    viewSource.includes("SessionBrowseLayout"),
    "Activity view uses SessionBrowseLayout"
  );
  assert(
    /let detail: ReactNode =/.test(viewSource) &&
      viewSource.includes("Loading transcript"),
    "transcript pane defaults to a loading hint before fetch state is set"
  );
  assert(
    viewSource.includes("SessionList") && viewSource.includes("SessionTranscript"),
    "Activity view composes SessionList and SessionTranscript"
  );
  assert(
    /nameMode=["']workspace["']/.test(viewSource) ||
      /nameMode=\{\s*["']workspace["']\s*\}/.test(viewSource),
    'Activity view uses nameMode="workspace"'
  );
  assert(
    /sessions appear after those bots are used with sharing on/i.test(
      viewSource
    ),
    "empty copy explains sessions appear after those bots are used with sharing on"
  );
  assert(
    !/\bonDelete\b/.test(viewSource) &&
      !/\bonEdit\b/.test(viewSource) &&
      !viewSource.includes("contentEditable"),
    "Activity view has no edit or delete"
  );
  assert(
    !/\bonDelete\b/.test(listSource) && !/\bonEdit\b/.test(listSource),
    "SessionList still has no edit or delete handlers"
  );
  assert(
    !viewSource.includes("WorkspaceActivityFeed") &&
      !viewSource.includes("activityApiHref") &&
      !viewSource.includes("parseActivityListResponse") &&
      !viewSource.includes("listWorkspaceActivity"),
    "Activity view is chat sessions, not the membership/placement event feed"
  );
  assert(
    !/\/api\/workspaces\/\$\{[^}]+\}\/activity\b/.test(viewSource) &&
      !viewSource.includes("/api/workspaces/${workspaceId}/activity") &&
      !viewSource.includes("/api/workspaces/${id}/activity"),
    "Activity view does not fetch GET /api/workspaces/:id/activity"
  );

  const usesWorkspaceListRoute =
    clientSource.includes("/api/workspaces/") &&
    clientSource.includes("/sessions") &&
    (viewSource.includes("fetchWorkspaceSessions") ||
      viewSource.includes("workspaceSessionsUrl"));
  const usesWorkspaceTranscriptRoute =
    viewSource.includes("fetchWorkspaceTranscript") ||
    viewSource.includes("workspaceTranscriptUrl");
  assert(
    usesWorkspaceListRoute,
    "Activity view loads the list from workspace session routes"
  );
  assert(
    usesWorkspaceTranscriptRoute,
    "opening a row loads the Workspace transcript route"
  );
  assert(
    !/\bfetchTranscript\b/.test(viewSource) &&
      !/\btranscriptUrl\b/.test(viewSource) &&
      !/\bfetchMySessions\b/.test(viewSource) &&
      !/\bfetchOwnerSessions\b/.test(viewSource) &&
      !viewSource.includes("/api/sessions/"),
    "Activity view does not use personal /api/sessions/:id or owner session URLs"
  );
  assert(
    displaySource.includes('"workspace"'),
    'SessionNameMode includes "workspace"'
  );
  assert(
    /nameMode=["']bot["']/.test(mySessionsSource),
    "My sessions keeps nameMode bot"
  );
  assert(
    /nameMode=["']participant["']/.test(botActivitySource),
    "per-bot Activity keeps nameMode participant"
  );

  const client = await import("@/components/sessions/session-client");
  assert(
    typeof client.workspaceSessionsUrl === "function",
    "workspaceSessionsUrl helper exists"
  );
  assert(
    typeof client.workspaceTranscriptUrl === "function",
    "workspaceTranscriptUrl helper exists"
  );
  assert(
    typeof client.fetchWorkspaceSessions === "function",
    "fetchWorkspaceSessions helper exists"
  );
  assert(
    typeof client.fetchWorkspaceTranscript === "function",
    "fetchWorkspaceTranscript helper exists"
  );
  if (typeof client.workspaceSessionsUrl === "function") {
    assertEqual(
      client.workspaceSessionsUrl("ws_1", { limit: 20, offset: 0 }),
      "/api/workspaces/ws_1/sessions?limit=20&offset=0",
      "workspace sessions list URL"
    );
    assertEqual(
      client.workspaceSessionsUrl("ws/odd", { limit: 10, offset: 20 }),
      "/api/workspaces/ws%2Fodd/sessions?limit=10&offset=20",
      "workspace sessions list URL encodes workspace id"
    );
  }
  if (typeof client.workspaceTranscriptUrl === "function") {
    assertEqual(
      client.workspaceTranscriptUrl("ws_1", "sess-1"),
      "/api/workspaces/ws_1/sessions/sess-1",
      "workspace transcript URL"
    );
    assertEqual(
      client.workspaceTranscriptUrl("ws_1", "sess/1"),
      "/api/workspaces/ws_1/sessions/sess%2F1",
      "workspace transcript URL encodes session id"
    );
    assert(
      !client
        .workspaceTranscriptUrl("ws_1", "sess-1")
        .includes("/api/sessions/"),
      "workspace transcript URL is not the personal transcript URL"
    );
  }
  if (typeof client.fetchWorkspaceSessions === "function") {
    let listedUrl = "";
    const listed = await client.fetchWorkspaceSessions(
      "ws_1",
      { limit: 20, offset: 0 },
      async (input) => {
        listedUrl = String(input);
        return new Response(
          JSON.stringify({
            sessions: [
              {
                id: "sess-1",
                appName: "Tutor",
                participantName: "Ada",
                surface: "public",
                shared: true,
              },
            ],
            hasMore: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    );
    assertEqual(
      listedUrl,
      "/api/workspaces/ws_1/sessions?limit=20&offset=0",
      "fetchWorkspaceSessions GETs the workspace list route"
    );
    assertEqual(
      listed.sessions.length,
      1,
      "fetchWorkspaceSessions parses sessions"
    );
    assertEqual(listed.hasMore, false, "fetchWorkspaceSessions parses hasMore");
  }
  if (typeof client.fetchWorkspaceTranscript === "function") {
    let transcriptUrlCalled = "";
    const record = {
      id: "sess-1",
      appId: "bot-1",
      appName: "Tutor",
      messages: [],
    };
    const loaded = await client.fetchWorkspaceTranscript(
      "ws_1",
      "sess-1",
      async (input) => {
        transcriptUrlCalled = String(input);
        return new Response(JSON.stringify({ session: record }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    );
    assertEqual(
      transcriptUrlCalled,
      "/api/workspaces/ws_1/sessions/sess-1",
      "fetchWorkspaceTranscript GETs the workspace transcript route"
    );
    assertEqual(
      loaded.id,
      "sess-1",
      "fetchWorkspaceTranscript parses the record"
    );
  }

  if (failures > 0) {
    console.error(`\nactivity.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("activity.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("activity.selftest crashed:", err);
  process.exit(1);
});
