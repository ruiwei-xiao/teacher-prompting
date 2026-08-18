/**
 * Self-test: check-in + queue evaluation executing team formation (Task 4.3).
 * Uses JSON stores + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/calibration-api/queue.selftest.ts
 */
import fs from "fs/promises";
import path from "path";

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

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;

  const tempDir = path.join(process.cwd(), ".data", "calibration-api-queue-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.CALIBRATION_NOTICES_LOG = path.join(tempDir, "notices.log");

  const { createOffering, getOfferingGate } = await import("./offerings");
  const { postCheckIn } = await import("./queue");
  const { getCheckIn, getTeamForMember, hasNotice, listQueuedCheckIns } =
    await import("../calibration-store/store");
  const dataFile = process.env.CALIBRATION_DATA_FILE!;

  try {
    const operatorId = "op_1";
    const learnerA = "user_a";
    const learnerB = "user_b";
    const learnerC = "user_c";
    const now = new Date("2026-08-15T12:00:00.000Z");

    const created = await createOffering(operatorId, offeringInput);
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");

    // --- unauthenticated / missing offering ---
    assertEqual(
      (await postCheckIn(null, offering!.id, { now })).status,
      401,
      "unauthenticated check-in → 401"
    );
    assertEqual(
      (await postCheckIn(learnerA, "missing-offering", { now })).status,
      404,
      "missing offering check-in → 404"
    );

    // --- operator viewing the gate is not auto-checked-in ---
    const operatorGate = await getOfferingGate(operatorId, offering!.id);
    assertEqual(operatorGate.status, 200, "operator gate → 200");
    assert(
      operatorGate.ok === true && operatorGate.body.me.checkedIn === false,
      "operator viewing gate is not checked in"
    );
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).filter((c) => c.userId === operatorId)
        .length,
      0,
      "operator is not auto-checked-in by viewing"
    );

    // --- first check-in → queued, 1 of 3 ---
    const first = await postCheckIn(learnerA, offering!.id, { now });
    assertEqual(first.status, 200, "first check-in → 200");
    assert(first.ok === true, "first check-in ok");
    if (first.ok) {
      assertEqual(first.body.status, "queued", "first check-in status is queued");
      assertEqual(first.body.queueCount, 1, "first check-in is 1 of 3");
      assertEqual(first.body.of, 3, "queue denominator is 3");
      assertEqual(first.body.teamId, null, "first check-in has no team");
    }
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).length,
      1,
      "queue holds one learner after first check-in"
    );
    assertEqual(
      (await getCheckIn(offering!.id, learnerA))?.checkedInAt,
      now.toISOString(),
      "first check-in stamps checkedInAt from injected clock"
    );

    const gateAfterFirst = await getOfferingGate(learnerA, offering!.id);
    assert(
      gateAfterFirst.ok === true &&
        gateAfterFirst.body.me.checkedIn === true &&
        gateAfterFirst.body.me.queueCount === 1 &&
        gateAfterFirst.body.me.teamId === null,
      "gate after first check-in shows queued 1 of 3"
    );

    // --- duplicate check-in → 409 (or current status) and no second row ---
    const duplicate = await postCheckIn(learnerA, offering!.id, { now });
    assert(
      duplicate.status === 409 ||
        (duplicate.ok === true &&
          duplicate.body.status === "queued" &&
          duplicate.body.queueCount === 1),
      "duplicate check-in → 409 or current queued status"
    );
    if (duplicate.status === 409 && "queueCount" in duplicate.body) {
      assertEqual(duplicate.body.queueCount, 1, "409 returns current 1 of 3");
      assertEqual(duplicate.body.teamId, null, "409 while queued has no team");
    }
    const queuedAfterDup = await listQueuedCheckIns(offering!.id);
    assertEqual(
      queuedAfterDup.filter((c) => c.userId === learnerA).length,
      1,
      "duplicate check-in does not create two check-ins"
    );

    // --- second check-in → 2 of 3, no team ---
    const second = await postCheckIn(learnerB, offering!.id, { now });
    assertEqual(second.status, 200, "second check-in → 200");
    assert(second.ok === true, "second check-in ok");
    if (second.ok) {
      assertEqual(second.body.status, "queued", "second check-in status is queued");
      assertEqual(second.body.queueCount, 2, "second check-in is 2 of 3");
      assertEqual(second.body.teamId, null, "second check-in has no team");
    }
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).length,
      2,
      "queue holds two learners after second check-in"
    );

    // --- operator viewing after learners queued still does not check in ---
    const operatorGateLater = await getOfferingGate(operatorId, offering!.id);
    assert(
      operatorGateLater.ok === true && operatorGateLater.body.me.checkedIn === false,
      "operator viewing after queue activity is still not checked in"
    );
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).filter((c) => c.userId === operatorId)
        .length,
      0,
      "operator viewing never enqueues the operator"
    );

    // --- third check-in → team formed, recap posted, 3 team_formed notices ---
    const third = await postCheckIn(learnerC, offering!.id, { now });
    assertEqual(third.status, 200, "third check-in → 200");
    assert(third.ok === true, "third check-in ok");
    const teamId = third.ok ? third.body.teamId : null;
    assert(typeof teamId === "string" && teamId.length > 0, "third check-in forms a team");
    if (third.ok) {
      assertEqual(third.body.status, "matched", "third check-in status is matched");
      assertEqual(third.body.of, 3, "formed response still reports of 3");
    }
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).length,
      0,
      "formed trio is taken out of the queue"
    );

    const view = await getTeamForMember(teamId!, learnerA);
    assert(view !== null, "formed team space is readable");
    assert(
      (view?.messages ?? []).some(
        (message) =>
          message.authorKind === "facilitator" &&
          /calibrate a shared rubric/i.test(message.body)
      ),
      "recap message is present after formation"
    );

    const memberUserIds = view?.team.state.memberUserIds ?? [];
    assertEqual(memberUserIds.length, 3, "formed team has three memberUserIds");
    assertEqual(
      [...memberUserIds].sort(),
      [learnerA, learnerB, learnerC].sort(),
      "formed team members are the three check-ins (order-independent)"
    );
    const formedKeys = memberUserIds.map(
      (userId) => `${memberUserIds.join(",")}:${userId}:team_formed`
    );
    assertEqual(
      new Set(formedKeys).size,
      3,
      "engine team_formed dedupe keys are unique"
    );
    for (const userId of memberUserIds) {
      const recorded = await hasNotice(
        `${memberUserIds.join(",")}:${userId}:team_formed`
      );
      assert(recorded, `team_formed notice recorded for ${userId}`);
    }

    const stored = JSON.parse(await fs.readFile(dataFile, "utf8")) as {
      notices: Array<{ kind: string; userId: string; dedupeKey: string }>;
      checkIns: Array<{ userId: string; checkedInAt: string }>;
    };
    const teamFormed = stored.notices.filter((row) => row.kind === "team_formed");
    assertEqual(teamFormed.length, 3, "exactly three team_formed records stored");
    assertEqual(
      [...teamFormed.map((row) => row.userId)].sort(),
      [...memberUserIds].sort(),
      "one team_formed record per formed-team member"
    );
    assertEqual(
      [...teamFormed.map((row) => row.dedupeKey)].sort(),
      [...formedKeys].sort(),
      "stored team_formed keys match the engine dedupe keys"
    );
    for (const userId of [learnerA, learnerB, learnerC]) {
      const persisted = stored.checkIns.find((row) => row.userId === userId);
      assertEqual(
        persisted?.checkedInAt,
        now.toISOString(),
        `${userId} checkedInAt is the injected clock`
      );
    }

    // --- gate GET shows matched teamId (deferred from 4.1) ---
    const matchedGate = await getOfferingGate(learnerA, offering!.id);
    assertEqual(matchedGate.status, 200, "matched learner gate → 200");
    assert(
      matchedGate.ok === true && matchedGate.body.me.teamId === teamId,
      "gate GET shows matched teamId"
    );
    assert(
      matchedGate.ok === true && matchedGate.body.me.checkedIn === true,
      "matched learner remains checked in on the gate"
    );

    const matchedB = await getOfferingGate(learnerB, offering!.id);
    const matchedC = await getOfferingGate(learnerC, offering!.id);
    assert(
      matchedB.ok === true && matchedB.body.me.teamId === teamId,
      "gate shows teamId for second member"
    );
    assert(
      matchedC.ok === true && matchedC.body.me.teamId === teamId,
      "gate shows teamId for third member"
    );

    // --- duplicate after match still does not create a second check-in ---
    const dupMatched = await postCheckIn(learnerA, offering!.id, { now });
    assert(
      dupMatched.status === 409 ||
        (dupMatched.ok === true && dupMatched.body.teamId === teamId),
      "duplicate after match → 409 or current matched status"
    );
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).length,
      0,
      "duplicate after match does not re-queue the learner"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api queue (check-in, n of 3, formation, notices, gate teamId)"
  );
}

void main();
