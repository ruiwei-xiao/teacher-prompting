/**
 * Self-test: private score sheet, submission checkmarks, revealed matrix (Task 5.4).
 * Run: npx tsx lib/calibration-ui/scores.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import { parseSpaceResponse } from "./space";
import {
  SCORE_MAX,
  SCORE_MIN,
  buildScoreSheetView,
  flaggedCriterionKeys,
  isRevealed,
  isValidScoreValue,
  preRevealLeaksTeammateValues,
  scorePostBody,
  scoresApiHref,
  submittedCheckmarks,
  visibleOwnScores,
  type ScoreSpace,
} from "./scores";

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
const caraScores = [
  { criterionKey: "clarity", value: 4 },
  { criterionKey: "evidence", value: 2 },
];

const preRevealBob: ScoreSpace = {
  role: "member",
  phase: "scoring",
  locked: false,
  ownScores: bobScores,
  submittedBy: ["u-alice", "u-bob"],
  revealedAt: null,
  matrix: [],
};

const preRevealBobWithLeakedMatrix: ScoreSpace = {
  ...preRevealBob,
  matrix: [{ userId: "u-alice", scores: aliceScores }],
};

const revealed: ScoreSpace = {
  role: "member",
  phase: "discussion",
  locked: false,
  ownScores: bobScores,
  submittedBy: ["u-alice", "u-bob", "u-cara"],
  revealedAt: "2026-08-20T12:00:00.000Z",
  matrix: [
    { userId: "u-alice", scores: aliceScores },
    { userId: "u-bob", scores: bobScores },
    { userId: "u-cara", scores: caraScores },
  ],
};

async function main(): Promise<void> {
  // --- API href and POST body shape (8.1, 8.7) ---
  assertEqual(
    scoresApiHref("team_9"),
    "/api/calibration/teams/team_9/scores",
    "scores POST is /api/calibration/teams/{teamId}/scores"
  );
  assertEqual(
    scorePostBody(bobScores),
    { scores: bobScores },
    "POST body is { scores: [{ criterionKey, value }] }"
  );
  const posted = scorePostBody([
    { criterionKey: "clarity", value: 4 },
    { criterionKey: "evidence", value: 2 },
  ]);
  assert(Array.isArray(posted.scores), "POST body.scores is an array");
  assertEqual(
    Object.keys(posted.scores[0] ?? {}).slice().sort(),
    ["criterionKey", "value"],
    "each POST score has criterionKey and value only"
  );

  // --- Values outside 1–5 rejected (8.7) ---
  assertEqual(SCORE_MIN, 1, "SCORE_MIN is 1");
  assertEqual(SCORE_MAX, 5, "SCORE_MAX is 5");
  assert(isValidScoreValue(1), "1 is a valid score");
  assert(isValidScoreValue(5), "5 is a valid score");
  assert(isValidScoreValue(3), "3 is a valid score");
  assert(!isValidScoreValue(0), "0 is rejected");
  assert(!isValidScoreValue(6), "6 is rejected");
  assert(!isValidScoreValue(1.5), "non-integer is rejected");
  assert(!isValidScoreValue(-1), "negative is rejected");
  assert(!isValidScoreValue(Number.NaN), "NaN is rejected");

  let threwLow = false;
  try {
    scorePostBody([{ criterionKey: "clarity", value: 0 }]);
  } catch {
    threwLow = true;
  }
  assert(threwLow, "scorePostBody rejects a value below 1");

  let threwHigh = false;
  try {
    scorePostBody([{ criterionKey: "clarity", value: 6 }]);
  } catch {
    threwHigh = true;
  }
  assert(threwHigh, "scorePostBody rejects a value above 5");

  let threwFrac = false;
  try {
    scorePostBody([{ criterionKey: "clarity", value: 2.5 }]);
  } catch {
    threwFrac = true;
  }
  assert(threwFrac, "scorePostBody rejects a non-integer");

  // --- Pre-reveal: own values + submitted checkmarks, no teammate numbers (8.2, 8.3) ---
  assertEqual(isRevealed(preRevealBob), false, "null revealedAt is unrevealed");
  assertEqual(visibleOwnScores(preRevealBob), bobScores, "pre-reveal shows own scores");
  assertEqual(
    submittedCheckmarks(preRevealBob),
    ["u-alice", "u-bob"],
    "pre-reveal checkmarks are userIds only"
  );
  for (const id of submittedCheckmarks(preRevealBob)) {
    assert(typeof id === "string", "checkmark entries are userIds, not score values");
  }

  const preView = buildScoreSheetView(preRevealBob, "u-bob", [
    "clarity",
    "evidence",
  ]);
  assertEqual(preView.mode, "submitted", "member who submitted sees submitted mode");
  assertEqual(preView.canEnter, false, "submitted member cannot re-enter");
  assertEqual(preView.canSubmit, false, "submitted member has no submit");
  assertEqual(preView.ownScores, bobScores, "submitted view keeps own values");
  assertEqual(
    preView.submittedUserIds,
    ["u-alice", "u-bob"],
    "submitted view lists who submitted"
  );
  assertEqual(preView.matrix, [], "pre-reveal view matrix is empty for members");
  assert(
    !preRevealLeaksTeammateValues(preRevealBob, "u-bob"),
    "clean pre-reveal payload does not leak teammate values"
  );
  assert(
    !preRevealLeaksTeammateValues(preRevealBobWithLeakedMatrix, "u-bob"),
    "pre-reveal view model strips teammate numeric values even if matrix leaked"
  );

  const leakedView = buildScoreSheetView(preRevealBobWithLeakedMatrix, "u-bob", [
    "clarity",
    "evidence",
  ]);
  const leakedBlob = JSON.stringify({
    ownScores: leakedView.ownScores,
    submittedUserIds: leakedView.submittedUserIds,
    matrix: leakedView.matrix,
  });
  assert(
    !leakedBlob.includes('"value":5') && !leakedBlob.includes('"value":1'),
    "pre-reveal serialized view contains zero teammate numeric values"
  );
  assert(
    leakedView.matrix.every((row) => row.userId === "u-bob" || row.scores.length === 0),
    "pre-reveal matrix rows never carry other members' scores"
  );

  const entrySpace: ScoreSpace = {
    role: "member",
    phase: "scoring",
    locked: false,
    ownScores: [],
    submittedBy: ["u-alice"],
    revealedAt: null,
    matrix: [],
  };
  const entryView = buildScoreSheetView(entrySpace, "u-bob", [
    "clarity",
    "evidence",
  ]);
  assertEqual(entryView.mode, "entry", "unsubmitted member in scoring can enter");
  assertEqual(entryView.canEnter, true, "entry mode allows 1–5 controls");
  assertEqual(entryView.canSubmit, true, "entry mode shows submit");
  assertEqual(
    entryView.submittedUserIds,
    ["u-alice"],
    "entry mode still shows teammate checkmarks"
  );
  assertEqual(entryView.matrix, [], "entry mode has no teammate matrix");
  assert(
    !preRevealLeaksTeammateValues(entrySpace, "u-bob"),
    "entry view model contains zero teammate numeric values"
  );

  // --- No entry before scoring (critique / merge) ---
  const critiqueView = buildScoreSheetView(
    { ...entrySpace, phase: "critique" },
    "u-bob",
    ["clarity", "evidence"]
  );
  assert(
    critiqueView.mode === "hidden" || critiqueView.mode === "readonly",
    "critique is hidden or read-only"
  );
  assertEqual(critiqueView.canEnter, false, "no entry during critique");
  assertEqual(critiqueView.canSubmit, false, "no submit during critique");

  const mergeView = buildScoreSheetView(
    { ...entrySpace, phase: "merge" },
    "u-bob",
    ["clarity", "evidence"]
  );
  assertEqual(mergeView.canEnter, false, "no entry during merge");
  assertEqual(mergeView.canSubmit, false, "no submit during merge");

  // --- Operator: no submit; may view matrix if present ---
  const operatorHeld: ScoreSpace = {
    role: "operator",
    phase: "scoring",
    locked: false,
    ownScores: [],
    submittedBy: ["u-alice", "u-bob"],
    revealedAt: null,
    matrix: [
      { userId: "u-alice", scores: aliceScores },
      { userId: "u-bob", scores: bobScores },
    ],
  };
  const operatorView = buildScoreSheetView(operatorHeld, "u-op", [
    "clarity",
    "evidence",
  ]);
  assertEqual(operatorView.canSubmit, false, "operator cannot submit");
  assertEqual(operatorView.canEnter, false, "operator has no entry controls");
  assertEqual(operatorView.mode, "matrix", "operator may view a present matrix");
  assert(
    operatorView.matrix.some((row) => row.userId === "u-alice"),
    "operator matrix includes held member rows"
  );

  // --- Post-reveal: full matrix; flag spread >= 2 only (9.2) ---
  assertEqual(isRevealed(revealed), true, "revealedAt set means revealed");
  assertEqual(
    flaggedCriterionKeys(revealed.matrix),
    ["clarity"],
    "clarity spread 5−3=2 is flagged; evidence spread 2−1=1 is not"
  );
  const spread1Only = flaggedCriterionKeys([
    {
      userId: "u-alice",
      scores: [{ criterionKey: "tone", value: 3 }],
    },
    {
      userId: "u-bob",
      scores: [{ criterionKey: "tone", value: 4 }],
    },
  ]);
  assertEqual(spread1Only, [], "spread of 1 is not flagged");
  const spread2 = flaggedCriterionKeys([
    {
      userId: "u-alice",
      scores: [{ criterionKey: "tone", value: 2 }],
    },
    {
      userId: "u-bob",
      scores: [{ criterionKey: "tone", value: 4 }],
    },
  ]);
  assertEqual(spread2, ["tone"], "spread of 2 is flagged");

  const postView = buildScoreSheetView(revealed, "u-bob", ["clarity", "evidence"]);
  assertEqual(postView.mode, "matrix", "post-reveal shows the matrix");
  assertEqual(postView.canEnter, false, "no entry after reveal");
  assert(
    postView.flaggedKeys.includes("clarity"),
    "post-reveal highlights every criterion with spread >= 2"
  );
  assert(
    !postView.flaggedKeys.includes("evidence"),
    "post-reveal does not highlight spread 1"
  );
  assertEqual(
    postView.matrix.map((row) => row.userId).slice().sort(),
    ["u-alice", "u-bob", "u-cara"],
    "post-reveal matrix includes every scorer"
  );

  // --- Poll parser keeps score fields on SpaceView ---
  const parsed = parseSpaceResponse(200, {
    role: "member",
    phase: "scoring",
    round: 0,
    critiqueStage: "idle",
    presenterUserId: null,
    criticUserIds: [],
    recap: { since: null, messages: [] },
    messages: [],
    locked: false,
    ownScores: bobScores,
    submittedBy: ["u-alice", "u-bob"],
    revealedAt: null,
    matrix: [],
  });
  assert(parsed.ok === true, "space GET with score fields parses");
  if (parsed.ok) {
    assertEqual(parsed.space.ownScores, bobScores, "parser keeps ownScores");
    assertEqual(
      parsed.space.submittedBy,
      ["u-alice", "u-bob"],
      "parser keeps submittedBy"
    );
    assertEqual(parsed.space.revealedAt, null, "parser keeps revealedAt");
    assertEqual(parsed.space.matrix, [], "parser keeps empty pre-reveal matrix");
  }

  const parsedRevealed = parseSpaceResponse(200, {
    role: "member",
    phase: "discussion",
    round: 0,
    critiqueStage: "idle",
    presenterUserId: null,
    criticUserIds: [],
    recap: { since: null, messages: [] },
    messages: [],
    locked: false,
    ownScores: bobScores,
    submittedBy: ["u-alice", "u-bob", "u-cara"],
    revealedAt: "2026-08-20T12:00:00.000Z",
    matrix: revealed.matrix,
  });
  assert(parsedRevealed.ok === true, "revealed space GET parses");
  if (parsedRevealed.ok) {
    assertEqual(
      parsedRevealed.space.revealedAt,
      "2026-08-20T12:00:00.000Z",
      "parser keeps revealedAt timestamp"
    );
    assertEqual(
      flaggedCriterionKeys(parsedRevealed.space.matrix),
      ["clarity"],
      "parsed revealed matrix still flags spread >= 2"
    );
  }

  // --- Source: ScoreSheet composed into SpaceLayout; no Liveblocks/Yjs ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/scores.ts");
  const sheetPath = path.join(
    process.cwd(),
    "components/calibration/ScoreSheet.tsx"
  );
  const layoutPath = path.join(
    process.cwd(),
    "components/calibration/SpaceLayout.tsx"
  );
  const teamPagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/team/[teamId]/page.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const sheetSource = await fs.readFile(sheetPath, "utf8").catch(() => "");
  const layoutSource = await fs.readFile(layoutPath, "utf8").catch(() => "");
  const teamPageSource = await fs.readFile(teamPagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/scores.ts exists");
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store/store") &&
      !helpersSource.includes("calibration-api"),
    "score helpers do not import engine/store/api"
  );
  assert(
    helpersSource.includes("SCORE_MIN") && helpersSource.includes("SCORE_MAX"),
    "score helpers use SCORE_MIN/SCORE_MAX"
  );

  assert(sheetSource.includes("ScoreSheet"), "ScoreSheet component exists");
  assert(
    sheetSource.includes('"use client"') || sheetSource.includes("'use client'"),
    "ScoreSheet is a client component"
  );
  assert(
    !sheetSource.includes("calibration-engine") &&
      !sheetSource.includes("calibration-store/store") &&
      !sheetSource.includes("calibration-api"),
    "ScoreSheet does not import engine/store/api modules"
  );
  assert(
    !sheetSource.toLowerCase().includes("liveblocks") &&
      !sheetSource.toLowerCase().includes("yjs") &&
      !sheetSource.toLowerCase().includes("collaborationplugin"),
    "ScoreSheet has no Liveblocks/Yjs"
  );
  assert(
    !/cursor/i.test(sheetSource) || sheetSource.includes("no collaborative"),
    "ScoreSheet has no collaborative cursors"
  );
  assert(
    sheetSource.includes("SCORE_MIN") ||
      sheetSource.includes("SCORE_MAX") ||
      sheetSource.includes("isValidScoreValue") ||
      /[1-5]/.test(sheetSource),
    "ScoreSheet uses the 1–5 integer scale"
  );
  assert(
    /submit/i.test(sheetSource),
    "ScoreSheet has a submit control"
  );
  assert(
    sheetSource.includes("flagged") ||
      sheetSource.includes("flaggedKeys") ||
      sheetSource.includes("data-flagged"),
    "ScoreSheet highlights flagged criteria"
  );
  assert(
    sheetSource.includes("submitted") ||
      sheetSource.includes("checkmark") ||
      sheetSource.includes("submittedUserIds") ||
      sheetSource.includes("submittedBy"),
    "ScoreSheet shows submission checkmarks"
  );

  assert(
    layoutSource.includes("ScoreSheet"),
    "ScoreSheet is composed into SpaceLayout"
  );
  assert(
    !layoutSource.includes("Private scoring and the revealed matrix will appear here."),
    "SpaceLayout Score sheet placeholder is gone"
  );
  assert(
    !layoutSource.includes("SharedDocEditor"),
    "SharedDocEditor remains a later slot"
  );
  assert(
    !layoutSource.toLowerCase().includes("liveblocks") &&
      !layoutSource.toLowerCase().includes("yjs"),
    "SpaceLayout still has no collaborative cursors"
  );

  assert(
    teamPageSource.includes("getTeamForMember"),
    "team page loads the rubric snapshot via getTeamForMember"
  );
  assert(
    teamPageSource.includes("rubricCriterionKeys"),
    "team page derives criterionKeys on the server"
  );
  assert(
    teamPageSource.includes("criterionKeys"),
    "team page passes criterionKeys into the space"
  );
  assert(
    !teamPageSource.includes("ScoreSheet"),
    "team page does not import ScoreSheet; SpaceLayout composes it"
  );
  assert(
    !teamPageSource.includes("from \"@/lib/calibration-api/scores\"") ||
      teamPageSource.includes("rubricCriterionKeys"),
    "rubricCriterionKeys is imported only on the server page"
  );

  if (failures > 0) {
    console.error(`\nscores.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("scores.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("scores.selftest crashed:", err);
  process.exit(1);
});
