/**
 * Self-test: read-only operator team inspector (Task 7.2).
 * Held scores stay visible to the operator; a member view of the same
 * pre-reveal state leaks none. Inspector source has no write affordances.
 * Run: npx tsx lib/calibration-ui/inspector.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import { visibleRubricText } from "./deliverable";
import { canPushDocSnapshot } from "./docs";
import {
  buildInspectorView,
  parseInspect,
  type InspectorInspect,
} from "./operator";
import {
  buildScoreSheetView,
  preRevealLeaksTeammateValues,
  type ScoreSpace,
} from "./scores";
import { canCompose } from "./space";

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

const aliceScores = [
  { criterionKey: "clarity", value: 5 },
  { criterionKey: "evidence", value: 1 },
];
const bobScores = [
  { criterionKey: "clarity", value: 3 },
  { criterionKey: "evidence", value: 2 },
];

const heldInspectBody = {
  role: "operator",
  space: {
    role: "operator",
    phase: "scoring",
    round: 0,
    critiqueStage: "idle",
    presenterUserId: null,
    criticUserIds: [],
    recap: { since: null, messages: [] },
    messages: [
      {
        id: "m1",
        authorKind: "facilitator",
        authorUserId: null,
        body: "Please score the artifact privately.",
        createdAt: "2026-08-15T12:00:00.000Z",
      },
      {
        id: "m2",
        authorKind: "learner",
        authorUserId: "u-alice",
        body: "Ready to score.",
        createdAt: "2026-08-15T12:05:00.000Z",
      },
    ],
    locked: false,
    ownScores: [],
    submittedBy: ["u-alice", "u-bob"],
    revealedAt: null,
    matrix: [],
  },
  scores: {
    members: [
      { userId: "u-alice", scores: aliceScores },
      { userId: "u-bob", scores: bobScores },
    ],
    revealedAt: null,
  },
  absences: [
    {
      teamId: "team_9",
      userId: "u-cara",
      stepKey: "critique:1",
      markedAt: "2026-08-14T10:00:00.000Z",
    },
  ],
  docs: [
    {
      teamId: "team_9",
      docKind: "rubric",
      snapshotText: "Clarity: one-line rationale.",
      updatedAt: "2026-08-15T11:00:00.000Z",
      updatedBy: "u-alice",
    },
    {
      teamId: "team_9",
      docKind: "notes",
      snapshotText: "Evidence notes from round 2.",
      updatedAt: "2026-08-15T11:30:00.000Z",
      updatedBy: "u-bob",
    },
  ],
  finalDeliverable: {
    finalRubric: null,
    autoFinalized: false,
    finalizedAt: null,
    flaggedCriteria: [],
    addenda: [],
  },
};

const memberPreReveal: ScoreSpace = {
  role: "member",
  phase: "scoring",
  locked: false,
  ownScores: bobScores,
  submittedBy: ["u-alice", "u-bob"],
  revealedAt: null,
  matrix: [{ userId: "u-alice", scores: aliceScores }],
};

async function main(): Promise<void> {
  // --- parseInspect keeps operator inspect contents (14.5) ---
  const parsed = parseInspect(200, heldInspectBody);
  assert(parsed.ok === true, "200 inspect is ok");
  if (parsed.ok) {
    assertEqual(parsed.inspect.role, "operator", "inspect role is operator");
    assertEqual(
      parsed.inspect.space.revealedAt,
      null,
      "parsed inspect keeps null revealedAt"
    );
    assertEqual(
      parsed.inspect.scores.revealedAt,
      null,
      "parsed scores stay unrevealed"
    );
    assertEqual(
      parsed.inspect.scores.members.map((row) => row.userId),
      ["u-alice", "u-bob"],
      "parsed inspect keeps held score members"
    );
    assertEqual(
      parsed.inspect.docs.map((doc) => doc.docKind),
      ["rubric", "notes"],
      "parsed inspect keeps latest doc snapshots"
    );
    assertEqual(parsed.inspect.absences.length, 1, "parsed inspect keeps absences");
  }

  const forbidden = parseInspect(403, { error: "Forbidden" });
  assert(forbidden.ok === false, "403 inspect is rejected");
  if (!forbidden.ok) {
    assertEqual(forbidden.error, "Forbidden", "403 surfaces the API error");
  }
  assert(
    parseInspect(200, { role: "member" }).ok === false,
    "member-shaped inspect is invalid for the operator inspector"
  );

  // --- Inspector view model includes held numeric scores (14.5, 14.7) ---
  const inspect: InspectorInspect = parsed.ok
    ? parsed.inspect
    : (heldInspectBody as InspectorInspect);
  const view = buildInspectorView(inspect);
  assertEqual(view.role, "operator", "inspector view is operator");
  assertEqual(view.revealedAt, null, "inspector view keeps scores unrevealed");
  assert(
    view.scores.some(
      (row) =>
        row.userId === "u-alice" &&
        row.scores.some((score) => score.criterionKey === "clarity" && score.value === 5)
    ),
    "inspector view includes Alice's held clarity=5 even when revealedAt is null"
  );
  assert(
    view.scores.some(
      (row) =>
        row.userId === "u-bob" &&
        row.scores.some((score) => score.criterionKey === "evidence" && score.value === 2)
    ),
    "inspector view includes Bob's held evidence=2"
  );
  const inspectorBlob = JSON.stringify(view.scores);
  assert(
    inspectorBlob.includes('"value":5') && inspectorBlob.includes('"value":1'),
    "inspector serialized scores include Alice's held numeric values"
  );
  assertEqual(
    view.messages.map((message) => message.body),
    ["Please score the artifact privately.", "Ready to score."],
    "inspector view keeps chat messages"
  );
  assertEqual(
    view.rubricSnapshot,
    "Clarity: one-line rationale.",
    "inspector view keeps the latest rubric snapshot"
  );
  assertEqual(
    view.notesSnapshot,
    "Evidence notes from round 2.",
    "inspector view keeps the latest notes snapshot"
  );
  assert(
    view.absences.some((row) => row.userId === "u-cara" && row.stepKey === "critique:1"),
    "inspector view keeps absence marks"
  );
  assert(
    view.finalDeliverable !== undefined,
    "inspector view keeps the final deliverable slot"
  );
  assertEqual(
    visibleRubricText(view.finalDeliverable.finalRubric, view.rubricSnapshot),
    view.rubricSnapshot,
    "null finalRubric falls back to the shared rubric snapshot"
  );
  assertEqual(view.canPostMessage, false, "inspector cannot post messages (14.6)");
  assertEqual(view.canEditDocs, false, "inspector cannot edit docs (14.6)");
  assertEqual(view.canResetClocks, false, "inspector cannot reset clocks (14.6)");
  assertEqual(view.canAdvancePhase, false, "inspector cannot advance phases (14.6)");

  // --- Same pre-reveal state: member score-sheet leaks none (14.7) ---
  const memberView = buildScoreSheetView(memberPreReveal, "u-bob", [
    "clarity",
    "evidence",
  ]);
  assertEqual(memberView.matrix, [], "member pre-reveal matrix is empty");
  assert(
    !preRevealLeaksTeammateValues(memberPreReveal, "u-bob"),
    "member score-sheet view model leaks no teammate values from the same held state"
  );
  const memberBlob = JSON.stringify({
    ownScores: memberView.ownScores,
    submittedUserIds: memberView.submittedUserIds,
    matrix: memberView.matrix,
  });
  assert(
    !memberBlob.includes('"value":5') && !memberBlob.includes('"value":1'),
    "member serialized view contains zero of Alice's held values"
  );
  assertEqual(memberView.canSubmit, false, "submitted member has no submit");
  assertEqual(memberView.canEnter, false, "submitted member cannot re-enter");

  // --- Source: same team-space layout, write gates stay closed (14.6) ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/operator.ts");
  const viewPath = path.join(
    process.cwd(),
    "components/calibration/OperatorTeamView.tsx"
  );
  const layoutPath = path.join(
    process.cwd(),
    "components/calibration/SpaceLayout.tsx"
  );
  const pagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/operate/team/[teamId]/page.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const viewSource = await fs.readFile(viewPath, "utf8").catch(() => "");
  const layoutSource = await fs.readFile(layoutPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/operator.ts exists");
  assert(
    helpersSource.includes("parseInspect"),
    "operator helpers export parseInspect"
  );
  assert(
    helpersSource.includes("buildInspectorView"),
    "operator helpers export buildInspectorView"
  );
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store") &&
      !helpersSource.includes("calibration-api"),
    "operator helpers do not import engine/store/api"
  );

  assert(viewSource.length > 0, "OperatorTeamView.tsx exists");
  assert(
    viewSource.includes("OperatorTeamView"),
    "OperatorTeamView component exists"
  );
  assert(
    viewSource.includes("SpaceLayout"),
    "inspector reuses the member team-space layout"
  );
  assert(
    viewSource.includes("operatePageHref") ||
      viewSource.includes("Back to progress"),
    "inspector back link returns to progress"
  );
  assert(
    viewSource.includes("absences"),
    "inspector passes absence marks into the space"
  );
  assert(
    !viewSource.includes("<textarea") && !viewSource.includes("<input"),
    "OperatorTeamView itself has no composers"
  );
  assert(
    !viewSource.toLowerCase().includes("advance"),
    "inspector has no advance-phase affordance"
  );
  assert(
    !viewSource.toLowerCase().includes("reset clock") &&
      !viewSource.toLowerCase().includes("resetclock"),
    "inspector has no reset-clock affordance"
  );
  assert(
    !viewSource.includes('method: "POST"') &&
      !viewSource.includes("method: 'POST'"),
    "OperatorTeamView does not POST messages, docs, or scores"
  );
  assert(
    !viewSource.includes("calibration-engine") &&
      !viewSource.includes("calibration-store") &&
      !viewSource.includes("calibration-api"),
    "OperatorTeamView does not import engine/store/api"
  );

  assert(
    !canCompose({ role: "operator" }),
    "operator cannot compose group chat (14.6)"
  );
  assert(
    !canPushDocSnapshot({ locked: false, role: "operator" }),
    "operator cannot push document snapshots (14.6)"
  );
  assert(
    layoutSource.includes("Absences") &&
      layoutSource.includes('role === "operator"'),
    "SpaceLayout shows absences on the operator score overlay"
  );
  assert(
    layoutSource.includes("Held scores") ||
      layoutSource.includes("held scores"),
    "SpaceLayout labels held scores for the operator"
  );

  assert(pageSource.length > 0, "inspect page exists");
  assert(
    pageSource.includes("OperatorTeamView"),
    "inspect page renders OperatorTeamView"
  );
  assert(
    !pageSource.includes("AppShell"),
    "inspect page uses the full-height space chrome instead of AppShell"
  );
  assert(
    pageSource.includes("SignInPanel"),
    "inspect page sends unauthenticated visitors to sign-in"
  );
  assert(
    pageSource.includes("inspectTeam"),
    "inspect page loads inspectTeam on the server"
  );
  assert(
    pageSource.includes("visibleRubricText"),
    "inspect page uses finalRubric ?? rubric snapshot as the visible group artifact"
  );
  assert(
    pageSource.includes("403") ||
      pageSource.toLowerCase().includes("access denied") ||
      pageSource.toLowerCase().includes("forbidden"),
    "inspect page is operator-only (403 for non-operators)"
  );
  assert(
    !pageSource.includes("GroupChatPanel") &&
      !pageSource.includes("ScoreSheet") &&
      !pageSource.includes("SharedDocEditor"),
    "inspect page does not mount composers directly"
  );

  if (failures > 0) {
    console.error(`\ninspector.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("inspector.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("inspector.selftest crashed:", err);
  process.exit(1);
});
