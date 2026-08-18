/**
 * Cross-component integration selftest (Task 8.1).
 * Composes real handlers on the JSON fallback store.
 *
 * Run: npx tsx lib/calibration-api/integration.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { TeamPhase, TeamStateRecord } from "../calibration-store/types";
import { CRITIQUE_DEADLINE_MS, QUEUE_PING_MS } from "../calibration-store/types";

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
const CRON_SECRET = "integration-selftest-secret";

function cronHeaders(secret?: string): Headers {
  const headers = new Headers();
  if (secret !== undefined) {
    headers.set("authorization", `Bearer ${secret}`);
  }
  return headers;
}

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

function queuedUserIds(rows: Array<{ userId: string }>): string[] {
  return rows.map((row) => row.userId).sort();
}

function membershipIds(
  rows: Array<{ userId: string }>
): string[] {
  return rows.map((row) => row.userId).sort();
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;
  const previousCronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = CRON_SECRET;

  const tempDir = path.join(
    process.cwd(),
    ".data",
    "calibration-api-integration-selftest"
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");
  process.env.CALIBRATION_NOTICES_LOG = path.join(tempDir, "notices.log");

  const { createOffering, getOfferingGate } = await import("./offerings");
  const { postCheckIn } = await import("./queue");
  const { getSpace, postMessage, postDocSnapshot } = await import("./space");
  const { postScores, postAgreement, postAddendum } = await import("./scores");
  const { getOperatorDashboard, inspectTeam, postManualMatch } = await import(
    "./operator"
  );
  const { postTick } = await import("./tick");
  const {
    checkIn,
    formTeam,
    getTeam,
    listAbsences,
    listQueuedCheckIns,
    saveDocSnapshot,
    saveTeamState,
  } = await import("../calibration-store/store");
  const { createWorkspace, listMembers, listWorkspacesForUser } = await import(
    "../workspace-store/store"
  );

  try {
    const operatorId = "op_1";
    const learnerA = "user_a";
    const learnerB = "user_b";
    const learnerC = "user_c";
    const stranger = "user_stranger";
    const now = new Date("2026-08-15T12:00:00.000Z");

    const created = await createOffering(operatorId, offeringInput);
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");

    const workspace = await createWorkspace({
      name: "Educator course workspace",
      ownerUserId: operatorId,
    });
    const workspaceMembersBefore = membershipIds(await listMembers(workspace.id));
    const learnerWorkspacesBefore = {
      a: await listWorkspacesForUser(learnerA),
      b: await listWorkspacesForUser(learnerB),
      c: await listWorkspacesForUser(learnerC),
    };
    assertEqual(
      learnerWorkspacesBefore.a,
      [],
      "precondition: learner A has no Workspace membership"
    );
    assertEqual(
      learnerWorkspacesBefore.b,
      [],
      "precondition: learner B has no Workspace membership"
    );
    assertEqual(
      learnerWorkspacesBefore.c,
      [],
      "precondition: learner C has no Workspace membership"
    );

    const gateBefore = await getOfferingGate(learnerA, offering!.id);
    assertEqual(gateBefore.status, 200, "learner gate before check-in → 200");
    assert(
      gateBefore.ok === true && gateBefore.body.me.checkedIn === false,
      "gate before check-in is not checked in"
    );

    await postCheckIn(learnerA, offering!.id, { now });
    await postCheckIn(learnerB, offering!.id, { now });
    const third = await postCheckIn(learnerC, offering!.id, { now });
    assert(third.ok === true, "third check-in ok");
    const teamId = third.ok ? third.body.teamId : null;
    assert(
      typeof teamId === "string" && teamId.length > 0,
      "third check-in forms a team"
    );

    const gateAfter = await getOfferingGate(learnerA, offering!.id);
    assert(
      gateAfter.ok === true && gateAfter.body.me.teamId === teamId,
      "gate after quorum reports the formed team"
    );

    // --- 15.5: joining a team does not add Workspace members ---
    assertEqual(
      await listWorkspacesForUser(learnerA),
      learnerWorkspacesBefore.a,
      "learner A Workspace list unchanged after team formation (15.5)"
    );
    assertEqual(
      await listWorkspacesForUser(learnerB),
      learnerWorkspacesBefore.b,
      "learner B Workspace list unchanged after team formation (15.5)"
    );
    assertEqual(
      await listWorkspacesForUser(learnerC),
      learnerWorkspacesBefore.c,
      "learner C Workspace list unchanged after team formation (15.5)"
    );
    assertEqual(
      membershipIds(await listMembers(workspace.id)),
      workspaceMembersBefore,
      "existing Workspace membership list is unchanged after team formation (15.5)"
    );
    assertEqual(
      (await listWorkspacesForUser(learnerA)).length,
      0,
      "learner A is still not a Workspace member (15.5)"
    );

    // --- 15.1: non-member GET space / POST message → 403 ---
    assertEqual(
      (await getSpace(stranger, teamId!, { now })).status,
      403,
      "non-member GET space → 403 (15.1)"
    );
    assertEqual(
      (await postMessage(stranger, teamId!, { body: "hello" }, { now })).status,
      403,
      "non-member POST message → 403 (15.1)"
    );

    // --- 14.6: operator write attempts → 403 ---
    assertEqual(
      (
        await postMessage(
          operatorId,
          teamId!,
          { body: "operator should not post" },
          { now }
        )
      ).status,
      403,
      "operator POST message → 403 (14.6)"
    );
    assertEqual(
      (
        await postScores(
          operatorId,
          teamId!,
          {
            scores: [
              { criterionKey: "clarity", value: 3 },
              { criterionKey: "evidence", value: 3 },
            ],
          },
          { now }
        )
      ).status,
      403,
      "operator POST scores → 403 (14.6)"
    );
    assertEqual(
      (
        await postDocSnapshot(
          operatorId,
          teamId!,
          "rubric",
          { text: "operator draft" },
          { now }
        )
      ).status,
      403,
      "operator POST docs → 403 (14.6)"
    );
    assertEqual(
      (
        await postAgreement(
          operatorId,
          teamId!,
          { subject: "merge_complete" },
          { now }
        )
      ).status,
      403,
      "operator POST agreement → 403 (14.6)"
    );
    assertEqual(
      (
        await postAddendum(
          operatorId,
          teamId!,
          { body: "operator addendum" },
          { now }
        )
      ).status,
      403,
      "operator POST addendum → 403 (14.6)"
    );

    const dash = await getOperatorDashboard(operatorId, offering!.id, { now });
    assertEqual(dash.status, 200, "operator dashboard → 200");
    assert(
      dash.ok === true &&
        dash.body.teams.some((team) => team.teamId === teamId),
      "dashboard lists the formed team"
    );

    // --- 8.2 / 14.7 / 15.3: pre-reveal member vs operator inspect ---
    const scoreA = "user_score_a";
    const scoreB = "user_score_b";
    const scoreC = "user_score_c";
    const scoreMembers: [string, string, string] = [scoreA, scoreB, scoreC];
    const scoreTeam = await formTeam(offering!.id, scoreMembers);
    await saveTeamState(
      scoreTeam.id,
      persistableState("scoring", scoreMembers, now)
    );
    await saveDocSnapshot(scoreTeam.id, "rubric", RUBRIC_SNAPSHOT, scoreA);

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

    const spaceB = await getSpace(scoreB, scoreTeam.id, { now });
    assertEqual(spaceB.status, 200, "member B GET space pre-reveal → 200");
    assert(spaceB.ok === true, "member B GET space pre-reveal ok");
    if (spaceB.ok) {
      const leaked = numericScoreValues(spaceB.body);
      assertEqual(
        leaked.filter((value) => value === 4 || value === 2),
        [],
        "member B space payload contains zero of A's numeric values (8.2, 15.3)"
      );
      assertEqual(
        matrixValuesFor(spaceB.body.matrix, scoreA),
        [],
        "member B matrix has no A row values pre-reveal (8.2, 15.3)"
      );
      assertEqual(
        spaceB.body.revealedAt,
        null,
        "member B payload is still unrevealed"
      );
    }

    const inspect = await inspectTeam(operatorId, scoreTeam.id, { now });
    assertEqual(inspect.status, 200, "operator inspect → 200");
    assert(inspect.ok === true, "operator inspect ok");
    if (inspect.ok) {
      assertEqual(
        matrixValuesFor(inspect.body.space.matrix, scoreA).slice().sort(),
        [2, 4],
        "operator inspect space matrix contains held A values (14.5, 14.7)"
      );
      assertEqual(
        matrixValuesFor(inspect.body.scores.members, scoreA).slice().sort(),
        [2, 4],
        "operator inspect scores payload contains held A values (14.7)"
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
      "persisted reveal stamp stays null after inspect (14.7)"
    );

    const spaceBAfterInspect = await getSpace(scoreB, scoreTeam.id, { now });
    assertEqual(
      spaceBAfterInspect.status,
      200,
      "member B GET after inspect → 200"
    );
    assert(spaceBAfterInspect.ok === true, "member B GET after inspect ok");
    if (spaceBAfterInspect.ok) {
      assertEqual(
        spaceBAfterInspect.body.revealedAt,
        null,
        "inspect does not reveal scores to members (14.7)"
      );
      const leakedAfter = numericScoreValues(spaceBAfterInspect.body);
      assertEqual(
        leakedAfter.filter((value) => value === 4 || value === 2),
        [],
        "member B still sees zero of A's numeric values after inspect (14.7, 15.3)"
      );
    }

    // --- 14.3: manual match validation + valid trio ---
    const matchOffering = await createOffering(operatorId, {
      ...offeringInput,
      title: "Manual match offering",
    });
    const offeringMatch =
      matchOffering.ok && "offering" in matchOffering.body
        ? matchOffering.body.offering
        : null;
    assert(offeringMatch !== null, "manual-match offering exists");

    const otherOffering = await createOffering(operatorId, {
      ...offeringInput,
      title: "Cross-offering",
    });
    const offeringCross =
      otherOffering.ok && "offering" in otherOffering.body
        ? otherOffering.body.offering
        : null;
    assert(offeringCross !== null, "cross offering exists");

    const matchD = "user_match_d";
    const matchE = "user_match_e";
    const matchF = "user_match_f";
    const crossG = "user_cross_g";
    await checkIn(offeringMatch!.id, matchD, now);
    await checkIn(offeringMatch!.id, matchE, now);
    await checkIn(offeringMatch!.id, matchF, now);
    await postCheckIn(crossG, offeringCross!.id, { now });

    const queuedBeforeInvalid = queuedUserIds(
      await listQueuedCheckIns(offeringMatch!.id)
    );
    assert(
      queuedBeforeInvalid.includes(matchD) &&
        queuedBeforeInvalid.includes(matchE) &&
        queuedBeforeInvalid.includes(matchF),
      "precondition: three distinct waiters are queued"
    );

    const twoUsers = await postManualMatch(
      operatorId,
      offeringMatch!.id,
      { userIds: [matchD, matchE] },
      { now }
    );
    assertEqual(twoUsers.status, 400, "manual match with 2 users → 400 (14.3)");
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offeringMatch!.id)),
      queuedBeforeInvalid,
      "2-user match leaves the queue unchanged (14.3)"
    );

    const duplicates = await postManualMatch(
      operatorId,
      offeringMatch!.id,
      { userIds: [matchD, matchE, matchD] },
      { now }
    );
    assertEqual(
      duplicates.status,
      400,
      "manual match with duplicates → 400 (14.3)"
    );
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offeringMatch!.id)),
      queuedBeforeInvalid,
      "duplicate match leaves the queue unchanged (14.3)"
    );

    const crossOffering = await postManualMatch(
      operatorId,
      offeringMatch!.id,
      { userIds: [matchD, matchE, crossG] },
      { now }
    );
    assertEqual(
      crossOffering.status,
      400,
      "manual match with cross-offering user → 400 (14.3)"
    );
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offeringMatch!.id)),
      queuedBeforeInvalid,
      "cross-offering match leaves the queue unchanged (14.3)"
    );

    const matched = await postManualMatch(
      operatorId,
      offeringMatch!.id,
      { userIds: [matchF, matchD, matchE] },
      { now }
    );
    assertEqual(matched.status, 200, "valid trio manual match → 200 (14.3)");
    assert(matched.ok === true, "valid trio manual match ok");
    const manualTeamId = matched.ok ? matched.body.team.id : null;
    assert(
      typeof manualTeamId === "string" && manualTeamId.length > 0,
      "valid trio forms a team (14.3)"
    );
    assertEqual(
      queuedUserIds(await listQueuedCheckIns(offeringMatch!.id)).filter((id) =>
        [matchD, matchE, matchF].includes(id)
      ),
      [],
      "matched trio leaves the queue"
    );
    assertEqual(
      await listWorkspacesForUser(matchD),
      [],
      "manual-match learner D is not added to a Workspace (15.5)"
    );
    assertEqual(
      await listWorkspacesForUser(matchE),
      [],
      "manual-match learner E is not added to a Workspace (15.5)"
    );
    assertEqual(
      await listWorkspacesForUser(matchF),
      [],
      "manual-match learner F is not added to a Workspace (15.5)"
    );

    // --- 13.1 / 11.5: tick twice at the same clock is idempotent ---
    const pingOffering = await createOffering(operatorId, {
      ...offeringInput,
      title: "Tick ping offering",
    });
    const offeringPing =
      pingOffering.ok && "offering" in pingOffering.body
        ? pingOffering.body.offering
        : null;
    assert(offeringPing !== null, "tick ping offering exists");

    const expiredClock = new Date(now.getTime() + CRITIQUE_DEADLINE_MS);
    const pingWaiter = "user_queue_waiter";
    await postCheckIn(pingWaiter, offeringPing!.id, {
      now: new Date(expiredClock.getTime() - QUEUE_PING_MS),
    });

    const absencesBeforeFirst = await listAbsences(teamId!);
    const firstTick = await postTick(cronHeaders(CRON_SECRET), {
      now: expiredClock,
    });
    assertEqual(firstTick.status, 200, "first tick → 200");
    assert(firstTick.ok === true, "first tick ok");
    const absencesAfterFirst = await listAbsences(teamId!);
    assert(
      absencesAfterFirst.length > absencesBeforeFirst.length,
      "first tick at expired critique clock marks at least one absence"
    );
    if (firstTick.ok) {
      assert(
        firstTick.body.notices.sent >= 1,
        "first tick sends at least one notice (queue ping and/or turn)"
      );
    }

    const secondTick = await postTick(cronHeaders(CRON_SECRET), {
      now: expiredClock,
    });
    assertEqual(secondTick.status, 200, "second tick same clock → 200");
    assert(secondTick.ok === true, "second tick ok");
    if (secondTick.ok) {
      assertEqual(
        secondTick.body.notices.sent,
        0,
        "second tick same clock → 0 new notices (13.1, 11.5)"
      );
    }
    assertEqual(
      (await listAbsences(teamId!)).length,
      absencesAfterFirst.length,
      "second tick same clock → 0 new absences (11.5)"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (previousCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousCronSecret;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api integration (ACL, score privacy, manual match, tick idempotency, workspace isolation)"
  );
}

void main();
