/**
 * Runtime self-test for CalibrationStore persistence (Tasks 1.2–1.3).
 * Forces JSON file mode (no Postgres) for reliable local runs.
 *
 * Run: npx tsx lib/calibration-store/store.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { MemberScoreView, NoticeRecord, TeamStateRecord } from "./types";
import { SCORE_MAX, SCORE_MIN } from "./types";

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

async function expectThrow(
  fn: () => Promise<unknown>,
  message: string
): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

function clocksAreIndependent(state: TeamStateRecord): boolean {
  return (
    Object.prototype.hasOwnProperty.call(state, "perPersonDeadlines") &&
    Object.prototype.hasOwnProperty.call(state, "groupDeadline") &&
    !Object.prototype.hasOwnProperty.call(state, "deadline")
  );
}

function collectCriterionValues(node: unknown): number[] {
  const values: number[] = [];
  const walk = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(walk);
      return;
    }
    if (current && typeof current === "object") {
      const rec = current as Record<string, unknown>;
      if (
        typeof rec.value === "number" &&
        typeof rec.criterionKey === "string"
      ) {
        values.push(rec.value);
      }
      Object.values(rec).forEach(walk);
    }
  };
  walk(node);
  return values;
}

function scoreValuesForUser(
  view: MemberScoreView | null | undefined,
  userId: string
): number[] {
  if (!view) {
    return [];
  }
  return view.members
    .filter((member) => member.userId === userId)
    .flatMap((member) => member.scores.map((row) => row.value));
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(process.cwd(), ".data", "calibration-store-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  const dataFile = path.join(tempDir, "calibration.json");
  process.env.CALIBRATION_DATA_FILE = dataFile;

  const {
    addAddendum,
    appendMessage,
    checkIn,
    createOffering,
    formTeam,
    getOffering,
    getScoresForMember,
    getScoresForOperator,
    getTeamForMember,
    listAbsences,
    listAddenda,
    listAgreements,
    listActiveCheckInsForUser,
    listQueuedCheckIns,
    recordAbsence,
    recordAgreement,
    hasNotice,
    recordNotice,
    revealScores,
    saveDocSnapshot,
    saveTeamState,
    submitScores,
    updateOfferingFacilitatorKey,
  } = await import("./store");

  try {
    const operatorId = "op_1";
    const userA = "user_a";
    const userB = "user_b";
    const userC = "user_c";
    const userD = "user_d";
    const stranger = "user_stranger";

    // --- offering artifacts + facilitator AI config (Requirement 1.1) ---
    const offering = await createOffering(
      {
        title: "Rubric Calibration Pilot",
        sampleAppId: "app_sample_bot",
        sampleRubric: "Criterion 1: clarity\nCriterion 2: evidence",
        deploymentBrief: "Deploy the tutor for week-3 lab.",
        transcriptExcerpt: "Student: ...\nTutor: ...",
        aiProvider: "openai",
        aiModel: "gpt-4o-mini",
      },
      operatorId
    );

    assert(typeof offering.id === "string" && offering.id.length > 0, "createOffering assigns id");
    assertEqual(offering.operatorUserId, operatorId, "createOffering stores operator");
    assertEqual(offering.title, "Rubric Calibration Pilot", "createOffering stores title");
    assertEqual(offering.sampleAppId, "app_sample_bot", "createOffering stores sample bot");
    assertEqual(
      offering.sampleRubric,
      "Criterion 1: clarity\nCriterion 2: evidence",
      "createOffering stores sample rubric"
    );
    assertEqual(
      offering.deploymentBrief,
      "Deploy the tutor for week-3 lab.",
      "createOffering stores deployment brief"
    );
    assertEqual(
      offering.transcriptExcerpt,
      "Student: ...\nTutor: ...",
      "createOffering stores transcript excerpt"
    );
    assertEqual(offering.aiProvider, "openai", "createOffering stores AI provider");
    assertEqual(offering.aiModel, "gpt-4o-mini", "createOffering stores AI model");
    assertEqual(
      offering.facilitatorApiKey,
      undefined,
      "createOffering omits facilitator key when unused"
    );
    assert(
      typeof offering.createdAt === "string" && offering.createdAt.length > 0,
      "createOffering stores createdAt"
    );

    const loadedOffering = await getOffering(offering.id);
    assert(loadedOffering !== null, "getOffering finds created offering");
    assertEqual(loadedOffering?.id, offering.id, "getOffering round-trips id");
    assertEqual(loadedOffering?.sampleAppId, offering.sampleAppId, "getOffering round-trips sample bot");
    assertEqual(loadedOffering?.sampleRubric, offering.sampleRubric, "getOffering round-trips sample rubric");
    assertEqual(
      loadedOffering?.deploymentBrief,
      offering.deploymentBrief,
      "getOffering round-trips deployment brief"
    );
    assertEqual(
      loadedOffering?.transcriptExcerpt,
      offering.transcriptExcerpt,
      "getOffering round-trips transcript excerpt"
    );
    assertEqual(loadedOffering?.aiProvider, offering.aiProvider, "getOffering round-trips AI provider");
    assertEqual(loadedOffering?.aiModel, offering.aiModel, "getOffering round-trips AI model");
    assertEqual(await getOffering("missing_offering"), null, "getOffering returns null for unknown id");

    const offering2 = await createOffering(
      {
        title: "Second Offering",
        sampleAppId: "app_other",
        sampleRubric: "Other rubric",
        deploymentBrief: "Other brief",
        transcriptExcerpt: "Other transcript",
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4",
        facilitatorApiKey: "  sk-fac  ",
      },
      operatorId
    );
    assertEqual(
      offering2.facilitatorApiKey,
      "sk-fac",
      "createOffering stores a custom facilitator key"
    );
    assertEqual(
      (await getOffering(offering2.id))?.facilitatorApiKey,
      "sk-fac",
      "getOffering round-trips a custom facilitator key"
    );
    const cleared = await updateOfferingFacilitatorKey(offering2.id, null);
    assertEqual(
      cleared?.facilitatorApiKey,
      undefined,
      "clearing the facilitator key removes the override"
    );
    const replaced = await updateOfferingFacilitatorKey(offering2.id, "  sk-new  ");
    assertEqual(
      replaced?.facilitatorApiKey,
      "sk-new",
      "updating the facilitator key stores the trimmed value"
    );

    // --- check-in unique per (offering, learner) (Requirement 2.1) ---
    const checkInA = await checkIn(offering.id, userA);
    assertEqual(checkInA.offeringId, offering.id, "checkIn stores offeringId");
    assertEqual(checkInA.userId, userA, "checkIn stores userId");
    assertEqual(checkInA.status, "queued", "checkIn starts queued");
    assertEqual(checkInA.teamId, null, "queued check-in has no team");
    assertEqual(checkInA.missedPings, 0, "checkIn starts with zero missed pings");
    assertEqual(checkInA.lastPingAt, null, "checkIn starts with no ping");

    const checkInAAgain = await checkIn(offering.id, userA);
    assertEqual(checkInAAgain.id, checkInA.id, "duplicate check-in returns the same record");

    await checkIn(offering.id, userB);
    const queuedAfterTwo = await listQueuedCheckIns(offering.id);
    assertEqual(queuedAfterTwo.length, 2, "two distinct learners stay queued");
    assertEqual(
      queuedAfterTwo.filter((c) => c.userId === userA).length,
      1,
      "unique constraint keeps one check-in per offering+learner"
    );

    await checkIn(offering.id, userC);
    assertEqual(
      (await listQueuedCheckIns(offering.id)).length,
      3,
      "third learner is queued (n of 3)"
    );

    const checkInAOnOffering2 = await checkIn(offering2.id, userA);
    assert(
      checkInAOnOffering2.id !== checkInA.id,
      "same learner may check in to a different offering"
    );
    const activeForA = await listActiveCheckInsForUser(userA);
    assertEqual(activeForA.length, 2, "listActiveCheckInsForUser returns both offerings");
    assert(
      activeForA.every((row) => row.userId === userA),
      "listActiveCheckInsForUser is scoped to the learner"
    );

    assertEqual(
      (await listQueuedCheckIns(offering2.id)).map((c) => c.userId),
      [userA],
      "second offering queue is isolated"
    );

    // --- form team + persistent space (Requirement 3.1) ---
    const team = await formTeam(offering.id, [userA, userB, userC]);
    assert(typeof team.id === "string" && team.id.length > 0, "formTeam assigns id");
    assertEqual(team.offeringId, offering.id, "formTeam stores offeringId");
    assertEqual(team.phase, "critique", "formTeam opens critique");
    assertEqual(team.state.phase, "critique", "team state record phase is critique");
    assertEqual(team.members.length, 3, "formTeam records three members");
    assertEqual(
      team.members.map((m) => m.userId),
      [userA, userB, userC],
      "members keep formTeam order"
    );
    assertEqual(
      team.members.map((m) => m.memberIndex),
      [0, 1, 2],
      "members receive serial indexes 0–2"
    );
    assertEqual(team.finalizedAt, null, "new team is not locked");
    assert(clocksAreIndependent(team.state), "initial state keeps independent clocks");

    const queuedAfterForm = await listQueuedCheckIns(offering.id);
    assertEqual(queuedAfterForm.length, 0, "formTeam removes the trio from the queue");
    assertEqual(
      (await listQueuedCheckIns(offering2.id)).length,
      1,
      "forming a team does not drain another offering queue"
    );

    const viewA = await getTeamForMember(team.id, userA);
    assert(viewA !== null, "member can load the team after formation");
    assertEqual(viewA?.team.id, team.id, "getTeamForMember returns the formed team");
    assertEqual(viewA?.team.members.length, 3, "persisted team keeps all members");
    assertEqual(viewA?.messages.length, 0, "new team has no messages");
    assertEqual(
      await getTeamForMember(team.id, stranger),
      null,
      "non-member getTeamForMember returns null"
    );

    // space survives with nobody present — reload after formation
    const stillThere = await getTeamForMember(team.id, userB);
    assert(stillThere !== null, "team space remains available with nobody present");
    assertEqual(stillThere?.team.id, team.id, "reloaded team id is stable");

    // --- serializable team state record ---
    const perPersonAt = "2026-08-17T00:00:00.000Z";
    const groupAt = "2026-08-29T00:00:00.000Z";
    const nextState: TeamStateRecord = {
      phase: "critique",
      round: 2,
      presenterIndex: 1,
      perPersonDeadlines: [
        { userId: userA, stepKey: "critique:2", deadlineAt: perPersonAt },
      ],
      groupDeadline: groupAt,
      flaggedCriteria: [],
      absenceStepKeys: [],
      agreementSets: { merge_complete: [], final_consensus: [] },
      memberUserIds: [userA, userB, userC],
      respondedUserIds: [userA],
      critiqueStage: "critic_response",
    };
    await saveTeamState(team.id, nextState);
    const afterState = await getTeamForMember(team.id, userC);
    assertEqual(afterState?.team.state.round, 2, "saveTeamState persists round");
    assertEqual(
      afterState?.team.state.presenterIndex,
      1,
      "saveTeamState persists presenter index"
    );
    assertEqual(
      afterState?.team.state.perPersonDeadlines[0]?.deadlineAt,
      perPersonAt,
      "saveTeamState persists per-person clock"
    );
    assertEqual(
      afterState?.team.state.groupDeadline,
      groupAt,
      "saveTeamState persists group clock"
    );
    assertEqual(
      afterState?.team.state.memberUserIds,
      [userA, userB, userC],
      "saveTeamState persists official memberUserIds"
    );
    assertEqual(
      afterState?.team.state.respondedUserIds,
      [userA],
      "saveTeamState persists official respondedUserIds"
    );
    assertEqual(
      afterState?.team.state.critiqueStage,
      "critic_response",
      "saveTeamState persists official critiqueStage"
    );
    assert(
      afterState !== null && clocksAreIndependent(afterState.team.state),
      "saved state does not merge clocks"
    );

    // --- messages distinguish facilitator vs learner (Requirement 11.1) ---
    const learnerMessage = await appendMessage(team.id, {
      authorKind: "learner",
      authorUserId: userA,
      kind: "chat",
      body: "Here is my critique of criterion 1.",
      phase: "critique",
    });
    assertEqual(learnerMessage.authorKind, "learner", "learner message stores authorKind");
    assertEqual(learnerMessage.authorUserId, userA, "learner message stores authorUserId");
    assertEqual(learnerMessage.kind, "chat", "learner message stores kind");

    const facilitatorMessage = await appendMessage(team.id, {
      authorKind: "facilitator",
      authorUserId: null,
      kind: "prompt",
      body: "Critics, respond with agree or disagree plus reasoning.",
      phase: "critique",
    });
    assertEqual(
      facilitatorMessage.authorKind,
      "facilitator",
      "facilitator message stores authorKind"
    );
    assertEqual(
      facilitatorMessage.authorUserId,
      null,
      "facilitator message has no learner user id"
    );
    assert(
      facilitatorMessage.authorKind !== learnerMessage.authorKind,
      "facilitator is distinct from learner author kind"
    );

    const chatView = await getTeamForMember(team.id, userA);
    assertEqual(chatView?.messages.length, 2, "both messages persist on the team");
    assertEqual(
      chatView?.messages.map((m) => m.authorKind),
      ["learner", "facilitator"],
      "message author kinds round-trip"
    );
    assertEqual(
      chatView?.messages.map((m) => m.body),
      [
        "Here is my critique of criterion 1.",
        "Critics, respond with agree or disagree plus reasoning.",
      ],
      "message bodies round-trip"
    );

    // --- doc snapshots ---
    await saveDocSnapshot(team.id, "rubric", "1. Clarity — one-line rationale", userB);
    await saveDocSnapshot(team.id, "notes", "Shared notes from merge", userC);
    const docsView = await getTeamForMember(team.id, userA);
    const rubric = docsView?.docs.find((d) => d.docKind === "rubric");
    const notes = docsView?.docs.find((d) => d.docKind === "notes");
    assertEqual(rubric?.snapshotText, "1. Clarity — one-line rationale", "rubric snapshot round-trips");
    assertEqual(notes?.snapshotText, "Shared notes from merge", "notes snapshot round-trips");
    assertEqual(rubric?.updatedBy, userB, "rubric snapshot stores updatedBy");

    await saveDocSnapshot(team.id, "rubric", "1. Clarity — revised rationale", userA);
    const revised = (await getTeamForMember(team.id, userA))?.docs.find(
      (d) => d.docKind === "rubric"
    );
    assertEqual(revised?.snapshotText, "1. Clarity — revised rationale", "doc snapshot upserts by kind");

    // --- reject writes after lock (Requirement 10.4) ---
    const lockedState: TeamStateRecord = {
      ...nextState,
      phase: "finalized",
    };
    await saveTeamState(team.id, lockedState);
    const lockedView = await getTeamForMember(team.id, userA);
    assertEqual(lockedView?.team.phase, "finalized", "saveTeamState syncs phase to finalized");
    assert(
      lockedView?.team.finalizedAt !== null && lockedView?.team.finalizedAt !== undefined,
      "finalized team records finalizedAt"
    );

    await expectThrow(
      () => saveDocSnapshot(team.id, "rubric", "should not persist", userA),
      "saveDocSnapshot rejects writes on a locked group rubric"
    );
    const afterReject = (await getTeamForMember(team.id, userA))?.docs.find(
      (d) => d.docKind === "rubric"
    );
    assertEqual(
      afterReject?.snapshotText,
      "1. Clarity — revised rationale",
      "rejected snapshot leaves locked rubric unchanged"
    );

    await expectThrow(
      () => saveDocSnapshot(team.id, "notes", "should not persist either", userA),
      "saveDocSnapshot also rejects notes writes after lock"
    );

    // persistence file shape
    const raw = await fs.readFile(dataFile, "utf-8");
    const parsed = JSON.parse(raw) as {
      offerings?: unknown[];
      checkIns?: unknown[];
      teams?: unknown[];
      members?: unknown[];
      messages?: unknown[];
      docs?: unknown[];
    };
    assert(Array.isArray(parsed.offerings), "JSON store has offerings array");
    assert(Array.isArray(parsed.checkIns), "JSON store has checkIns array");
    assert(Array.isArray(parsed.teams), "JSON store has teams array");
    assert(Array.isArray(parsed.members), "JSON store has members array");
    assert(Array.isArray(parsed.messages), "JSON store has messages array");
    assert(Array.isArray(parsed.docs), "JSON store has docs array");
    assert(
      (parsed.offerings ?? []).some(
        (row) =>
          typeof row === "object" &&
          row !== null &&
          (row as { id?: string }).id === offering.id
      ),
      "created offering persisted in JSON file"
    );

    // unused waiter proves listQueuedCheckIns still works after lock
    await checkIn(offering2.id, userD);
    assertEqual(
      (await listQueuedCheckIns(offering2.id)).map((c) => c.userId).sort(),
      [userA, userD],
      "unrelated queued check-ins remain listed"
    );

    // =====================================================================
    // Task 1.3 — score privacy, reveal, agreements, absences, notices, addenda
    // =====================================================================
    const userE = "user_e";
    const userF = "user_f";
    const userG = "user_g";
    const scoreOffering = await createOffering(
      {
        title: "Scoring Privacy Offering",
        sampleAppId: "app_score",
        sampleRubric: "clarity\nevidence",
        deploymentBrief: "Score the artifact.",
        transcriptExcerpt: "Transcript for scoring.",
        aiProvider: "openai",
        aiModel: "gpt-4o-mini",
      },
      operatorId
    );
    await checkIn(scoreOffering.id, userE);
    await checkIn(scoreOffering.id, userF);
    await checkIn(scoreOffering.id, userG);
    const scoreTeam = await formTeam(scoreOffering.id, [userE, userF, userG]);

    // --- integer 1–5 only (Requirement 8.7); bounds from types, never redefined ---
    await expectThrow(
      () =>
        submitScores(scoreTeam.id, userE, [
          { criterionKey: "clarity", value: SCORE_MIN - 1 },
        ]),
      "submitScores rejects a value below SCORE_MIN"
    );
    await expectThrow(
      () =>
        submitScores(scoreTeam.id, userE, [
          { criterionKey: "clarity", value: SCORE_MAX + 1 },
        ]),
      "submitScores rejects a value above SCORE_MAX"
    );
    await expectThrow(
      () =>
        submitScores(scoreTeam.id, userE, [{ criterionKey: "clarity", value: 3.5 }]),
      "submitScores rejects a non-integer score"
    );
    await expectThrow(
      () =>
        submitScores(scoreTeam.id, userE, [{ criterionKey: "clarity", value: 0 }]),
      "submitScores rejects 0"
    );

    const memberAScores = [
      { criterionKey: "clarity", value: 4 },
      { criterionKey: "evidence", value: 2 },
    ];
    await submitScores(scoreTeam.id, userE, memberAScores);

    // --- pre-reveal member B cannot see member A values (8.2, 15.3) ---
    const viewBBeforeReveal = await getScoresForMember(scoreTeam.id, userF);
    assert(viewBBeforeReveal !== null, "member B can read their score sheet");
    assertEqual(
      viewBBeforeReveal?.revealedAt ?? null,
      null,
      "pre-reveal member read has null revealedAt"
    );
    assertEqual(
      viewBBeforeReveal?.ownScores ?? [],
      [],
      "member B has not submitted, so ownScores is empty"
    );
    assert(
      (viewBBeforeReveal?.submittedBy ?? []).includes(userE),
      "member B can see that member A submitted (boolean / id only)"
    );
    assertEqual(
      scoreValuesForUser(viewBBeforeReveal, userE),
      [],
      "pre-reveal member B view contains no member A score values"
    );
    assertEqual(
      collectCriterionValues(viewBBeforeReveal),
      [],
      "pre-reveal member B payload has zero criterion numeric values"
    );
    const dumpedB = JSON.stringify(viewBBeforeReveal);
    assert(
      !dumpedB.includes('"value":4') && !dumpedB.includes('"value":2'),
      "serialized pre-reveal member B read omits member A's 4 and 2"
    );
    assertEqual(
      (await getTeamForMember(scoreTeam.id, userF))?.team.scoresRevealedAt ?? null,
      null,
      "generic team read is still unrevealed after member B score read"
    );

    // operator / unfiltered read sees held values but does not reveal (15.3)
    const operatorHeld = await getScoresForOperator(scoreTeam.id);
    assert(
      (operatorHeld?.members ?? []).some(
        (m) =>
          m.userId === userE &&
          m.scores.some((s) => s.criterionKey === "clarity" && s.value === 4)
      ),
      "operator reader sees held member A scores"
    );
    assertEqual(
      operatorHeld?.revealedAt ?? null,
      null,
      "operator reader does not stamp scores_revealed_at"
    );
    const viewBAfterOperator = await getScoresForMember(scoreTeam.id, userF);
    assertEqual(
      collectCriterionValues(viewBAfterOperator),
      [],
      "operator viewing does not expose held scores to member B"
    );
    assertEqual(
      (await getTeamForMember(scoreTeam.id, userF))?.team.scoresRevealedAt ?? null,
      null,
      "operator read leaves the team unrevealed"
    );

    // --- gated reveal is a single team-level transaction ---
    await submitScores(scoreTeam.id, userF, [
      { criterionKey: "clarity", value: SCORE_MAX },
      { criterionKey: "evidence", value: 3 },
    ]);
    const revealedAt = new Date("2026-08-20T12:00:00.000Z");
    const revealed = await revealScores(scoreTeam.id, revealedAt);
    assertEqual(
      revealed.revealedAt,
      revealedAt.toISOString(),
      "revealScores returns the team-level revealedAt"
    );
    assert(
      revealed.members.some(
        (m) =>
          m.userId === userE &&
          m.scores.some((s) => s.criterionKey === "clarity" && s.value === 4)
      ),
      "revealScores is the cross-member reader and includes member A values"
    );
    assert(
      revealed.members.some(
        (m) =>
          m.userId === userF &&
          m.scores.some((s) => s.criterionKey === "clarity" && s.value === SCORE_MAX)
      ),
      "revealScores includes member B values"
    );

    const teamAfterReveal = await getTeamForMember(scoreTeam.id, userF);
    assertEqual(
      teamAfterReveal?.team.scoresRevealedAt ?? null,
      revealedAt.toISOString(),
      "revealScores persists scoresRevealedAt on the team in the same transaction"
    );
    const viewBAfterReveal = await getScoresForMember(scoreTeam.id, userF);
    assertEqual(
      viewBAfterReveal?.revealedAt ?? null,
      revealedAt.toISOString(),
      "post-reveal member B read reports revealedAt"
    );
    assert(
      scoreValuesForUser(viewBAfterReveal, userE).includes(4),
      "after reveal, member B can see member A's clarity value"
    );

    await expectThrow(
      () =>
        submitScores(scoreTeam.id, userG, [
          { criterionKey: "clarity", value: SCORE_MIN },
        ]),
      "submitScores rejects further writes after reveal"
    );

    // --- agreements (keyed by team/user/subject) ---
    await recordAgreement(scoreTeam.id, userE, "merge_complete");
    await recordAgreement(scoreTeam.id, userF, "merge_complete");
    await recordAgreement(scoreTeam.id, userE, "merge_complete");
    const agreements = await listAgreements(scoreTeam.id);
    assertEqual(
      agreements.filter((a) => a.subject === "merge_complete").length,
      2,
      "agreements are unique per team/user/subject"
    );
    await recordAgreement(scoreTeam.id, userE, "final_consensus");
    assertEqual(
      (await listAgreements(scoreTeam.id)).length,
      3,
      "same user may agree a different subject"
    );

    // --- absences (keyed by team/user/step) ---
    await recordAbsence(scoreTeam.id, userG, "scoring");
    await recordAbsence(scoreTeam.id, userG, "scoring");
    assertEqual(
      (await listAbsences(scoreTeam.id)).length,
      1,
      "absences are unique per team/user/step"
    );
    await recordAbsence(scoreTeam.id, userG, "discussion:clarity");
    assertEqual(
      (await listAbsences(scoreTeam.id)).length,
      2,
      "same user may be absent for a different step"
    );

    // --- notice log dedupe (Requirement 13.1) ---
    const notice: NoticeRecord = {
      offeringId: scoreOffering.id,
      teamId: scoreTeam.id,
      userId: userE,
      kind: "scores_revealed",
      dedupeKey: `${scoreTeam.id}:${userE}:scores_revealed:scoring`,
      channel: "console",
    };
    assertEqual(
      await hasNotice(notice.dedupeKey),
      false,
      "hasNotice is false before the key is recorded"
    );
    assertEqual(await recordNotice(notice), true, "recordNotice inserts a new dedupe key");
    assertEqual(
      await hasNotice(notice.dedupeKey),
      true,
      "hasNotice is true after recordNotice on the JSON fallback"
    );
    assertEqual(
      await recordNotice(notice),
      false,
      "recordNotice returns false when the dedupe key already exists"
    );

    // --- addendum only after lock; group artifact unchanged (Requirement 10.6) ---
    await expectThrow(
      () => addAddendum(scoreTeam.id, userE, "too early"),
      "addAddendum rejects writes before the group artifact is locked"
    );
    const rubricBeforeAddendum = (await getTeamForMember(team.id, userA))?.docs.find(
      (d) => d.docKind === "rubric"
    )?.snapshotText;
    await addAddendum(team.id, userA, "Personal note after lock");
    const afterAddendum = await getTeamForMember(team.id, userA);
    assertEqual(
      afterAddendum?.docs.find((d) => d.docKind === "rubric")?.snapshotText,
      rubricBeforeAddendum,
      "addendum leaves the locked group rubric unchanged"
    );
    const addenda = await listAddenda(team.id);
    assertEqual(addenda.length, 1, "addendum persists after lock");
    assertEqual(addenda[0]?.userId, userA, "addendum stores the author");
    assertEqual(addenda[0]?.body, "Personal note after lock", "addendum stores the body");

    const persisted = JSON.parse(await fs.readFile(dataFile, "utf-8")) as {
      scores?: unknown[];
      absences?: unknown[];
      agreements?: unknown[];
      notices?: unknown[];
      addenda?: unknown[];
    };
    assert(Array.isArray(persisted.scores), "JSON store has scores array");
    assert(Array.isArray(persisted.absences), "JSON store has absences array");
    assert(Array.isArray(persisted.agreements), "JSON store has agreements array");
    assert(Array.isArray(persisted.notices), "JSON store has notices array");
    assert(Array.isArray(persisted.addenda), "JSON store has addenda array");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nstore.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("store.selftest: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
