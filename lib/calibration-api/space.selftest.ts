/**
 * Self-test: effect executor + team-space endpoints (Task 4.2).
 * Uses JSON stores + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/calibration-api/space.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { FacilitatorService } from "../calibration-facilitator/facilitator";
import type { TeamStateRecord } from "../calibration-store/types";

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

function throwingFacilitator(): FacilitatorService {
  const boom = () => {
    throw new Error("facilitator presentation failed");
  };
  return {
    renderScripted: boom,
    revoice: boom,
    askFollowUp: boom,
    commentOnDocument: boom,
    synthesizeFinal: boom,
  };
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;

  const tempDir = path.join(process.cwd(), ".data", "calibration-api-space-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.CALIBRATION_NOTICES_LOG = path.join(tempDir, "notices.log");

  const { createOffering } = await import("./offerings");
  const { executeEffects, getSpace, postDocSnapshot, postMessage } = await import(
    "./space"
  );
  const { startTeam } = await import("../calibration-engine/engine");
  const { formTeam, getTeam, listAbsences, saveTeamState } = await import(
    "../calibration-store/store"
  );

  try {
    const operatorId = "op_1";
    const presenter = "user_a";
    const criticB = "user_b";
    const criticC = "user_c";
    const stranger = "user_stranger";
    const now = new Date("2026-08-15T12:00:00.000Z");

    const created = await createOffering(operatorId, offeringInput);
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");

    const team = await formTeam(offering!.id, [presenter, criticB, criticC]);
    const started = startTeam([presenter, criticB, criticC], now);
    await executeEffects(team.id, started.state, started.effects, now);

    // --- GET space as member: phase critique, recap/messages include kickoff ---
    assertEqual((await getSpace(null, team.id)).status, 401, "unauthenticated GET → 401");
    assertEqual(
      (await getSpace(stranger, team.id)).status,
      403,
      "non-member GET → 403"
    );
    assertEqual(
      (await getSpace(presenter, "missing-team")).status,
      404,
      "missing team GET → 404"
    );

    const memberSpace = await getSpace(presenter, team.id, { now });
    assertEqual(memberSpace.status, 200, "member GET → 200");
    assert(memberSpace.ok === true, "member GET ok");
    if (memberSpace.ok) {
      assertEqual(memberSpace.body.phase, "critique", "member space phase is critique");
      assertEqual(memberSpace.body.role, "member", "member space role is member");
      const kickoff = memberSpace.body.messages.filter(
        (message) =>
          message.authorKind === "facilitator" &&
          /calibrate a shared rubric/i.test(message.body)
      );
      assert(kickoff.length > 0, "messages include kickoff recap");
      const recapKickoff = memberSpace.body.recap.messages.filter((message) =>
        /calibrate a shared rubric/i.test(message.body)
      );
      assert(recapKickoff.length > 0, "recap includes kickoff (first visit)");
      assert(
        memberSpace.body.messages.some(
          (message) =>
            message.authorKind === "facilitator" &&
            /share your individual critique/i.test(message.body)
        ),
        "messages include presenter prompt"
      );
    }

    const operatorSpace = await getSpace(operatorId, team.id, { now });
    assertEqual(operatorSpace.status, 200, "operator GET → 200");
    assert(
      operatorSpace.ok === true && operatorSpace.body.role === "operator",
      "operator GET is read-only operator role"
    );

    // --- Requirement 14.6: operator GET at T0+49h must not evaluate/advance ---
    const frozenTeam = await formTeam(offering!.id, [
      "user_op_a",
      "user_op_b",
      "user_op_c",
    ]);
    const frozenStart = startTeam(["user_op_a", "user_op_b", "user_op_c"], now);
    await executeEffects(frozenTeam.id, frozenStart.state, frozenStart.effects, now);
    const frozenBefore = await getTeam(frozenTeam.id);
    const absencesBefore = await listAbsences(frozenTeam.id);
    assert(frozenBefore !== null, "frozen team exists after formation");
    const later = new Date(now.getTime() + 49 * 60 * 60 * 1000);
    const operatorLater = await getSpace(operatorId, frozenTeam.id, { now: later });
    assertEqual(operatorLater.status, 200, "operator GET at T0+49h → 200");
    assert(
      operatorLater.ok === true && operatorLater.body.role === "operator",
      "operator GET at T0+49h stays operator role"
    );
    const frozenAfter = await getTeam(frozenTeam.id);
    const absencesAfter = await listAbsences(frozenTeam.id);
    assert(frozenAfter !== null, "frozen team still exists after operator GET");
    assertEqual(
      frozenAfter?.state.phase,
      frozenBefore?.state.phase,
      "operator GET at T0+49h leaves phase unchanged"
    );
    assertEqual(
      frozenAfter?.state.critiqueStage,
      frozenBefore?.state.critiqueStage,
      "operator GET at T0+49h leaves critiqueStage unchanged"
    );
    assertEqual(
      frozenAfter?.state.absenceStepKeys,
      frozenBefore?.state.absenceStepKeys,
      "operator GET at T0+49h leaves absenceStepKeys unchanged"
    );
    assertEqual(
      frozenAfter?.state.perPersonDeadlines,
      frozenBefore?.state.perPersonDeadlines,
      "operator GET at T0+49h leaves perPersonDeadlines unchanged"
    );
    assertEqual(
      frozenAfter?.state.groupDeadline,
      frozenBefore?.state.groupDeadline,
      "operator GET at T0+49h leaves groupDeadline unchanged"
    );
    assertEqual(
      absencesAfter.map((row) => ({ userId: row.userId, stepKey: row.stepKey })),
      absencesBefore.map((row) => ({ userId: row.userId, stepKey: row.stepKey })),
      "operator GET at T0+49h leaves persisted absences unchanged"
    );
    if (operatorLater.ok && frozenAfter) {
      assertEqual(
        operatorLater.body.phase,
        frozenAfter.state.phase,
        "operator space payload phase matches persisted team"
      );
      assertEqual(
        operatorLater.body.critiqueStage,
        frozenAfter.state.critiqueStage,
        "operator space payload stage matches persisted team"
      );
    }

    // Member GET still runs opportunistic evaluate + execute (T0+49h advances).
    const memberClockTeam = await formTeam(offering!.id, [
      "user_mem_a",
      "user_mem_b",
      "user_mem_c",
    ]);
    const memberClockStart = startTeam(
      ["user_mem_a", "user_mem_b", "user_mem_c"],
      now
    );
    await executeEffects(
      memberClockTeam.id,
      memberClockStart.state,
      memberClockStart.effects,
      now
    );
    const memberClockBefore = await getTeam(memberClockTeam.id);
    const memberLater = await getSpace("user_mem_a", memberClockTeam.id, {
      now: later,
    });
    assertEqual(memberLater.status, 200, "member GET at T0+49h → 200");
    const memberClockAfter = await getTeam(memberClockTeam.id);
    const memberAbsencesAfter = await listAbsences(memberClockTeam.id);
    assert(
      memberClockAfter?.state.phase !== memberClockBefore?.state.phase ||
        memberClockAfter?.state.critiqueStage !==
          memberClockBefore?.state.critiqueStage ||
        JSON.stringify(memberClockAfter?.state.absenceStepKeys) !==
          JSON.stringify(memberClockBefore?.state.absenceStepKeys) ||
        JSON.stringify(memberClockAfter?.state.perPersonDeadlines) !==
          JSON.stringify(memberClockBefore?.state.perPersonDeadlines) ||
        memberAbsencesAfter.length > 0,
      "member GET at T0+49h still opportunistically evaluates and executes"
    );

    // --- POST presenter message → GET shows critic prompt from facilitator ---
    assertEqual(
      (await postMessage(null, team.id, { body: "My critique" })).status,
      401,
      "unauthenticated POST message → 401"
    );
    assertEqual(
      (await postMessage(operatorId, team.id, { body: "operator should not post" })).status,
      403,
      "operator POST message → 403"
    );
    assertEqual(
      (await postMessage(stranger, team.id, { body: "stranger" })).status,
      403,
      "non-member POST message → 403"
    );

    const posted = await postMessage(
      presenter,
      team.id,
      { body: "The sample rubric is too vague on evidence." },
      { now }
    );
    assertEqual(posted.status, 200, "presenter POST message → 200");
    assert(posted.ok === true, "presenter POST ok");
    if (posted.ok) {
      assertEqual(posted.body.message.authorKind, "learner", "posted message is learner");
      assertEqual(posted.body.message.authorUserId, presenter, "posted message author");
      assert(
        posted.body.space.messages.some(
          (message) =>
            message.authorKind === "facilitator" &&
            /agree or disagree/i.test(message.body)
        ),
        "space payload after presenter post includes facilitator critic prompt"
      );
    }

    const afterPost = await getSpace(criticB, team.id, { now });
    assertEqual(afterPost.status, 200, "critic GET after presenter post → 200");
    assert(
      afterPost.ok === true &&
        afterPost.body.messages.some(
          (message) =>
            message.authorKind === "facilitator" &&
            /agree or disagree/i.test(message.body)
        ),
      "GET space shows critic prompt from facilitator"
    );

    // --- POST snapshot as member updates docs ---
    assertEqual(
      (await postDocSnapshot(null, team.id, "rubric", { text: "draft" })).status,
      401,
      "unauthenticated POST snapshot → 401"
    );
    assertEqual(
      (
        await postDocSnapshot(operatorId, team.id, "rubric", {
          text: "operator draft",
        })
      ).status,
      403,
      "operator POST snapshot → 403"
    );

    const snapshot = await postDocSnapshot(
      criticB,
      team.id,
      "rubric",
      { text: "1. Clarity — one-line rationale" },
      { now }
    );
    assertEqual(snapshot.status, 200, "member POST snapshot → 200");
    assert(snapshot.ok === true, "member POST snapshot ok");

    const afterSnap = await getSpace(criticB, team.id, { now });
    assert(afterSnap.ok === true, "GET after snapshot ok");
    if (afterSnap.ok) {
      const rubric = afterSnap.body.docs.find((doc) => doc.docKind === "rubric");
      assert(rubric !== undefined, "docs meta includes rubric");
      assertEqual(rubric?.updatedBy, criticB, "docs meta records snapshot author");
    }

    // --- POST snapshot after lock → 409 ---
    const current = await getTeam(team.id);
    assert(current !== null, "team still exists for lock case");
    const lockedState: TeamStateRecord = {
      ...current!.state,
      phase: "finalized",
    };
    await saveTeamState(team.id, lockedState);
    const lockedSnap = await postDocSnapshot(
      presenter,
      team.id,
      "rubric",
      { text: "should not persist" },
      { now }
    );
    assertEqual(lockedSnap.status, 409, "POST snapshot after lock → 409");

    // --- presentation failure still persists state advance ---
    const team2 = await formTeam(offering!.id, ["user_d", "user_e", "user_f"]);
    const started2 = startTeam(["user_d", "user_e", "user_f"], now);
    await executeEffects(team2.id, started2.state, started2.effects, now);
    const failedPost = await postMessage(
      "user_d",
      team2.id,
      { body: "Presenter critique that should still advance the round." },
      { now, facilitator: throwingFacilitator() }
    );
    assertEqual(failedPost.status, 200, "POST with throwing facilitator → 200");
    const persisted = await getTeam(team2.id);
    assertEqual(
      persisted?.state.critiqueStage,
      "critic_response",
      "presentation failure still persists critic_response advance"
    );
    assert(
      persisted?.state.respondedUserIds.includes("user_d") === true,
      "presentation failure still records the presenter response"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api space (executor, GET, message POST, snapshot POST)"
  );
}

void main();
