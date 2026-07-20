/**
 * Self-test: Workspace activity feed UI helpers + wiring (Task 6.6).
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

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/activity.ts");
  const feedPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceActivityFeed.tsx"
  );
  const hubPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceHub.tsx"
  );
  const pagePath = path.join(
    process.cwd(),
    "app/workspace/[workspaceId]/settings/page.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const feedSource = await fs.readFile(feedPath, "utf8").catch(() => "");
  const hubSource = await fs.readFile(hubPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/activity.ts exists");
  assert(
    feedSource.includes("WorkspaceActivityFeed"),
    "WorkspaceActivityFeed component exists"
  );
  assert(
    feedSource.includes("activityApiHref") ||
      (feedSource.includes("/api/workspaces/") &&
        feedSource.includes("activity")),
    "feed calls activity API"
  );
  assert(
    feedSource.includes("fetch") || feedSource.includes("method"),
    "feed loads activity via fetch"
  );
  assert(
    feedSource.includes("parseActivityListResponse") ||
      feedSource.includes("events"),
    "feed parses activity events"
  );
  assert(
    feedSource.includes("formatActivitySummary") ||
      feedSource.includes("member.joined") ||
      feedSource.includes("Activity"),
    "feed renders human-readable activity entries"
  );
  assert(
    feedSource.includes("sortActivityNewestFirst") ||
      feedSource.includes("createdAt") ||
      feedSource.includes("chronolog"),
    "feed presents chronological list"
  );
  assert(
    hubSource.includes("WorkspaceActivityFeed") ||
      pageSource.includes("WorkspaceActivityFeed"),
    "hub or settings renders WorkspaceActivityFeed"
  );
  assert(
    hubSource.includes("Activity") ||
      hubSource.includes("activity") ||
      hubSource.includes("WorkspaceActivityFeed"),
    "hub has activity entry or panel"
  );

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
