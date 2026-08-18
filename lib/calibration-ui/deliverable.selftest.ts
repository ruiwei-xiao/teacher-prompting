/**
 * Self-test: locked final deliverable and personal addendum (Task 5.5).
 * Run: npx tsx lib/calibration-ui/deliverable.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  addendaApiHref,
  addendumAuthorLabel,
  addendumPostBody,
  oneAddendumPerUser,
  ownAddendum,
  upsertPostedAddendum,
  beforeLockAddendumRejected,
  buildDeliverableView,
  canPostAddendum,
  isDeliverableLocked,
  OPEN_FINAL_LABEL,
  shouldOfferDeliverable,
  unresolvedLabels,
  visibleRubricText,
} from "./deliverable";

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

const addendumAlice = {
  id: "ad_1",
  teamId: "team_9",
  userId: "u-alice",
  body: "I still want a rationale line on evidence.",
  createdAt: "2026-08-22T12:00:00.000Z",
};

const addendumBob = {
  id: "ad_2",
  teamId: "team_9",
  userId: "u-bob",
  body: "Late note: clarity looks settled to me.",
  createdAt: "2026-08-22T13:00:00.000Z",
};

async function main(): Promise<void> {
  // --- API href and POST body (10.6) ---
  assertEqual(
    addendaApiHref("team_9"),
    "/api/calibration/teams/team_9/addenda",
    "addenda POST is /api/calibration/teams/{teamId}/addenda"
  );
  assertEqual(
    addendumPostBody("  personal note  "),
    { body: "personal note" },
    "POST body is { body } with trimmed text"
  );

  // --- Visible group artifact: finalRubric ?? snapshot (markDeliverableLocked may leave finalRubric null) ---
  assertEqual(
    visibleRubricText("Locked rubric text", "Snapshot fallback"),
    "Locked rubric text",
    "finalRubric wins when present"
  );
  assertEqual(
    visibleRubricText(null, "Snapshot fallback"),
    "Snapshot fallback",
    "null finalRubric falls back to rubric snapshot"
  );
  assertEqual(
    visibleRubricText(undefined, "Snapshot fallback"),
    "Snapshot fallback",
    "undefined finalRubric falls back to rubric snapshot"
  );

  // --- Unresolved labels come from flaggedCriteria after lock (10.3 / 10.6) ---
  assertEqual(
    unresolvedLabels(["clarity", "evidence"]),
    ["clarity", "evidence"],
    "unresolved labels are the flagged criteria"
  );
  assertEqual(
    unresolvedLabels(["  tone  ", "", "evidence"]),
    ["tone", "evidence"],
    "blank flagged keys are dropped"
  );

  // --- Lock detection uses SpaceState.locked / phase, not finalRubric ---
  assertEqual(
    isDeliverableLocked({ locked: false, phase: "consensus" }),
    false,
    "unlocked consensus is not the deliverable"
  );
  assertEqual(
    isDeliverableLocked({ locked: true, phase: "consensus" }),
    true,
    "space.locked shows the deliverable"
  );
  assertEqual(
    isDeliverableLocked({ locked: false, phase: "finalized" }),
    true,
    "phase finalized shows the deliverable"
  );

  // --- Before lock: no addendum composer; member cannot post (10.6) ---
  assertEqual(
    canPostAddendum({ locked: false, role: "member" }),
    false,
    "member cannot post an addendum before lock"
  );
  assertEqual(
    canPostAddendum({ locked: false, role: "operator" }),
    false,
    "operator cannot post an addendum before lock"
  );

  const beforeLock = buildDeliverableView({
    locked: false,
    autoFinalized: false,
    rubricText: "Draft rubric",
    flaggedCriteria: ["clarity"],
    addenda: [],
    role: "member",
  });
  assertEqual(beforeLock.visible, false, "deliverable is hidden before lock");
  assertEqual(beforeLock.showComposer, false, "view does not include composer before lock");
  assertEqual(beforeLock.canPostAddendum, false, "view cannot post before lock");
  assertEqual(beforeLock.canEditGroupRubric, false, "this view never offers group-rubric edits");
  assertEqual(beforeLock.offersRollback, false, "no replay / undo-lock control (10.5)");
  assertEqual(beforeLock.addenda, [], "no addenda rendered before lock");

  assert(
    beforeLockAddendumRejected(409, {
      error: "addendum is only allowed after the group artifact is locked",
    }),
    "409 before lock is the addendum-rejected case"
  );
  assert(
    !beforeLockAddendumRejected(200, addendumAlice),
    "200 addendum POST is not a before-lock rejection"
  );
  assert(
    !beforeLockAddendumRejected(403, { error: "Forbidden" }),
    "403 is not the before-lock addendum rejection"
  );

  // --- After lock: rubric + unresolved labels + auto-finalized flag (10.4, 10.6) ---
  const afterLock = buildDeliverableView({
    locked: true,
    autoFinalized: true,
    rubricText: "Best-available rubric",
    flaggedCriteria: ["clarity", "evidence"],
    addenda: [addendumAlice],
    role: "member",
  });
  assertEqual(afterLock.visible, true, "deliverable is visible after lock");
  assertEqual(
    afterLock.rubricText,
    "Best-available rubric",
    "locked view shows the group rubric text"
  );
  assertEqual(
    afterLock.unresolvedLabels,
    ["clarity", "evidence"],
    "locked view labels unresolved criteria"
  );
  assertEqual(afterLock.autoFinalized, true, "locked view carries the auto-finalized flag");
  assertEqual(afterLock.showComposer, true, "late-returning member sees the addendum composer");
  assertEqual(afterLock.canPostAddendum, true, "member can post an addendum after lock");
  assertEqual(afterLock.canEditGroupRubric, false, "locked view has no group-rubric edit control");
  assertEqual(afterLock.offersRollback, false, "locked view has no replay / undo-lock control");
  assertEqual(afterLock.addenda, [addendumAlice], "existing addenda render after lock");

  const agreedLock = buildDeliverableView({
    locked: true,
    autoFinalized: false,
    rubricText: "Agreed rubric",
    flaggedCriteria: ["clarity", "openness", "fairness"],
    addenda: [],
    role: "member",
  });
  assertEqual(
    agreedLock.unresolvedLabels,
    [],
    "explicit consensus does not show scoring flags as unresolved"
  );

  assertEqual(OPEN_FINAL_LABEL, "Open Final", "deliverable CTA label is Open Final");
  assert(
    shouldOfferDeliverable({
      authorKind: "facilitator",
      body: "The team has locked the final rubric. Thank you — this activity is complete.",
    }),
    "legacy finalize copy still offers Open Final"
  );
  assert(
    shouldOfferDeliverable({
      authorKind: "facilitator",
      body: "Open Final with the button below this message, or from Final in the left sidebar.",
    }),
    "new finalize copy offers Open Final"
  );
  assert(
    shouldOfferDeliverable({
      authorKind: "facilitator",
      body: "This activity is auto-finalized.",
    }),
    "auto-finalize copy offers Open Final"
  );
  assert(
    !shouldOfferDeliverable({
      authorKind: "learner",
      body: "The team has locked the final rubric.",
    }),
    "learner messages do not offer Open Final"
  );

  const operatorLock = buildDeliverableView({
    locked: true,
    autoFinalized: false,
    rubricText: "Agreed rubric",
    flaggedCriteria: [],
    addenda: [addendumAlice],
    role: "operator",
  });
  assertEqual(operatorLock.visible, true, "operator can view the deliverable");
  assertEqual(operatorLock.showComposer, false, "operator does not get an addendum composer");
  assertEqual(operatorLock.canPostAddendum, false, "operator cannot post an addendum");
  assertEqual(operatorLock.canEditGroupRubric, false, "operator cannot edit the locked rubric");
  assertEqual(
    canPostAddendum({ locked: true, role: "operator" }),
    false,
    "canPostAddendum is false for operators after lock"
  );
  assertEqual(
    canPostAddendum({ locked: true, role: "member" }),
    true,
    "canPostAddendum is true for members after lock"
  );

  assertEqual(
    addendumAuthorLabel(addendumAlice, "u-alice"),
    "You",
    "own addendum is labeled You"
  );
  assertEqual(
    addendumAuthorLabel(addendumBob, "u-alice", { "u-bob": "Bob Chen" }),
    "Bob Chen",
    "teammate addendum uses the person label"
  );
  assertEqual(
    ownAddendum([addendumAlice, addendumBob], "u-alice")?.id,
    "ad_1",
    "ownAddendum finds the viewer's note"
  );
  assertEqual(
    oneAddendumPerUser([
      addendumAlice,
      { ...addendumAlice, id: "ad_1b", body: "newer", createdAt: "2026-08-22T14:00:00.000Z" },
    ]).map((row) => row.body),
    ["newer"],
    "one addendum per person keeps the latest"
  );

  // --- Posting an addendum upserts without changing the group rubric (10.6) ---
  const posted = upsertPostedAddendum(afterLock, addendumBob);
  assertEqual(
    posted.addenda.map((row) => row.id),
    ["ad_1", "ad_2"],
    "another member's addendum is added beside the first"
  );
  const edited = upsertPostedAddendum(posted, {
    ...addendumAlice,
    body: "Edited note on evidence.",
  });
  assertEqual(
    edited.addenda.filter((row) => row.userId === "u-alice").map((row) => row.body),
    ["Edited note on evidence."],
    "a second post from the same member replaces their addendum"
  );
  assertEqual(edited.addenda.length, 2, "edit does not add a second row for the same member");
  assertEqual(
    posted.rubricText,
    afterLock.rubricText,
    "addendum POST does not mutate displayed group rubric text"
  );
  assertEqual(posted.unresolvedLabels, afterLock.unresolvedLabels, "labels stay with the group artifact");
  assertEqual(posted.autoFinalized, afterLock.autoFinalized, "auto-finalized flag is unchanged");

  // --- Source: FinalDeliverable composed when locked; no group-edit control ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/deliverable.ts");
  const panelPath = path.join(
    process.cwd(),
    "components/calibration/FinalDeliverable.tsx"
  );
  const layoutPath = path.join(
    process.cwd(),
    "components/calibration/SpaceLayout.tsx"
  );
  const chatPath = path.join(
    process.cwd(),
    "components/calibration/GroupChatPanel.tsx"
  );
  const teamPagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/team/[teamId]/page.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const panelSource = await fs.readFile(panelPath, "utf8").catch(() => "");
  const layoutSource = await fs.readFile(layoutPath, "utf8").catch(() => "");
  const chatSource = await fs.readFile(chatPath, "utf8").catch(() => "");
  const teamPageSource = await fs.readFile(teamPagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/deliverable.ts exists");
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store/store") &&
      !helpersSource.includes("calibration-api"),
    "deliverable helpers do not import engine/store/api"
  );
  assert(
    !helpersSource.includes("finalRubric") ||
      helpersSource.includes("visibleRubricText"),
    "helpers resolve visible rubric text without reading SpaceState.finalRubric"
  );

  assert(panelSource.includes("FinalDeliverable"), "FinalDeliverable component exists");
  assert(
    panelSource.includes('"use client"') || panelSource.includes("'use client'"),
    "FinalDeliverable is a client component"
  );
  assert(
    !panelSource.includes("calibration-engine") &&
      !panelSource.includes("calibration-store/store") &&
      !panelSource.includes("calibration-api"),
    "FinalDeliverable does not import engine/store/api modules"
  );
  assert(
    panelSource.includes("addendaApiHref") ||
      panelSource.includes("/addenda"),
    "FinalDeliverable posts to the addenda endpoint"
  );
  assert(
    panelSource.includes("addendumPostBody") ||
      panelSource.includes("{ body") ||
      panelSource.includes("body:"),
    "FinalDeliverable posts { body }"
  );
  assert(
    /unresolved/i.test(panelSource),
    "FinalDeliverable renders unresolved-criteria labels"
  );
  assert(
    /auto-?final/i.test(panelSource),
    "FinalDeliverable renders the auto-finalized flag"
  );
  assert(
    panelSource.includes("<textarea") || panelSource.includes("<textarea "),
    "member addendum composer is a plain textarea"
  );
  assert(
    panelSource.includes("addendumAuthorLabel") &&
      layoutSource.includes("labels={space.labels}"),
    "addenda show person names from space labels"
  );
  assert(
    !panelSource.includes("Teammate"),
    "member addenda do not hide authors as Teammate"
  );
  assert(
    panelSource.includes("Edit your addendum") &&
      panelSource.includes("Save addendum"),
    "a member can edit their single addendum"
  );
  assert(
    /canPostAddendum/.test(panelSource) || /showComposer/.test(panelSource),
    "composer is gated by canPostAddendum / showComposer"
  );
  assert(
    !/contenteditable/i.test(panelSource) &&
      !/edit rubric/i.test(panelSource) &&
      !/save rubric/i.test(panelSource) &&
      !/rewrite rubric/i.test(panelSource),
    "FinalDeliverable has no group-rubric edit control"
  );
  assert(
    !/replay/i.test(panelSource) &&
      !/undo lock/i.test(panelSource) &&
      !/unlock/i.test(panelSource) &&
      !/roll ?back/i.test(panelSource),
    "FinalDeliverable has no replay / undo-lock control (10.5)"
  );
  assert(
    !panelSource.toLowerCase().includes("liveblocks") &&
      !panelSource.toLowerCase().includes("yjs") &&
      !panelSource.toLowerCase().includes("collaborationplugin"),
    "FinalDeliverable has no Liveblocks/Yjs"
  );

  assert(
    layoutSource.includes("FinalDeliverable"),
    "FinalDeliverable is composed into SpaceLayout"
  );
  assert(
    layoutSource.includes('"deliverable"') &&
      layoutSource.includes("overlay === \"deliverable\""),
    "locked deliverable opens as an overlay, not a banner over the panes"
  );
  assert(
    layoutSource.includes("onOpenDeliverable") &&
      (chatSource.includes("OPEN_FINAL_LABEL") ||
        chatSource.includes("Open Final")),
    "facilitator finalize prompts can open the deliverable from chat"
  );
  assert(
    !layoutSource.includes("shrink-0 overflow-y-auto border-b"),
    "FinalDeliverable is not a shrink-0 banner above group chat"
  );
  assert(
    layoutSource.includes("locked") && layoutSource.includes("finalized"),
    "SpaceLayout shows the deliverable when space.locked or phase===finalized"
  );
  assert(
    !/replay/i.test(layoutSource) && !/undo lock/i.test(layoutSource),
    "SpaceLayout has no replay / undo-lock control"
  );
  assert(
    !layoutSource.includes("calibration-engine") &&
      !layoutSource.includes("calibration-store"),
    "SpaceLayout still does not import engine/store"
  );
  assert(
    layoutSource.includes("SharedDocEditor"),
    "SharedDocEditor is composed into SpaceLayout"
  );

  assert(
    teamPageSource.includes("getTeam"),
    "team page loads getTeam for finalizedAt / autoFinalized / finalRubric / flaggedCriteria"
  );
  assert(
    teamPageSource.includes("listAddenda"),
    "team page loads listAddenda"
  );
  assert(
    teamPageSource.includes("getTeamForMember"),
    "team page loads the rubric snapshot via getTeamForMember"
  );
  assert(
    teamPageSource.includes("finalRubric") ||
      teamPageSource.includes("visibleRubricText") ||
      teamPageSource.includes("snapshotText"),
    "team page uses finalRubric ?? rubric snapshot as the visible group artifact"
  );
  assert(
    !teamPageSource.includes("FinalDeliverable"),
    "team page does not import FinalDeliverable; SpaceLayout composes it"
  );
  assert(
    !teamPageSource.includes("from \"@/lib/calibration-store/store\"") ||
      teamPageSource.includes("getTeam"),
    "store reads stay on the server page"
  );

  if (failures > 0) {
    console.error(`\ndeliverable.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("deliverable.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("deliverable.selftest crashed:", err);
  process.exit(1);
});
