/**
 * Self-test: calibration access guard + offering/gate/team ACL handlers (Task 4.1).
 * Uses JSON stores + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/calibration-api/offerings.selftest.ts
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

  const tempDir = path.join(process.cwd(), ".data", "calibration-api-offerings-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const { createOffering, getOfferingGate, getTeamAccess, listMyOfferings } =
    await import("./offerings");
  const { formTeam, getOffering, listQueuedCheckIns } = await import(
    "../calibration-store/store"
  );
  const { listWorkspacesForUser } = await import("../workspace-store/store");

  try {
    const operatorId = "op_1";
    const learnerA = "user_a";
    const learnerB = "user_b";
    const learnerC = "user_c";
    const stranger = "user_stranger";

    // --- unauthenticated create → 401 ---
    assertEqual(
      (await createOffering(null, offeringInput)).status,
      401,
      "unauthenticated create → 401"
    );

    // --- create offering with artifacts + AI config → 200 and getOffering matches ---
    const created = await createOffering(operatorId, offeringInput);
    assertEqual(created.status, 200, "create offering → 200");
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");
    assertEqual(offering!.title, offeringInput.title, "create stores title");
    assertEqual(
      offering!.sampleAppId,
      offeringInput.sampleAppId,
      "create stores sample bot"
    );
    assertEqual(
      offering!.sampleRubric,
      offeringInput.sampleRubric,
      "create stores sample rubric"
    );
    assertEqual(
      offering!.deploymentBrief,
      offeringInput.deploymentBrief,
      "create stores deployment brief"
    );
    assertEqual(
      offering!.transcriptExcerpt,
      offeringInput.transcriptExcerpt,
      "create stores transcript"
    );
    assertEqual(
      offering!.aiProvider,
      offeringInput.aiProvider,
      "create stores AI provider"
    );
    assertEqual(offering!.aiModel, offeringInput.aiModel, "create stores AI model");
    assertEqual(
      offering!.operatorUserId,
      operatorId,
      "create stores operator as owner"
    );
    assertEqual(
      offering!.facilitatorApiKey,
      undefined,
      "create response does not include a facilitator key"
    );

    const persisted = await getOffering(offering!.id);
    assert(persisted !== null, "getOffering finds created offering");
    assertEqual(persisted?.title, offeringInput.title, "getOffering matches title");
    assertEqual(
      persisted?.sampleAppId,
      offeringInput.sampleAppId,
      "getOffering matches sample bot"
    );
    assertEqual(
      persisted?.sampleRubric,
      offeringInput.sampleRubric,
      "getOffering matches sample rubric"
    );
    assertEqual(
      persisted?.deploymentBrief,
      offeringInput.deploymentBrief,
      "getOffering matches brief"
    );
    assertEqual(
      persisted?.transcriptExcerpt,
      offeringInput.transcriptExcerpt,
      "getOffering matches transcript"
    );
    assertEqual(
      persisted?.aiProvider,
      offeringInput.aiProvider,
      "getOffering matches AI provider"
    );
    assertEqual(
      persisted?.aiModel,
      offeringInput.aiModel,
      "getOffering matches AI model"
    );
    assertEqual(
      persisted?.operatorUserId,
      operatorId,
      "getOffering matches operator"
    );

    assertEqual(
      (await createOffering(operatorId, { ...offeringInput, title: "   " })).status,
      400,
      "create with empty title → 400"
    );

    assertEqual(
      (await listMyOfferings(null)).status,
      401,
      "unauthenticated list → 401"
    );
    const mine = await listMyOfferings(operatorId);
    assertEqual(mine.status, 200, "operator list → 200");
    assert(mine.ok === true, "operator list ok");
    if (mine.ok) {
      assertEqual(mine.body.offerings.length, 1, "list includes the created offering");
      assertEqual(mine.body.offerings[0]?.id, offering!.id, "list item id");
      assertEqual(
        mine.body.offerings[0]?.title,
        offeringInput.title,
        "list item title"
      );
    }
    const strangerList = await listMyOfferings("stranger_op");
    assert(strangerList.ok === true, "other operator list ok");
    if (strangerList.ok) {
      assertEqual(
        strangerList.body.offerings.length,
        0,
        "list mine does not leak another operator's offerings"
      );
    }

    const createdWithKey = await createOffering(operatorId, {
      ...offeringInput,
      title: "Keyed offering",
      facilitatorApiKey: "  sk-fac  ",
    });
    assertEqual(createdWithKey.status, 200, "create with facilitator key → 200");
    assert(
      createdWithKey.ok === true &&
        !("facilitatorApiKey" in createdWithKey.body.offering),
      "create response omits the facilitator key"
    );
    if (createdWithKey.ok) {
      assertEqual(
        (await getOffering(createdWithKey.body.offering.id))?.facilitatorApiKey,
        "sk-fac",
        "store keeps the facilitator key override"
      );
    }

    // --- gate GET returns artifacts meta + my queue/team status (not checked in) ---
    assertEqual(
      (await getOfferingGate(null, offering!.id)).status,
      401,
      "unauthenticated gate → 401"
    );
    assertEqual(
      (await getOfferingGate(learnerA, "missing-offering")).status,
      404,
      "missing offering gate → 404"
    );

    const gate = await getOfferingGate(learnerA, offering!.id);
    assertEqual(gate.status, 200, "learner gate → 200");
    assert(gate.ok === true, "learner gate ok");
    if (gate.ok) {
      assertEqual(gate.body.offering.id, offering!.id, "gate offering id");
      assertEqual(gate.body.offering.title, offeringInput.title, "gate offering title");
      assertEqual(
        gate.body.offering.artifacts.sampleAppId,
        offeringInput.sampleAppId,
        "gate artifacts meta includes sample bot"
      );
      assertEqual(
        gate.body.offering.artifacts.hasSampleRubric,
        true,
        "gate artifacts meta marks sample rubric present"
      );
      assertEqual(
        gate.body.offering.artifacts.hasDeploymentBrief,
        true,
        "gate artifacts meta marks brief present"
      );
      assertEqual(
        gate.body.offering.artifacts.hasTranscriptExcerpt,
        true,
        "gate artifacts meta marks transcript present"
      );
      assertEqual(gate.body.me.checkedIn, false, "learner gate is not checked in");
      assertEqual(gate.body.me.queueCount, 0, "learner gate queue is empty");
      assertEqual(gate.body.me.teamId, null, "learner gate has no team");
    }

    // --- operator viewing gate is NOT added to queue (Requirement 15.4) ---
    const operatorGate = await getOfferingGate(operatorId, offering!.id);
    assertEqual(operatorGate.status, 200, "operator gate → 200");
    assert(operatorGate.ok === true, "operator gate ok");
    if (operatorGate.ok) {
      assertEqual(
        operatorGate.body.me.checkedIn,
        false,
        "operator viewing gate is not checked in"
      );
      assertEqual(
        operatorGate.body.me.teamId,
        null,
        "operator viewing gate is not on a team"
      );
      assertEqual(
        operatorGate.body.me.role,
        "operator",
        "operator gate reports operator role"
      );
    }
    const queuedAfterOperatorView = await listQueuedCheckIns(offering!.id);
    assertEqual(
      queuedAfterOperatorView.length,
      0,
      "operator viewing gate does not enqueue anyone"
    );
    assertEqual(
      queuedAfterOperatorView.filter((c) => c.userId === operatorId).length,
      0,
      "operator is not in the matching queue after gate GET"
    );

    const learnerGateAgain = await getOfferingGate(learnerA, offering!.id);
    assert(
      learnerGateAgain.ok === true && learnerGateAgain.body.me.checkedIn === false,
      "learner remains not checked in after operator gate view"
    );

    // --- create/join team does not create workspace membership (Requirement 15.5) ---
    const team = await formTeam(offering!.id, [learnerA, learnerB, learnerC]);
    assertEqual(team.members.length, 3, "formTeam records three members");
    assertEqual(
      await listWorkspacesForUser(learnerA),
      [],
      "joining a team does not add learner A to a Workspace"
    );
    assertEqual(
      await listWorkspacesForUser(learnerB),
      [],
      "joining a team does not add learner B to a Workspace"
    );
    assertEqual(
      await listWorkspacesForUser(learnerC),
      [],
      "joining a team does not add learner C to a Workspace"
    );
    assertEqual(
      await listWorkspacesForUser(operatorId),
      [],
      "creating an offering does not add the operator to a Workspace"
    );

    // --- team ACL: member / operator / denied (Requirement 15.1) ---
    assertEqual(
      (await getTeamAccess(null, team.id)).status,
      401,
      "unauthenticated team GET → 401"
    );
    assertEqual(
      (await getTeamAccess(stranger, team.id)).status,
      403,
      "non-member team GET → 403"
    );
    assertEqual(
      (await getTeamAccess(stranger, "missing-team")).status,
      404,
      "missing team GET → 404"
    );

    const memberAccess = await getTeamAccess(learnerA, team.id);
    assertEqual(memberAccess.status, 200, "member team GET → 200");
    assert(
      memberAccess.ok === true && memberAccess.body.role === "member",
      "member team GET reports member role"
    );

    const operatorAccess = await getTeamAccess(operatorId, team.id);
    assertEqual(operatorAccess.status, 200, "operator team GET → 200");
    assert(
      operatorAccess.ok === true && operatorAccess.body.role === "operator",
      "operator team GET reports operator role (read-only, not a learner member)"
    );
    assertEqual(
      (await listQueuedCheckIns(offering!.id)).filter((c) => c.userId === operatorId)
        .length,
      0,
      "operator team GET does not check the operator into the queue"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("OK: calibration-api offerings (create, gate, access guard)");
}

void main();
