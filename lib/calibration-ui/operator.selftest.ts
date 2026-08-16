/**
 * Self-test: operator dashboard helpers, stuck waiters, and manual match (Task 7.1).
 * Run: npx tsx lib/calibration-ui/operator.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  canConfirmManualMatch,
  formatWaitDuration,
  matchPostBody,
  operateDashboardApiHref,
  operateMatchApiHref,
  operatePageHref,
  operatorInspectHref,
  parseDashboardResponse,
  parseMatchResponse,
} from "./operator";

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

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

async function main(): Promise<void> {
  // --- Dashboard / match hrefs ---
  assertEqual(
    operatePageHref("off_1"),
    "/activity/off_1/operate",
    "operator page is /activity/{offeringId}/operate"
  );
  assertEqual(
    operateDashboardApiHref("off_1"),
    "/api/calibration/offerings/off_1/operate",
    "dashboard GET is /api/calibration/offerings/{id}/operate"
  );
  assertEqual(
    operateMatchApiHref("off_1"),
    "/api/calibration/offerings/off_1/operate/match",
    "manual match POST is /api/calibration/offerings/{id}/operate/match"
  );
  assertEqual(
    operatorInspectHref("off_1", "team_9"),
    "/activity/off_1/operate/team/team_9",
    "inspect link points at a future operator team route"
  );

  // --- Confirm is disabled for 2 ids or duplicates (14.3); enabled for 3 distinct ---
  assertEqual(
    canConfirmManualMatch(["u-a", "u-b"]),
    false,
    "two waiters cannot confirm a manual match"
  );
  assertEqual(
    canConfirmManualMatch(["u-a", "u-b", "u-a"]),
    false,
    "duplicate ids cannot confirm a manual match"
  );
  assertEqual(
    canConfirmManualMatch(["u-a", "u-a", "u-a"]),
    false,
    "three copies of one id cannot confirm"
  );
  assertEqual(
    canConfirmManualMatch(["u-a", "u-b", ""]),
    false,
    "blank third id cannot confirm"
  );
  assertEqual(
    canConfirmManualMatch(["u-a", "u-b", "u-c", "u-d"]),
    false,
    "more than three selected ids cannot confirm"
  );
  assertEqual(
    canConfirmManualMatch(["u-a", "u-b", "u-c"]),
    true,
    "three distinct waiters can confirm"
  );
  assertEqual(
    canConfirmManualMatch([" u-a ", "u-b", "u-c"]),
    true,
    "trimmed distinct ids can confirm"
  );

  // --- Match POST body is { userIds: [id, id, id] } ---
  assertEqual(
    matchPostBody(["u-a", "u-b", "u-c"]),
    { userIds: ["u-a", "u-b", "u-c"] },
    "match POST body is { userIds: [id, id, id] }"
  );
  assertEqual(
    matchPostBody([" u-a ", "u-b", "u-c"]),
    { userIds: ["u-a", "u-b", "u-c"] },
    "match POST body trims user ids"
  );
  assertEqual(
    Object.keys(matchPostBody(["u-a", "u-b", "u-c"])),
    ["userIds"],
    "match POST body has only userIds"
  );
  assert(
    matchPostBody(["u-a", "u-b", "u-c"]).userIds.length === 3,
    "match POST body always sends three userIds when given a trio"
  );

  // --- Wait duration is human-readable for 10–14 day stuck waiters (2.5, 14.1) ---
  assertEqual(
    formatWaitDuration(3 * HOUR_MS),
    "3h",
    "same-day wait formats as hours only"
  );
  assertEqual(
    formatWaitDuration(10 * DAY_MS),
    "10d 0h",
    "10-day wait formats as 10d 0h"
  );
  assertEqual(
    formatWaitDuration(11 * DAY_MS + 5 * HOUR_MS),
    "11d 5h",
    "11d 5h wait keeps days and leftover hours"
  );
  assertEqual(
    formatWaitDuration(14 * DAY_MS),
    "14d 0h",
    "14-day wait formats as 14d 0h"
  );
  assert(
    formatWaitDuration(12 * DAY_MS).includes("12"),
    "12-day wait duration includes 12"
  );
  assert(
    formatWaitDuration(10 * DAY_MS).includes("d"),
    "wait duration includes a day unit"
  );

  // --- parseDashboard keeps stuck waiters + team progress columns (14.1, 14.4) ---
  const dashboardBody = {
    offeringId: "off_1",
    queueCount: 2,
    stuckWaiters: [
      {
        checkInId: "ci_1",
        userId: "u-stuck",
        offeringId: "off_1",
        waitedMs: 10 * DAY_MS,
        checkedInAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    teams: [
      {
        teamId: "team_9",
        phase: "critique",
        members: ["u-a", "u-b", "u-c"],
        lastActivityAt: "2026-08-15T12:00:00.000Z",
        autoFinalized: false,
      },
    ],
  };
  const dashboard = parseDashboardResponse(200, dashboardBody);
  assert(dashboard.ok === true, "200 dashboard is ok");
  if (dashboard.ok) {
    assertEqual(dashboard.view.labels, {}, "dashboard labels default to empty");
    assertEqual(dashboard.view.offeringId, "off_1", "dashboard keeps offering identity");
    assertEqual(dashboard.view.queueCount, 2, "dashboard keeps matching queue count");
    assertEqual(dashboard.view.stuckWaiters.length, 1, "dashboard lists stuck waiters");
    assertEqual(
      dashboard.view.waiters.length,
      1,
      "dashboard waiters falls back to stuckWaiters when waiters is omitted"
    );
    assertEqual(
      dashboard.view.stuckWaiters[0]?.waitedMs,
      10 * DAY_MS,
      "stuck waiter keeps wait duration"
    );
    assertEqual(
      dashboard.view.stuckWaiters[0]?.stuck,
      false,
      "stuck flag defaults to false when the API omits it"
    );
    assertEqual(
      dashboard.view.stuckWaiters[0]?.offeringId,
      "off_1",
      "stuck waiter keeps offering identity"
    );
    assertEqual(dashboard.view.teams[0]?.phase, "critique", "team row keeps phase");
    assertEqual(
      dashboard.view.teams[0]?.members,
      ["u-a", "u-b", "u-c"],
      "team row keeps members"
    );
    assertEqual(
      dashboard.view.teams[0]?.lastActivityAt,
      "2026-08-15T12:00:00.000Z",
      "team row keeps last activity"
    );
    assertEqual(
      dashboard.view.teams[0]?.autoFinalized,
      false,
      "team row keeps auto-finalized"
    );
  }

  const allWaitersBody = {
    offeringId: "off_1",
    queueCount: 2,
    waiters: [
      {
        checkInId: "ci_recent",
        userId: "u-recent",
        offeringId: "off_1",
        waitedMs: 2 * DAY_MS,
        checkedInAt: "2026-08-13T00:00:00.000Z",
        stuck: false,
      },
      {
        checkInId: "ci_1",
        userId: "u-stuck",
        offeringId: "off_1",
        waitedMs: 10 * DAY_MS,
        checkedInAt: "2026-08-01T00:00:00.000Z",
        stuck: true,
      },
    ],
    stuckWaiters: [
      {
        checkInId: "ci_1",
        userId: "u-stuck",
        offeringId: "off_1",
        waitedMs: 10 * DAY_MS,
        checkedInAt: "2026-08-01T00:00:00.000Z",
        stuck: true,
      },
    ],
    teams: [],
  };
  const allWaiters = parseDashboardResponse(200, allWaitersBody);
  assert(allWaiters.ok === true, "200 dashboard with waiters is ok");
  if (allWaiters.ok) {
    assertEqual(allWaiters.view.waiters.length, 2, "dashboard lists every queued learner");
    assertEqual(allWaiters.view.waiters[0]?.stuck, false, "recent waiter is not stuck");
    assertEqual(allWaiters.view.waiters[1]?.stuck, true, "10-day waiter is stuck");
    assertEqual(allWaiters.view.stuckWaiters.length, 1, "stuckWaiters stays the 10-day subset");
  }

  const labeled = parseDashboardResponse(200, {
    ...allWaitersBody,
    labels: { "u-recent": "recent@school.edu", "u-stuck": "Stuck Student" },
  });
  assert(labeled.ok === true, "200 dashboard with labels is ok");
  if (labeled.ok) {
    assertEqual(
      labeled.view.labels["u-stuck"],
      "Stuck Student",
      "dashboard keeps person labels"
    );
  }

  const forbidden = parseDashboardResponse(403, { error: "Forbidden" });
  assert(forbidden.ok === false, "403 dashboard is rejected");
  if (!forbidden.ok) {
    assertEqual(forbidden.error, "Forbidden", "403 surfaces the API error");
  }
  assert(
    parseDashboardResponse(200, { offeringId: "off_1" }).ok === false,
    "dashboard without stuckWaiters/teams is invalid"
  );

  const matched = parseMatchResponse(200, {
    team: { id: "team_9", offeringId: "off_1" },
  });
  assert(matched.ok === true, "200 match is ok");
  if (matched.ok) {
    assertEqual(matched.teamId, "team_9", "match response yields the formed team id");
  }
  const invalidTrio = parseMatchResponse(400, {
    error: "Manual match requires exactly three distinct queued learners",
  });
  assert(invalidTrio.ok === false, "400 invalid trio is rejected");
  if (!invalidTrio.ok) {
    assert(
      invalidTrio.error.includes("three distinct"),
      "400 match surfaces the API error for the picker"
    );
  }

  // --- UI wiring: operate page + OperatorDashboard ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/operator.ts");
  const dashboardPath = path.join(
    process.cwd(),
    "components/calibration/OperatorDashboard.tsx"
  );
  const pagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/operate/page.tsx"
  );
  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const dashboardSource = await fs.readFile(dashboardPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/operator.ts exists");
  assert(
    helpersSource.includes("canConfirmManualMatch"),
    "operator helpers export canConfirmManualMatch"
  );
  assert(
    helpersSource.includes("formatWaitDuration"),
    "operator helpers export formatWaitDuration"
  );
  assert(
    helpersSource.includes("matchPostBody"),
    "operator helpers export matchPostBody"
  );
  assert(
    !helpersSource.includes("TEAM_SIZE"),
    "operator helpers do not introduce a TEAM_SIZE constant"
  );
  assert(
    helpersSource.includes("=== 3") ||
      helpersSource.includes("!== 3") ||
      helpersSource.includes("length === 3") ||
      helpersSource.includes("length !== 3"),
    "manual match uses a literal 3"
  );
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store") &&
      !helpersSource.includes("calibration-api"),
    "operator helpers do not import engine/store/api"
  );

  assert(
    dashboardSource.includes("OperatorDashboard"),
    "OperatorDashboard component exists"
  );
  assert(
    dashboardSource.includes('"use client"') ||
      dashboardSource.includes("'use client'"),
    "OperatorDashboard is a client component"
  );
  assert(
    dashboardSource.includes("Learners"),
    "dashboard lists every learner, not only the 10-day stuck queue"
  );
  assert(
    dashboardSource.includes("Waiting") || dashboardSource.includes("waitedMs"),
    "dashboard shows waiting status"
  );
  assert(
    dashboardSource.includes("Team ") || dashboardSource.includes("teamIndex"),
    "dashboard shows which team a joined learner is on"
  );
  assert(
    dashboardSource.includes("formatWaitDuration") ||
      dashboardSource.includes("waitedMs"),
    "dashboard renders wait duration"
  );
  assert(
    dashboardSource.toLowerCase().includes("offering") ||
      dashboardSource.includes("offeringId"),
    "dashboard shows offering identity"
  );
  for (const column of ["phase", "members", "lastActivity", "autoFinalized"]) {
    assert(
      dashboardSource.includes(column) ||
        dashboardSource.toLowerCase().includes(column.toLowerCase()) ||
        (column === "lastActivity" &&
          (dashboardSource.includes("Last activity") ||
            dashboardSource.includes("last-activity"))) ||
        (column === "autoFinalized" &&
          (dashboardSource.includes("Auto-finalized") ||
            dashboardSource.includes("auto-finalized"))),
      `dashboard team table mentions ${column}`
    );
  }
  assert(
    dashboardSource.includes("canConfirmManualMatch") ||
      dashboardSource.includes("disabled"),
    "manual-match confirm is gated until a valid trio"
  );
  assert(
    dashboardSource.includes("operateMatchApiHref") ||
      dashboardSource.includes("/operate/match"),
    "dashboard posts to the manual-match API"
  );
  assert(
    dashboardSource.includes('method: "POST"') ||
      dashboardSource.includes("method: 'POST'") ||
      dashboardSource.includes('"POST"'),
    "dashboard POSTs the manual match"
  );
  assert(
    dashboardSource.includes("matchPostBody") ||
      dashboardSource.includes("userIds"),
    "dashboard sends { userIds } for a valid trio"
  );
  assert(
    dashboardSource.includes("operateDashboardApiHref") ||
      dashboardSource.includes("/operate"),
    "dashboard refreshes GET operate after a match"
  );
  assert(
    dashboardSource.includes("parseMatchResponse") ||
      dashboardSource.includes("400") ||
      dashboardSource.toLowerCase().includes("error"),
    "dashboard surfaces a match API error"
  );
  assert(
    !dashboardSource.includes("calibration-engine") &&
      !dashboardSource.includes("calibration-store") &&
      !dashboardSource.includes("calibration-api"),
    "OperatorDashboard does not import engine/store/api"
  );
  assert(
    dashboardSource.includes("Copy link") ||
      dashboardSource.includes("joinUrl") ||
      dashboardSource.includes("offeringGatePath"),
    "dashboard shows the learner join link"
  );
  assert(
    !dashboardSource.includes("OperatorTeamView"),
    "OperatorDashboard does not build OperatorTeamView (7.2)"
  );

  assert(pageSource.length > 0, "operate page exists");
  assert(pageSource.includes("OperatorDashboard"), "operate page renders OperatorDashboard");
  assert(pageSource.includes("AppShell"), "operate page uses AppShell chrome");
  assert(
    pageSource.includes("SignInPanel"),
    "operate page sends unauthenticated visitors to sign-in"
  );
  assert(
    pageSource.includes("getOperatorDashboard") ||
      pageSource.includes("operateDashboardApiHref") ||
      pageSource.includes("/operate"),
    "operate page loads GET operate dashboard data"
  );
  assert(
    pageSource.includes("403") ||
      pageSource.toLowerCase().includes("access denied") ||
      pageSource.toLowerCase().includes("forbidden"),
    "operate page is operator-only (403 for non-operators)"
  );
  assert(
    !pageSource.includes("OperatorTeamView"),
    "operate page does not build OperatorTeamView (7.2)"
  );

  if (failures > 0) {
    console.error(`\noperator.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("operator.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("operator.selftest crashed:", err);
  process.exit(1);
});
