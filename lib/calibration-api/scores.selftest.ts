/**
 * Self-test: scoring, agreement, and addendum endpoints (Task 4.4).
 * Uses JSON stores + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/calibration-api/scores.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { TeamPhase, TeamStateRecord } from "../calibration-store/types";
import { SCORE_MAX, SCORE_MIN } from "../calibration-store/types";

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

const offeringInput = {
  title: "Rubric Calibration Pilot",
  sampleAppId: "app_sample_bot",
  sampleRubric: "Criterion 1: clarity\nCriterion 2: evidence",
  deploymentBrief: "Deploy the tutor for week-3 lab.",
  transcriptExcerpt: "Student: ...\nTutor: ...",
  aiProvider: "openai",
  aiModel: "gpt-4o-mini",
};

const RUBRIC_SNAPSHOT = "clarity: one-line rationale\nevidence: one-line rationale";

function farDeadline(now: Date): string {
  return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
}

function persistableState(
  phase: TeamPhase,
  members: [string, string, string],
  now: Date
): TeamStateRecord {
  const stepKey =
    phase === "scoring" ? "scoring" : phase === "merge" ? "merge" : phase;
  const deadline = farDeadline(now);
  return {
    phase,
    round: 3,
    presenterIndex: 2,
    perPersonDeadlines:
      phase === "consensus"
        ? []
        : members.map((userId) => ({ userId, stepKey, deadlineAt: deadline })),
    groupDeadline: phase === "scoring" ? null : deadline,
    flaggedCriteria: [],
    absenceStepKeys: [],
    agreementSets: {
      merge_complete:
        phase === "scoring" || phase === "consensus" ? [...members] : [],
      final_consensus: [],
    },
    memberUserIds: members,
    respondedUserIds: [],
    critiqueStage: "critic_response",
  };
}

function numericScoreValues(payload: unknown): number[] {
  const values: number[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (typeof rec.criterionKey === "string" && typeof rec.value === "number") {
      values.push(rec.value);
    }
    for (const child of Object.values(rec)) walk(child);
  };
  walk(payload);
  return values;
}

function matrixValuesFor(
  matrix: { userId: string; scores: { criterionKey: string; value: number }[] }[],
  userId: string
): number[] {
  return (
    matrix
      .find((row) => row.userId === userId)
      ?.scores.map((score) => score.value) ?? []
  );
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;

  const tempDir = path.join(
    process.cwd(),
    ".data",
    "calibration-api-scores-selftest"
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.CALIBRATION_NOTICES_LOG = path.join(tempDir, "notices.log");

  const { createOffering } = await import("./offerings");
  const { getSpace, postDocSnapshot } = await import("./space");
  const { deleteAgreement, postAddendum, postAgreement, postScores } = await import("./scores");
  const { formTeam, saveDocSnapshot, saveTeamState } = await import(
    "../calibration-store/store"
  );

  try {
    const operatorId = "op_1";
    const memberA = "user_a";
    const memberB = "user_b";
    const memberC = "user_c";
    const stranger = "user_stranger";
    const now = new Date("2026-08-15T12:00:00.000Z");
    const members: [string, string, string] = [memberA, memberB, memberC];

    const created = await createOffering(operatorId, offeringInput);
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");

    const scoringTeam = await formTeam(offering!.id, members);
    await saveTeamState(
      scoringTeam.id,
      persistableState("scoring", members, now)
    );
    await saveDocSnapshot(scoringTeam.id, "rubric", RUBRIC_SNAPSHOT, memberA);

    const aScores = [
      { criterionKey: "clarity", value: 4 },
      { criterionKey: "evidence", value: 2 },
    ];
    const bScores = [
      { criterionKey: "clarity", value: SCORE_MAX },
      { criterionKey: "evidence", value: SCORE_MIN },
    ];
    const cScores = [
      { criterionKey: "clarity", value: 3 },
      { criterionKey: "evidence", value: 3 },
    ];

    assertEqual(
      (await postScores(null, scoringTeam.id, { scores: aScores }, { now }))
        .status,
      401,
      "unauthenticated POST scores → 401"
    );
    assertEqual(
      (
        await postScores(
          operatorId,
          scoringTeam.id,
          { scores: aScores },
          { now }
        )
      ).status,
      403,
      "operator POST scores → 403"
    );
    assertEqual(
      (
        await postScores(
          stranger,
          scoringTeam.id,
          { scores: aScores },
          { now }
        )
      ).status,
      403,
      "non-member POST scores → 403"
    );

    assertEqual(
      (
        await postScores(
          memberA,
          scoringTeam.id,
          {
            scores: [
              { criterionKey: "clarity", value: 0 },
              { criterionKey: "evidence", value: 3 },
            ],
          },
          { now }
        )
      ).status,
      400,
      "value 0 → 400"
    );
    assertEqual(
      (
        await postScores(
          memberA,
          scoringTeam.id,
          {
            scores: [
              { criterionKey: "clarity", value: 6 },
              { criterionKey: "evidence", value: 3 },
            ],
          },
          { now }
        )
      ).status,
      400,
      "value 6 → 400"
    );

    const submittedA = await postScores(
      memberA,
      scoringTeam.id,
      { scores: aScores },
      { now }
    );
    assertEqual(submittedA.status, 200, "member A POST scores → 200");
    assert(
      submittedA.ok === true && submittedA.body.submitted === true,
      "A submit acknowledges without returning values"
    );
    if (submittedA.ok) {
      const raw = JSON.stringify(submittedA.body);
      assert(
        !raw.includes('"value":4') && !raw.includes('"value":2'),
        "team ack payload contains none of A's numeric values (8.3)"
      );
    }

    const spaceBBefore = await getSpace(memberB, scoringTeam.id, { now });
    assertEqual(spaceBBefore.status, 200, "member B GET pre-reveal → 200");
    assert(spaceBBefore.ok === true, "member B GET pre-reveal ok");
    if (spaceBBefore.ok) {
      const leaked = numericScoreValues(spaceBBefore.body);
      assertEqual(
        leaked.filter((value) => value === 4 || value === 2),
        [],
        "B space payload contains zero of A's numeric values (8.2, 15.3)"
      );
      assertEqual(
        matrixValuesFor(spaceBBefore.body.matrix, memberA),
        [],
        "B matrix has no A row values before reveal"
      );
      assert(
        spaceBBefore.body.submittedBy.includes(memberA),
        "B sees that A has submitted (boolean / id only)"
      );
      assertEqual(
        spaceBBefore.body.revealedAt,
        null,
        "scores are still held before the last present submission"
      );
      const ack = spaceBBefore.body.messages.filter(
        (message) =>
          message.authorKind === "facilitator" &&
          /submitted their scores/i.test(message.body)
      );
      assert(ack.length > 0, "team receives a submission acknowledgment");
      assert(
        ack.every(
          (message) => !message.body.includes("4") && !message.body.includes("2")
        ),
        "acknowledgment does not include A's numeric values (8.3)"
      );
    }

    const submittedB = await postScores(
      memberB,
      scoringTeam.id,
      { scores: bScores },
      { now }
    );
    assertEqual(submittedB.status, 200, "member B POST scores → 200");

    const stillHeld = await getSpace(memberA, scoringTeam.id, { now });
    assert(
      stillHeld.ok === true && stillHeld.body.revealedAt === null,
      "two of three present submissions still hold scores"
    );
    if (stillHeld.ok) {
      assertEqual(
        matrixValuesFor(stillHeld.body.matrix, memberB),
        [],
        "A cannot see B's values before the last present submission"
      );
    }

    const submittedC = await postScores(
      memberC,
      scoringTeam.id,
      { scores: cScores },
      { now }
    );
    assertEqual(
      submittedC.status,
      200,
      "last present member POST scores → 200"
    );

    const spaceAAfter = await getSpace(memberA, scoringTeam.id, { now });
    const spaceBAfter = await getSpace(memberB, scoringTeam.id, { now });
    assert(spaceAAfter.ok === true && spaceBAfter.ok === true, "post-reveal GETs ok");
    if (spaceAAfter.ok && spaceBAfter.ok) {
      assert(
        spaceAAfter.body.revealedAt !== null &&
          spaceBAfter.body.revealedAt !== null,
        "reveal timestamp is set after the last present submission (8.4)"
      );
      assertEqual(
        matrixValuesFor(spaceAAfter.body.matrix, memberA).slice().sort(),
        [2, 4],
        "A sees own values in the revealed matrix"
      );
      assertEqual(
        matrixValuesFor(spaceAAfter.body.matrix, memberB).slice().sort(),
        [SCORE_MIN, SCORE_MAX],
        "A sees B's values after reveal (8.4)"
      );
      assertEqual(
        matrixValuesFor(spaceAAfter.body.matrix, memberC).slice().sort(),
        [3, 3],
        "A sees C's values after reveal (8.4)"
      );
      assertEqual(
        matrixValuesFor(spaceBAfter.body.matrix, memberA).slice().sort(),
        [2, 4],
        "B sees A's values after reveal (8.4)"
      );
      assertEqual(
        matrixValuesFor(spaceBAfter.body.matrix, memberB).slice().sort(),
        [SCORE_MIN, SCORE_MAX],
        "B sees own values in the revealed matrix"
      );
      assertEqual(
        matrixValuesFor(spaceBAfter.body.matrix, memberC).slice().sort(),
        [3, 3],
        "B sees C's values after reveal (8.4)"
      );
    }

    const addendumEarly = await postAddendum(
      memberA,
      scoringTeam.id,
      { body: "too early" },
      { now }
    );
    assertEqual(addendumEarly.status, 409, "addendum before lock → 409");

    const mergeTeam = await formTeam(offering!.id, [
      "user_merge_a",
      "user_merge_b",
      "user_merge_c",
    ]);
    await saveTeamState(
      mergeTeam.id,
      persistableState("merge", ["user_merge_a", "user_merge_b", "user_merge_c"], now)
    );

    assertEqual(
      (
        await postAgreement(
          operatorId,
          mergeTeam.id,
          { subject: "merge_complete" },
          { now }
        )
      ).status,
      403,
      "operator POST agreement → 403"
    );
    assertEqual(
      (
        await deleteAgreement(
          operatorId,
          mergeTeam.id,
          { subject: "merge_complete" },
          { now }
        )
      ).status,
      403,
      "operator DELETE agreement → 403"
    );
    assertEqual(
      (
        await postAgreement(
          memberA,
          mergeTeam.id,
          { subject: "merge_complete" },
          { now }
        )
      ).status,
      403,
      "non-member of merge team POST agreement → 403"
    );

    const mergeWrong = await postAgreement(
      "user_merge_a",
      mergeTeam.id,
      { subject: "final_consensus" },
      { now }
    );
    assertEqual(
      mergeWrong.status,
      409,
      "final_consensus in merge phase → 409"
    );

    const mergeOk = await postAgreement(
      "user_merge_a",
      mergeTeam.id,
      { subject: "merge_complete" },
      { now }
    );
    assertEqual(mergeOk.status, 200, "merge_complete in merge phase → 200");
    assert(
      mergeOk.ok === true && mergeOk.body.phase === "merge",
      "one merge_complete agreement stays in merge"
    );
    assert(
      mergeOk.ok === true &&
        mergeOk.body.readyUserIds.includes("user_merge_a"),
      "space lists the member who pressed Ready"
    );

    const withdrawn = await deleteAgreement(
      "user_merge_a",
      mergeTeam.id,
      { subject: "merge_complete" },
      { now }
    );
    assertEqual(withdrawn.status, 200, "withdraw Ready in merge → 200");
    assert(
      withdrawn.ok === true &&
        withdrawn.body.phase === "merge" &&
        !withdrawn.body.readyUserIds.includes("user_merge_a"),
      "withdrawn Ready is no longer listed"
    );

    const reReady = await postAgreement(
      "user_merge_a",
      mergeTeam.id,
      { subject: "merge_complete" },
      { now }
    );
    assert(
      reReady.ok === true && reReady.body.readyUserIds.includes("user_merge_a"),
      "Ready can be marked again after undo"
    );

    const sameSnap = await postDocSnapshot(
      "user_merge_a",
      mergeTeam.id,
      "rubric",
      { text: "clarity: keep" },
      { now }
    );
    assertEqual(sameSnap.status, 200, "first rubric snapshot → 200");
    const afterFirstSnap = await getSpace("user_merge_a", mergeTeam.id, { now });
    assert(
      afterFirstSnap.ok === true &&
        !afterFirstSnap.body.readyUserIds.includes("user_merge_a"),
      "a new rubric snapshot clears Ready marks"
    );

    await postAgreement(
      "user_merge_a",
      mergeTeam.id,
      { subject: "merge_complete" },
      { now }
    );
    const unchangedSnap = await postDocSnapshot(
      "user_merge_a",
      mergeTeam.id,
      "rubric",
      { text: "clarity: keep" },
      { now }
    );
    assertEqual(unchangedSnap.status, 200, "unchanged rubric snapshot → 200");
    const afterUnchanged = await getSpace("user_merge_a", mergeTeam.id, { now });
    assert(
      afterUnchanged.ok === true &&
        afterUnchanged.body.readyUserIds.includes("user_merge_a"),
      "an unchanged rubric snapshot leaves Ready marks"
    );

    const consensusTeam = await formTeam(offering!.id, [
      "user_cons_a",
      "user_cons_b",
      "user_cons_c",
    ]);
    await saveTeamState(
      consensusTeam.id,
      persistableState(
        "consensus",
        ["user_cons_a", "user_cons_b", "user_cons_c"],
        now
      )
    );

    const consensusWrong = await postAgreement(
      "user_cons_a",
      consensusTeam.id,
      { subject: "merge_complete" },
      { now }
    );
    assertEqual(
      consensusWrong.status,
      409,
      "merge_complete in consensus phase → 409"
    );

    const consensusOk = await postAgreement(
      "user_cons_a",
      consensusTeam.id,
      { subject: "final_consensus" },
      { now }
    );
    assertEqual(
      consensusOk.status,
      200,
      "final_consensus in consensus phase → 200"
    );
    assert(
      consensusOk.ok === true && consensusOk.body.phase === "consensus",
      "one final_consensus agreement stays in consensus"
    );
    const consensusWithdraw = await deleteAgreement(
      "user_cons_a",
      consensusTeam.id,
      { subject: "final_consensus" },
      { now }
    );
    assertEqual(consensusWithdraw.status, 200, "withdraw Ready in consensus → 200");
    assert(
      consensusWithdraw.ok === true &&
        !consensusWithdraw.body.readyUserIds.includes("user_cons_a"),
      "consensus Ready can be undone before lock"
    );

    const lockedTeam = await formTeam(offering!.id, [
      "user_lock_a",
      "user_lock_b",
      "user_lock_c",
    ]);
    await saveTeamState(
      lockedTeam.id,
      persistableState(
        "finalized",
        ["user_lock_a", "user_lock_b", "user_lock_c"],
        now
      )
    );

    assertEqual(
      (
        await postAddendum(
          operatorId,
          lockedTeam.id,
          { body: "operator note" },
          { now }
        )
      ).status,
      403,
      "operator POST addendum → 403"
    );

    const addendumOk = await postAddendum(
      "user_lock_a",
      lockedTeam.id,
      { body: "Personal note after lock" },
      { now }
    );
    assertEqual(addendumOk.status, 200, "addendum after lock → 200");
    assert(
      addendumOk.ok === true &&
        addendumOk.body.body === "Personal note after lock" &&
        addendumOk.body.userId === "user_lock_a",
      "addendum returns the personal note (10.6)"
    );
    const addendumEdit = await postAddendum(
      "user_lock_a",
      lockedTeam.id,
      { body: "Edited personal note" },
      { now }
    );
    assertEqual(addendumEdit.status, 200, "addendum edit after lock → 200");
    assert(
      addendumOk.ok === true &&
        addendumEdit.ok === true &&
        addendumEdit.body.id === addendumOk.body.id &&
        addendumEdit.body.body === "Edited personal note",
      "a second POST from the same member updates the same addendum"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api scores (POST scores/agreements/addenda, reveal-safe space)"
  );
}

void main();
