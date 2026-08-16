/**
 * Self-test: course-gate landing, queue status, and notice destinations (Task 5.1).
 * Run: npx tsx lib/calibration-ui/gate.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  checkInApiHref,
  gateApiHref,
  landingPathFromGate,
  nextLocationAfterCheckIn,
  noticeDestination,
  offeringGatePath,
  parseCheckInResponse,
  parseGateResponse,
  queueStatusLabel,
  teamSpacePath,
} from "./gate";

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

async function main(): Promise<void> {
  // --- Paths used by notices (13.3) and the gate/team pages ---
  assertEqual(
    offeringGatePath("off_1"),
    "/activity/off_1",
    "gate path is /activity/{offeringId}"
  );
  assertEqual(
    teamSpacePath("off_1", "team_9"),
    "/activity/off_1/team/team_9",
    "team path is /activity/{offeringId}/team/{teamId}"
  );
  assertEqual(
    noticeDestination({ offeringId: "off_1" }),
    "/activity/off_1",
    "queue notice destination is the course-gate landing"
  );
  assertEqual(
    noticeDestination({ offeringId: "off_1", teamId: null }),
    "/activity/off_1",
    "notice without a team stays on the gate"
  );
  assertEqual(
    noticeDestination({ offeringId: "off_1", teamId: "team_9" }),
    "/activity/off_1/team/team_9",
    "team notice destination is the team space"
  );
  assertEqual(
    noticeDestination({ offeringId: "off_1" }),
    offeringGatePath("off_1"),
    "notice queue destination matches the gate path"
  );
  assertEqual(
    noticeDestination({ offeringId: "off_1", teamId: "team_9" }),
    teamSpacePath("off_1", "team_9"),
    "notice team destination matches the team path"
  );

  assertEqual(
    gateApiHref("off_1"),
    "/api/calibration/offerings/off_1",
    "gate status uses GET /api/calibration/offerings/{id}"
  );
  assertEqual(
    checkInApiHref("off_1"),
    "/api/calibration/offerings/off_1/checkin",
    "enter posts to the existing check-in API"
  );

  // --- QueueStatus label is "n of 3" (2.1); literal 3, no TEAM_SIZE ---
  assertEqual(
    queueStatusLabel(0),
    "0 of 3 have joined",
    "empty queue is 0 of 3"
  );
  assertEqual(
    queueStatusLabel(1),
    "1 of 3 have joined",
    "first check-in is 1 of 3"
  );
  assertEqual(
    queueStatusLabel(2),
    "2 of 3 have joined",
    "pre-quorum second check-in is 2 of 3"
  );
  assert(
    queueStatusLabel(1).includes(" of 3"),
    "label uses a literal 3 denominator"
  );

  // --- Unmatched check-in stays on the gate; matched goes to the team ---
  assertEqual(
    nextLocationAfterCheckIn("off_1", {
      status: "queued",
      queueCount: 1,
      of: 3,
      teamId: null,
    }),
    "/activity/off_1",
    "unmatched check-in stays on /activity/{offeringId}"
  );
  assertEqual(
    nextLocationAfterCheckIn("off_1", {
      status: "matched",
      queueCount: 0,
      of: 3,
      teamId: "team_9",
    }),
    "/activity/off_1/team/team_9",
    "matched check-in (teamId set) goes to /activity/{offeringId}/team/{teamId}"
  );
  assertEqual(
    landingPathFromGate("off_1", { teamId: null }),
    "/activity/off_1",
    "unmatched gate view stays on the queue landing"
  );
  assertEqual(
    landingPathFromGate("off_1", { teamId: "team_9" }),
    "/activity/off_1/team/team_9",
    "matched gate view (notice open) lands in the team space"
  );

  const queued = parseCheckInResponse(200, {
    status: "queued",
    queueCount: 2,
    of: 3,
    teamId: null,
  });
  assert(queued.ok === true, "200 queued check-in is ok");
  if (queued.ok) {
    assertEqual(queued.view.queueCount, 2, "check-in view keeps queueCount");
    assertEqual(queued.view.of, 3, "check-in view keeps of: 3");
    assertEqual(queued.view.teamId, null, "queued check-in has no team");
  }

  const matched = parseCheckInResponse(200, {
    status: "matched",
    queueCount: 0,
    of: 3,
    teamId: "team_9",
  });
  assert(matched.ok === true, "200 matched check-in is ok");
  if (matched.ok) {
    assertEqual(matched.view.teamId, "team_9", "matched check-in has teamId");
  }

  const duplicate = parseCheckInResponse(409, {
    status: "queued",
    queueCount: 1,
    of: 3,
    teamId: null,
    error: "Already checked in",
  });
  assert(duplicate.ok === true, "409 duplicate still yields current queue view");
  if (duplicate.ok) {
    assertEqual(duplicate.view.queueCount, 1, "409 returns live queueCount");
  }

  const gate = parseGateResponse(200, {
    offering: {
      id: "off_1",
      title: "Pilot",
      artifacts: {
        sampleAppId: "app_1",
        hasSampleRubric: true,
        hasDeploymentBrief: true,
        hasTranscriptExcerpt: true,
      },
    },
    me: {
      checkedIn: false,
      queueCount: 0,
      teamId: null,
      role: "learner",
    },
  });
  assert(gate.ok === true, "200 gate view is ok");
  if (gate.ok) {
    assertEqual(gate.view.me.checkedIn, false, "gate GET does not check the caller in");
    assertEqual(gate.view.me.teamId, null, "unmatched gate has no team");
  }

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/gate.ts");
  const queuePath = path.join(
    process.cwd(),
    "components/calibration/QueueStatus.tsx"
  );
  const landingPath = path.join(
    process.cwd(),
    "components/calibration/CourseGateLanding.tsx"
  );
  const gatePagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/page.tsx"
  );
  const teamPagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/team/[teamId]/page.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const queueSource = await fs.readFile(queuePath, "utf8").catch(() => "");
  const landingSource = await fs.readFile(landingPath, "utf8").catch(() => "");
  const gatePageSource = await fs.readFile(gatePagePath, "utf8").catch(() => "");
  const teamPageSource = await fs.readFile(teamPagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/gate.ts exists");
  assert(
    !helpersSource.includes("TEAM_SIZE"),
    "queue helpers do not introduce a TEAM_SIZE constant"
  );
  assert(
    helpersSource.includes(" of 3") || helpersSource.includes('"3"') || helpersSource.includes("of: 3"),
    "queue helpers hard-code the 3-person denominator"
  );
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store"),
    "gate helpers do not import engine/store"
  );

  assert(
    queueSource.includes("queueStatusLabel") ||
      queueSource.includes(" of 3 checked in") ||
      queueSource.includes("of 3"),
    "QueueStatus renders n of 3"
  );
  assert(
    !queueSource.includes("TEAM_SIZE"),
    "QueueStatus does not use a TEAM_SIZE constant"
  );

  assert(
    landingSource.includes("CourseGateLanding") ||
      landingSource.includes("checkIn") ||
      landingSource.includes("Enter"),
    "CourseGateLanding component exists"
  );
  assert(
    landingSource.includes("checkInApiHref") ||
      landingSource.includes("/checkin"),
    "landing posts to the check-in API"
  );
  assert(
    landingSource.includes('method: "POST"') ||
      landingSource.includes("method: 'POST'") ||
      landingSource.includes('"POST"'),
    "landing POSTs check-in (does not rely on gate GET)"
  );
  assert(
    landingSource.includes("QueueStatus"),
    "landing shows QueueStatus after check-in"
  );
  assert(
    landingSource.includes("nextLocationAfterCheckIn") ||
      landingSource.includes("teamSpacePath") ||
      landingSource.includes("/team/"),
    "matched check-in navigates to the team space"
  );
  assert(
    landingSource.toLowerCase().includes("enter") ||
      landingSource.toLowerCase().includes("check in") ||
      landingSource.toLowerCase().includes("check-in"),
    "landing offers an enter/check-in action"
  );
  assert(
    !landingSource.includes("calibration-engine") &&
      !landingSource.includes("calibration-store"),
    "CourseGateLanding does not import engine/store"
  );

  assert(
    gatePageSource.includes("CourseGateLanding"),
    "course-gate page renders CourseGateLanding"
  );
  assert(gatePageSource.includes("AppShell"), "course-gate page uses AppShell");
  assert(
    gatePageSource.includes("SignInPanel"),
    "course-gate page sends unauthenticated visitors to sign-in"
  );
  assert(
    gatePageSource.includes("getOfferingGate") ||
      gatePageSource.includes("gateApiHref") ||
      gatePageSource.includes("/api/calibration/offerings/"),
    "course-gate page loads GateView (GET, no auto check-in)"
  );
  assert(
    !gatePageSource.includes("/checkin") &&
      !gatePageSource.includes("postCheckIn"),
    "course-gate page itself does not check the visitor in"
  );
  assert(
    gatePageSource.includes("landingPathFromGate") ||
      gatePageSource.includes("teamSpacePath") ||
      gatePageSource.includes("redirect"),
    "matched learners opening the gate are sent to the team space"
  );

  assert(
    teamPageSource.length > 0,
    "team space page exists so a matched redirect has a destination"
  );
  assert(
    teamPageSource.includes("AppShell"),
    "team landing uses AppShell chrome"
  );
  assert(
    teamPageSource.includes("SignInPanel"),
    "team landing sends unauthenticated visitors to sign-in"
  );
  assert(
    teamPageSource.includes("SpaceLayout"),
    "team page renders the space shell (5.2)"
  );
  assert(
    !teamPageSource.includes("ScoreSheet") &&
      !teamPageSource.includes("ArtifactsPanel") &&
      !teamPageSource.includes("SharedDocEditor"),
    "later panels are composed as slots by SpaceLayout, not on the page"
  );

  if (failures > 0) {
    console.error(`\ngate.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("gate.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("gate.selftest crashed:", err);
  process.exit(1);
});
