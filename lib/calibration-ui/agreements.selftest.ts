/**
 * Self-test: Ready / agreement helpers for merge and consensus.
 * Run: npx tsx lib/calibration-ui/agreements.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import { phaseBannerLabel } from "./space";
import {
  agreementPostBody,
  agreementsApiHref,
  canMarkReady,
  canWithdrawReady,
  hasMarkedReady,
  isReadyPhase,
  readyButtonLabel,
  readyHint,
  readySubjectForPhase,
  undoReadyLabel,
} from "./agreements";

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
  assertEqual(
    agreementsApiHref("team_9"),
    "/api/calibration/teams/team_9/agreements",
    "Ready posts to /api/calibration/teams/{teamId}/agreements"
  );
  assertEqual(
    agreementPostBody("merge_complete"),
    { subject: "merge_complete" },
    "merge Ready sends merge_complete"
  );
  assertEqual(
    agreementPostBody("final_consensus"),
    { subject: "final_consensus" },
    "consensus Ready sends final_consensus"
  );

  assertEqual(readySubjectForPhase("merge"), "merge_complete", "merge maps to merge_complete");
  assertEqual(
    readySubjectForPhase("consensus"),
    "final_consensus",
    "consensus maps to final_consensus"
  );
  assertEqual(readySubjectForPhase("critique"), null, "critique has no Ready subject");
  assertEqual(readySubjectForPhase("scoring"), null, "scoring has no Ready subject");
  assertEqual(readySubjectForPhase("discussion"), null, "discussion has no Ready subject");
  assert(isReadyPhase("merge") && isReadyPhase("consensus"), "Ready phases are merge and consensus");
  assert(
    !isReadyPhase("critique") && !isReadyPhase("scoring") && !isReadyPhase("finalized"),
    "Ready is hidden outside merge and consensus"
  );

  const mergeSpace = {
    role: "member" as const,
    phase: "merge",
    locked: false,
    readyUserIds: ["u-alice"],
  };
  assert(hasMarkedReady(mergeSpace, "u-alice"), "alice is marked Ready");
  assert(!hasMarkedReady(mergeSpace, "u-bob"), "bob is not marked Ready");
  assert(canMarkReady(mergeSpace, "u-bob"), "bob can still press Ready");
  assert(!canMarkReady(mergeSpace, "u-alice"), "alice cannot press Ready twice");
  assert(canWithdrawReady(mergeSpace, "u-alice"), "alice can undo Ready while merge is open");
  assert(!canWithdrawReady(mergeSpace, "u-bob"), "bob cannot undo a Ready they did not mark");
  assert(
    !canWithdrawReady({ ...mergeSpace, phase: "scoring" }, "u-alice"),
    "Ready cannot be undone after scoring starts"
  );
  assert(
    !canMarkReady({ ...mergeSpace, role: "operator" }, "u-bob"),
    "operator cannot press Ready"
  );
  assert(
    !canMarkReady({ ...mergeSpace, locked: true }, "u-bob"),
    "locked space cannot press Ready"
  );
  assert(
    !canMarkReady({ ...mergeSpace, phase: "scoring" }, "u-bob"),
    "scoring has no Ready button"
  );

  assertEqual(readyButtonLabel(false, false), "Ready", "idle label is Ready");
  assertEqual(readyButtonLabel(true, false), "You marked Ready", "already-ready label");
  assertEqual(readyButtonLabel(false, true), "Saving…", "busy label");
  assertEqual(undoReadyLabel(false), "Undo Ready", "undo label");

  const mergeHint = readyHint("merge", "member");
  assert(/Ready/.test(mergeHint), "merge hint tells the learner to press Ready");
  assert(/undo Ready/i.test(mergeHint), "merge hint says Ready can be undone");
  assert(/clears Ready/i.test(mergeHint), "merge hint says editing clears Ready");
  assert(
    !/waiting for all three/i.test(mergeHint),
    "merge hint does not require all three to be online"
  );
  const consensusHint = readyHint("consensus", "member");
  assert(/Ready/.test(consensusHint), "consensus hint tells the learner to press Ready");
  assert(/lock/i.test(consensusHint), "consensus hint says the rubric will lock");
  assert(/read-only/i.test(readyHint("merge", "operator")), "operator hint is read-only");

  assertEqual(
    phaseBannerLabel({ phase: "merge", round: 3 }),
    "Shared rubric",
    "merge banner is Shared rubric, not Merge"
  );
  assertEqual(
    phaseBannerLabel({ phase: "consensus", round: 0 }),
    "Confirm final rubric",
    "consensus banner is Confirm final rubric"
  );
  assertEqual(
    phaseBannerLabel({ phase: "critique", round: 2 }),
    "Critique · Round 2",
    "critique banner still includes the round"
  );
  assertEqual(
    phaseBannerLabel({ phase: "scoring", round: 0 }),
    "Private scoring",
    "scoring banner is Private scoring"
  );

  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/agreements.ts");
  const barPath = path.join(
    process.cwd(),
    "components/calibration/ReadyBar.tsx"
  );
  const layoutPath = path.join(
    process.cwd(),
    "components/calibration/SpaceLayout.tsx"
  );
  const helpersSource = await fs.readFile(helpersPath, "utf8");
  const barSource = await fs.readFile(barPath, "utf8").catch(() => "");
  const layoutSource = await fs.readFile(layoutPath, "utf8");

  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store") &&
      !helpersSource.includes("calibration-api"),
    "agreement helpers do not import engine/store/api"
  );
  assert(barSource.includes("ReadyBar"), "ReadyBar component exists");
  assert(
    barSource.includes("agreementsApiHref") || barSource.includes("/agreements"),
    "ReadyBar posts to the agreements endpoint"
  );
  assert(
    barSource.includes("DELETE") &&
      (barSource.includes("Undo Ready") || barSource.includes("undoReadyLabel")),
    "ReadyBar can withdraw Ready before the phase advances"
  );
  assert(
    !barSource.toLowerCase().includes("liveblocks") &&
      !barSource.toLowerCase().includes("yjs") &&
      !barSource.toLowerCase().includes("cursor"),
    "ReadyBar has no Liveblocks/Yjs/cursors"
  );
  assert(
    layoutSource.includes("ReadyBar"),
    "SpaceLayout composes ReadyBar on the docs pane"
  );
  assert(
    !/waiting for all three/i.test(barSource + helpersSource),
    "Ready copy does not require all three to be present together"
  );

  if (failures > 0) {
    console.error(`\nagreements.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("agreements.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("agreements.selftest crashed:", err);
  process.exit(1);
});
