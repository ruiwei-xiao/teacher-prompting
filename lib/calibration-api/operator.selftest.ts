/**
 * Self-test: operator dashboard, team inspect, and manual match (Task 4.5).
 * Uses JSON stores + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/calibration-api/operator.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { TeamPhase, TeamStateRecord } from "../calibration-store/types";
import { OPERATOR_STUCK_LISTING_MS } from "../calibration-store/types";

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
  const deadline = farDeadline(now);
  return {
    phase,
    round: 3,
    presenterIndex: 2,
    perPersonDeadlines: members.map((userId) => ({
      userId,
      stepKey: "scoring",
      deadlineAt: deadline,
    })),
    groupDeadline: null,
    flaggedCriteria: [],
    absenceStepKeys: [],
    agreementSets: {
      merge_complete: [...members],
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

function queuedUserIds(
  rows: Array<{ userId: string }>
): string[] {
  return rows.map((row) => row.userId).sort();
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;

  const tempDir = path.join(
    process.cwd(),
    ".data",
    "calibration-api-operator-selftest"
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.CALIBRATION_NOTICES_LOG = path.join(tempDir, "notices.log");

  const { createOffering } = await import("./offerings");
  const { postCheckIn } = await import("./queue");
  const { getSpace } = await import("./space");
  const { postScores } = await import("./scores");
  const {
    getOperatorDashboard,
    inspectTeam,
    patchOperatorFacilitatorKey,
    postManualMatch,
  } = await import("./operator");
  const {
    checkIn,
    formTeam,
    getOffering,
    getTeam,
    getTeamForMember,
    hasNotice,
    listAbsences,
    listQueuedCheckIns,
    markDeliverableLocked,
    recordAbsence,
    saveDocSnapshot,
    saveTeamState,
  } = await import("../calibration-store/store");

  try {
    const operatorId = "op_1";
    const stranger = "user_stranger";
    const now = new Date("2026-08-15T12:00:00.000Z");
    const tenDaysAgo = new Date(now.getTime() - OPERATOR_STUCK_LISTING_MS);
    const nineDaysAgo = new Date(now.getTime() - OPERATOR_STUCK_LISTING_MS + 60_000);

    const created = await createOffering(operatorId, offeringInput);
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");

    const otherOffering = await createOffering(operatorId, {
      ...offeringInput,
      title: "Other offering",
    });
    assert(otherOffering.ok === true, "create second offering ok");
    const offeringB =
      otherOffering.ok && "offering" in otherOffering.body
        ? otherOffering.body.offering
        : null;
    assert(offeringB !== null, "second offering exists");

    const quorumOffering = await createOffering(operatorId, {
      ...offeringInput,
      title: "Quorum comparison offering",
    });
    assert(quorumOffering.ok === true, "create quorum offering ok");
    const offeringC =
      quorumOffering.ok && "offering" in quorumOffering.body
        ? quorumOffering.body.offering
        : null;
    assert(offeringC !== null, "quorum offering exists");

    // --- non-operator / unauthenticated dashboard ---
    assertEqual(
      (await getOperatorDashboard(null, offering!.id, { now })).status,
      401,
      "unauthenticated GET operate → 401"
    );
    assertEqual(
      (await getOperatorDashboard(stranger, offering!.id, { now })).status,
      403,
      "non-operator GET operate → 403"
    );

    const stuckA = "user_stuck_a";
    const recentB = "user_recent_b";
    await postCheckIn(stuckA, offering!.id, { now: tenDaysAgo });
    await postCheckIn(recentB, offering!.id, { now: nineDaysAgo });

    const learnerDash = await getOperatorDashboard(stuckA, offering!.id, { now });
    assertEqual(learnerDash.status, 403, "queued learner GET operate → 403");

    // --- every queued learner appears; only 10-day waiters are marked stuck ---
    const dash = await getOperatorDashboard(operatorId, offering!.id, { now });
    assertEqual(dash.status, 200, "operator GET operate → 200");
    assert(dash.ok === true, "operator dashboard ok");
    if (dash.ok) {
      assert(
        dash.body.queueCount >= dash.body.stuckWaiters.length,
        "dashboard queue count includes every waiting learner"
      );
      assert(
        dash.body.labels !== undefined && typeof dash.body.labels === "object",
        "dashboard includes person labels"
      );
      const waiterIds = dash.body.waiters.map((row) => row.userId);
      const stuckIds = dash.body.stuckWaiters.map((row) => row.userId);
      assert(
        waiterIds.includes(stuckA) && waiterIds.includes(recentB),
        "dashboard waiters lists every queued learner"
      );
      assert(
        stuckIds.includes(stuckA),
        "10-day waiter appears on dashboard (2.5, 14.1)"
      );
      assert(
        !stuckIds.includes(recentB),
        "waiter under 10 days is not listed as stuck"
      );
      const recentRow = dash.body.waiters.find((row) => row.userId === recentB);
      assert(recentRow !== undefined, "recent waiter row exists");
      if (recentRow) {
        assertEqual(recentRow.stuck, false, "waiter under 10 days is not stuck");
      }
      const stuckRow = dash.body.stuckWaiters.find((row) => row.userId === stuckA);
      assert(stuckRow !== undefined, "stuck waiter row exists");
      if (stuckRow) {
        assertEqual(
          stuckRow.offeringId,
          offering!.id,
          "stuck waiter includes offering identity (14.1)"
        );
        assertEqual(stuckRow.stuck, true, "10-day waiter is marked stuck");
        assert(
          stuckRow.waitedMs >= OPERATOR_STUCK_LISTING_MS,
          "stuck waiter includes wait duration of at least 10 days (14.1)"
        );
      }
      assertEqual(
        dash.body.setup.title,
        offeringInput.title,
        "dashboard includes the activity title"
      );
      assertEqual(
        dash.body.setup.sampleRubric,
        offeringInput.sampleRubric,
        "dashboard includes the sample rubric"
      );
      assertEqual(
        dash.body.setup.facilitatorKeySource,
        "bot",
        "dashboard reports the sample-bot key source"
      );
      assert(
        !JSON.stringify(dash.body).includes("sk-"),
        "dashboard JSON does not leak an API key"
      );
    }

    const customKey = await patchOperatorFacilitatorKey(operatorId, offering!.id, {
      facilitatorKeySource: "custom",
      facilitatorApiKey: "  sk-progress  ",
    });
    assertEqual(customKey.status, 200, "operator PATCH facilitator key → 200");
    assert(customKey.ok === true, "operator PATCH facilitator key ok");
    if (customKey.ok) {
      assertEqual(
        customKey.body.setup.facilitatorKeySource,
        "custom",
        "PATCH custom key updates the source flag"
      );
      assert(
        !JSON.stringify(customKey.body).includes("sk-progress"),
        "PATCH response does not include the new API key"
      );
    }
    assertEqual(
      (await getOffering(offering!.id))?.facilitatorApiKey,
      "sk-progress",
      "custom key is stored on the offering"
    );
    const backToBot = await patchOperatorFacilitatorKey(operatorId, offering!.id, {
      facilitatorKeySource: "bot",
    });
    assert(
      backToBot.ok === true && backToBot.body.setup.facilitatorKeySource === "bot",
      "PATCH bot source clears the override"
    );
    assertEqual(
      (await getOffering(offering!.id))?.facilitatorApiKey,
      undefined,
      "bot source removes the stored override"
    );
    assertEqual(
      (await patchOperatorFacilitatorKey(stuckA, offering!.id, {
        facilitatorKeySource: "bot",
      })).status,
      403,
      "queued learner PATCH operate → 403"
    );
    assertEqual(
      (
        await patchOperatorFacilitatorKey(operatorId, offering!.id, {
          facilitatorKeySource: "custom",
        })
      ).status,
      400,
      "custom source without a key → 400"
    );

    // Viewing the dashboard must not enqueue the operator or mutate the queue.
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).filter((row) => row.userId === operatorId)
        .length,
      0,
      "operator dashboard view does not enqueue the operator (15.4)"
    );

    // --- list teams with phase / members / last activity / autoFinalized ---
    const formedMembers: [string, string, string] = [
      "user_team_a",
      "user_team_b",
      "user_team_c",
    ];
    const listedTeam = await formTeam(offering!.id, formedMembers);
    await markDeliverableLocked(listedTeam.id, true);
    const persistedListed = await getTeam(listedTeam.id);
    assert(persistedListed !== null, "listed team exists");

    const dashWithTeam = await getOperatorDashboard(operatorId, offering!.id, {
      now,
    });
    assertEqual(dashWithTeam.status, 200, "dashboard with a team → 200");
    assert(dashWithTeam.ok === true, "dashboard with a team ok");
    if (dashWithTeam.ok) {
      const row = dashWithTeam.body.teams.find(
        (team) => team.teamId === listedTeam.id
      );
      assert(row !== undefined, "dashboard lists every formed team (14.4)");
      if (row) {
        assertEqual(
          row.phase,
          persistedListed!.phase,
          "team row includes current phase (14.4)"
        );
        assertEqual(
          [...row.members].sort(),
          [...formedMembers].sort(),
          "team row includes members (14.4)"
        );
        assertEqual(
          row.lastActivityAt,
          persistedListed!.lastActivityAt,
          "team row includes last activity (14.4)"
        );
        assertEqual(
          row.autoFinalized,
          true,
          "team row includes auto-finalized flag (14.4)"
        );
      }
    }

    // --- invalid trio → 400, queue unchanged ---
    const matchD = "user_match_d";
    const matchE = "user_match_e";
    const matchF = "user_match_f";
    const crossG = "user_cross_g";
    // Bypass check-in evaluation so three waiters can sit queued for manual match.
    await checkIn(offering!.id, matchD, now);
    await checkIn(offering!.id, matchE, now);
    await checkIn(offering!.id, matchF, now);
    await postCheckIn(crossG, offeringB!.id, { now });

    const queuedBeforeInvalid = queuedUserIds(
      await listQueuedCheckIns(offering!.id)
    );
    assert(
      queuedBeforeInvalid.includes(matchD) &&
        queuedBeforeInvalid.includes(matchE) &&
        queuedBeforeInvalid.includes(matchF),
      "precondition: three distinct waiters are queued on the offering"
    );

    const twoUsers = await postManualMatch(
      operatorId,
      offering!.id,
      { userIds: [matchD, matchE] },
      { now }
    );
    assertEqual(twoUsers.status, 400, "manual match with 2 users → 400 (14.3)");
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offering!.id)),
      queuedBeforeInvalid,
      "2-user match leaves the queue unchanged (14.3)"
    );

    const duplicates = await postManualMatch(
      operatorId,
      offering!.id,
      { userIds: [matchD, matchE, matchD] },
      { now }
    );
    assertEqual(duplicates.status, 400, "manual match with duplicates → 400 (14.3)");
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offering!.id)),
      queuedBeforeInvalid,
      "duplicate match leaves the queue unchanged (14.3)"
    );

    const crossOffering = await postManualMatch(
      operatorId,
      offering!.id,
      { userIds: [matchD, matchE, crossG] },
      { now }
    );
    assertEqual(
      crossOffering.status,
      400,
      "manual match with cross-offering user → 400 (14.3)"
    );
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offering!.id)),
      queuedBeforeInvalid,
      "cross-offering match leaves the queue unchanged (14.3)"
    );
    assertEqual(
      (await listQueuedCheckIns(offeringB!.id)).map((row) => row.userId),
      [crossG],
      "cross-offering waiter stays queued on their own offering"
    );

    assertEqual(
      (
        await postManualMatch(stranger, offering!.id, {
          userIds: [matchD, matchE, matchF],
        }, { now })
      ).status,
      403,
      "non-operator POST match → 403"
    );
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offering!.id)),
      queuedBeforeInvalid,
      "non-operator match attempt leaves the queue unchanged"
    );

    // --- valid trio → team formed, notices, same as quorum path ---
    const quorumA = "user_quorum_a";
    const quorumB = "user_quorum_b";
    const quorumC = "user_quorum_c";
    await postCheckIn(quorumA, offeringC!.id, { now });
    await postCheckIn(quorumB, offeringC!.id, { now });
    const quorumThird = await postCheckIn(quorumC, offeringC!.id, { now });
    assert(quorumThird.ok === true, "quorum third check-in ok");
    const quorumTeamId = quorumThird.ok ? quorumThird.body.teamId : null;
    assert(
      typeof quorumTeamId === "string" && quorumTeamId.length > 0,
      "quorum path forms a team"
    );
    const quorumView = await getTeamForMember(quorumTeamId!, quorumA);
    const quorumMembers = quorumView?.team.state.memberUserIds ?? [];
    assertEqual(quorumMembers.length, 3, "quorum team has three members");
    const quorumHasRecap = (quorumView?.messages ?? []).some(
      (message) =>
        message.authorKind === "facilitator" &&
        /calibrate a shared rubric/i.test(message.body)
    );
    assert(quorumHasRecap, "quorum path posts a recap");
    for (const userId of quorumMembers) {
      assert(
        await hasNotice(`${quorumMembers.join(",")}:${userId}:team_formed`),
        `quorum team_formed notice recorded for ${userId}`
      );
    }

    const matched = await postManualMatch(
      operatorId,
      offering!.id,
      { userIds: [matchF, matchD, matchE] },
      { now }
    );
    assertEqual(matched.status, 200, "valid trio manual match → 200 (2.6, 14.2)");
    assert(matched.ok === true, "valid trio manual match ok");
    const manualTeamId = matched.ok ? matched.body.team.id : null;
    assert(
      typeof manualTeamId === "string" && manualTeamId.length > 0,
      "valid trio forms a team"
    );
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offering!.id)).includes(matchD),
      false,
      "matched trio is taken out of the queue"
    );
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offering!.id)).filter((id) =>
        [matchD, matchE, matchF].includes(id)
      ),
      [],
      "all three matched learners leave the queue"
    );

    const manualView = await getTeamForMember(manualTeamId!, matchD);
    assert(manualView !== null, "manual-match team space is readable");
    const manualMembers = manualView?.team.state.memberUserIds ?? [];
    assertEqual(manualMembers.length, 3, "manual-match team has three members");
    assertEqual(
      [...manualMembers].sort(),
      [matchD, matchE, matchF].sort(),
      "manual-match members are the selected trio"
    );
    assertEqual(
      manualView?.team.state.phase,
      "critique",
      "manual-match opens critique like quorum (2.6)"
    );
    assert(
      (manualView?.messages ?? []).some(
        (message) =>
          message.authorKind === "facilitator" &&
          /calibrate a shared rubric/i.test(message.body)
      ),
      "manual match posts the same recap as quorum (2.6)"
    );
    for (const userId of manualMembers) {
      assert(
        await hasNotice(`${manualMembers.join(",")}:${userId}:team_formed`),
        `manual-match team_formed notice recorded for ${userId} (14.2)`
      );
    }

    const dashAfterMatch = await getOperatorDashboard(operatorId, offering!.id, {
      now,
    });
    assert(
      dashAfterMatch.ok === true &&
        dashAfterMatch.body.teams.some((team) => team.teamId === manualTeamId),
      "manually matched team appears on the dashboard"
    );

    // --- operator inspect sees held scores; subsequent member GET does not ---
    const scoreA = "user_score_a";
    const scoreB = "user_score_b";
    const scoreC = "user_score_c";
    const scoreMembers: [string, string, string] = [scoreA, scoreB, scoreC];
    const scoreTeam = await formTeam(offering!.id, scoreMembers);
    await saveTeamState(scoreTeam.id, persistableState("scoring", scoreMembers, now));
    await saveDocSnapshot(scoreTeam.id, "rubric", RUBRIC_SNAPSHOT, scoreA);
    await saveDocSnapshot(scoreTeam.id, "notes", "shared notes snapshot", scoreB);
    await recordAbsence(scoreTeam.id, scoreC, "critique:1");

    const aScores = [
      { criterionKey: "clarity", value: 4 },
      { criterionKey: "evidence", value: 2 },
    ];
    const submittedA = await postScores(
      scoreA,
      scoreTeam.id,
      { scores: aScores },
      { now }
    );
    assertEqual(submittedA.status, 200, "member A POST scores → 200");

    assertEqual(
      (await inspectTeam(null, scoreTeam.id, { now })).status,
      401,
      "unauthenticated inspect → 401"
    );
    assertEqual(
      (await inspectTeam(scoreA, scoreTeam.id, { now })).status,
      403,
      "member inspect → 403 (operator-only)"
    );
    assertEqual(
      (await inspectTeam(stranger, scoreTeam.id, { now })).status,
      403,
      "non-operator inspect → 403"
    );

    const inspect = await inspectTeam(operatorId, scoreTeam.id, { now });
    assertEqual(inspect.status, 200, "operator inspect → 200");
    assert(inspect.ok === true, "operator inspect ok");
    if (inspect.ok) {
      assertEqual(inspect.body.role, "operator", "inspect role is operator");
      assert(
        inspect.body.space.messages.length > 0 ||
          inspect.body.space.phase === "scoring",
        "inspect includes space/chat contents (14.5)"
      );
      assert(
        inspect.body.docs.some(
          (doc) => doc.docKind === "rubric" && doc.snapshotText === RUBRIC_SNAPSHOT
        ),
        "inspect includes shared rubric snapshot (14.5)"
      );
      assert(
        inspect.body.docs.some(
          (doc) =>
            doc.docKind === "notes" && doc.snapshotText === "shared notes snapshot"
        ),
        "inspect includes shared notes snapshot (14.5)"
      );
      assertEqual(
        matrixValuesFor(inspect.body.space.matrix, scoreA).slice().sort(),
        [2, 4],
        "operator space matrix includes held A values (14.5)"
      );
      assertEqual(
        matrixValuesFor(inspect.body.scores.members, scoreA).slice().sort(),
        [2, 4],
        "operator getScoresForOperator includes held A values (14.5)"
      );
      assert(
        inspect.body.absences.some(
          (row) => row.userId === scoreC && row.stepKey === "critique:1"
        ),
        "inspect includes absence marks (14.5)"
      );
      assert(
        inspect.body.finalDeliverable !== undefined,
        "inspect includes the final deliverable slot (14.5)"
      );
      assertEqual(
        inspect.body.space.revealedAt,
        null,
        "operator inspect does not flip scores_revealed_at (14.7)"
      );
    }

    const teamAfterInspect = await getTeam(scoreTeam.id);
    assertEqual(
      teamAfterInspect?.scoresRevealedAt,
      null,
      "persisted reveal stamp stays null after operator inspect (14.7)"
    );
    const absencesAfterInspect = await listAbsences(scoreTeam.id);
    assertEqual(
      absencesAfterInspect.map((row) => ({ userId: row.userId, stepKey: row.stepKey })),
      [{ userId: scoreC, stepKey: "critique:1" }],
      "operator inspect does not mutate absences (14.6)"
    );

    const memberAfterInspect = await getSpace(scoreB, scoreTeam.id, { now });
    assertEqual(memberAfterInspect.status, 200, "member GET after inspect → 200");
    assert(memberAfterInspect.ok === true, "member GET after inspect ok");
    if (memberAfterInspect.ok) {
      assertEqual(
        memberAfterInspect.body.revealedAt,
        null,
        "member GET after inspect still holds scores (14.7)"
      );
      const leaked = numericScoreValues(memberAfterInspect.body);
      assertEqual(
        leaked.filter((value) => value === 4 || value === 2),
        [],
        "member GET after inspect contains zero of A's numeric values (14.7)"
      );
      assertEqual(
        matrixValuesFor(memberAfterInspect.body.matrix, scoreA),
        [],
        "member matrix has no A row values after operator inspect (14.7)"
      );
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api operator (dashboard, inspect, manual match, score privacy)"
  );
}

void main();
