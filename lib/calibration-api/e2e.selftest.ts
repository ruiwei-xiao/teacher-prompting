/**
 * Scripted E2E + boundary selftest (Task 8.2).
 * Walks real handlers on the JSON fallback store with an injected clock.
 *
 * Run: npx tsx lib/calibration-api/e2e.selftest.ts
 *
 * Two-browser named cursors (7.2) are not asserted here: live dual-browser
 * needs Liveblocks keys. Wiring is proven in lib/calibration-ui/docs.selftest.ts.
 */
import fs from "fs/promises";
import path from "path";
import type { SpaceState } from "./space";
import { SCORE_MAX, SCORE_MIN } from "../calibration-store/types";
import { tryChatHref } from "../calibration-ui/artifacts";

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

const RUBRIC_SNAPSHOT = [
  "clarity: one-line rationale",
  "evidence: one-line rationale",
  "alignment: one-line rationale",
].join("\n");

const LIVE_SESSION_COPY =
  /35[-\s]?minute|live[-\s]?session|everyone must be online/i;
const EXTERNAL_AGENT_ROOM = /Bazaar|ClimateChangeAgent/i;
const WORKSPACE_WRITE =
  /\b(createWorkspace|addMember|setMemberRole|removeMember|transferOwnership|createInvite|acceptInviteByToken|acceptPendingEmailInvitesForUser)\s*\(/;
const WORKSPACE_STORE_IMPORT =
  /from\s+["'][^"']*workspace-store[^"']*["']/;
const LIVEBLOCKS_MARKERS = /liveblocks|@liveblocks|\byjs\b|CollaborationPlugin/i;

const ROOT = process.cwd();

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

async function listFiles(relativeDir: string, suffix: string): Promise<string[]> {
  const dir = path.join(ROOT, relativeDir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rel, suffix)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(rel);
    }
  }
  return files.sort();
}

function isProductionCalibrationSource(relativePath: string): boolean {
  if (relativePath.includes(".selftest.")) return false;
  if (relativePath.includes("compile-check")) return false;
  return true;
}

async function productionCalibrationSources(): Promise<string[]> {
  const groups = await Promise.all([
    listFiles("lib/calibration-api", ".ts"),
    listFiles("lib/calibration-engine", ".ts"),
    listFiles("lib/calibration-store", ".ts"),
    listFiles("lib/calibration-facilitator", ".ts"),
    listFiles("lib/calibration-notices", ".ts"),
    listFiles("lib/calibration-ui", ".ts"),
    listFiles("components/calibration", ".tsx"),
    listFiles("app/activity", ".tsx"),
    listFiles("app/api/calibration", ".ts"),
  ]);
  return groups.flat().filter(isProductionCalibrationSource);
}

async function calibrationUiSources(): Promise<string[]> {
  const groups = await Promise.all([
    listFiles("components/calibration", ".tsx"),
    listFiles("lib/calibration-ui", ".ts"),
    listFiles("app/activity", ".tsx"),
  ]);
  return groups.flat().filter(isProductionCalibrationSource);
}

function membershipIds(rows: Array<{ userId: string }>): string[] {
  return rows.map((row) => row.userId).sort();
}

function rubricTextFromView(
  view: { docs: Array<{ docKind: string; snapshotText: string }> } | null
): string {
  return view?.docs.find((doc) => doc.docKind === "rubric")?.snapshotText ?? "";
}

async function requireSpace(
  getSpace: typeof import("./space").getSpace,
  userId: string,
  teamId: string,
  now: Date,
  message: string
): Promise<SpaceState> {
  const result = await getSpace(userId, teamId, { now });
  assert(result.ok === true && result.status === 200, `${message} → 200`);
  if (!result.ok) {
    throw new Error(`${message} failed: ${result.status}`);
  }
  return result.body;
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;

  const tempDir = path.join(process.cwd(), ".data", "calibration-api-e2e-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");
  process.env.CALIBRATION_NOTICES_LOG = path.join(tempDir, "notices.log");

  const { createOffering } = await import("./offerings");
  const { postCheckIn } = await import("./queue");
  const { getSpace, postMessage, postDocSnapshot } = await import("./space");
  const { postScores, postAgreement, postAddendum, rubricCriterionKeys } =
    await import("./scores");
  const { getTeam, getTeamForMember, hasNotice, listAddenda } = await import(
    "../calibration-store/store"
  );
  const { createWorkspace, listMembers, listWorkspacesForUser } = await import(
    "../workspace-store/store"
  );

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

    // --- 2.2 / 5.1: three check-ins form a team, recap + formation notices ---
    await postCheckIn(learnerA, offering!.id, { now });
    await postCheckIn(learnerB, offering!.id, { now });
    const third = await postCheckIn(learnerC, offering!.id, { now });
    assert(third.ok === true, "third check-in ok");
    const teamId = third.ok ? third.body.teamId : null;
    assert(
      typeof teamId === "string" && teamId.length > 0,
      "third check-in forms a team of exactly three (2.2)"
    );
    if (third.ok) {
      assertEqual(third.body.status, "matched", "third check-in status is matched");
      assertEqual(third.body.of, 3, "formed response still reports of 3");
    }

    const formed = await requireSpace(
      getSpace,
      learnerA,
      teamId!,
      now,
      "member GET after formation"
    );
    assertEqual(formed.phase, "critique", "formed team opens critique immediately");
    assert(
      formed.messages.some(
        (message) =>
          message.authorKind === "facilitator" &&
          /calibrate a shared rubric/i.test(message.body)
      ),
      "recap message is present after formation (5.2)"
    );
    assert(
      formed.recap.messages.some((message) =>
        /calibrate a shared rubric/i.test(message.body)
      ),
      "recap payload includes the kickoff recap"
    );

    const team = await getTeam(teamId!);
    const memberUserIds = team?.state.memberUserIds ?? [];
    assertEqual(memberUserIds.length, 3, "formed team has three memberUserIds");
    assertEqual(
      [...memberUserIds].sort(),
      [learnerA, learnerB, learnerC].sort(),
      "formed team members are the three check-ins"
    );
    for (const userId of memberUserIds) {
      const recorded = await hasNotice(
        `${memberUserIds.join(",")}:${userId}:team_formed`
      );
      assert(recorded, `team_formed notice recorded for ${userId} (5.1)`);
    }

    // --- 6.1: three critique rounds; each member presents once ---
    const presented = new Set<string>();
    let space = formed;
    for (let round = 1; round <= 3; round += 1) {
      space = await requireSpace(
        getSpace,
        learnerA,
        teamId!,
        now,
        `GET before critique round ${round}`
      );
      assertEqual(space.phase, "critique", `round ${round} is still critique`);
      assertEqual(space.round, round, `space.round is ${round}`);
      const presenter = space.presenterUserId;
      const critics = space.criticUserIds;
      assert(
        typeof presenter === "string" && presenter.length > 0,
        `round ${round} has a presenter`
      );
      assertEqual(critics.length, 2, `round ${round} has exactly two critics`);
      assert(
        !presented.has(presenter!),
        `round ${round} presenter has not already presented`
      );
      presented.add(presenter!);

      const presenterPost = await postMessage(
        presenter!,
        teamId!,
        { body: `Presenter critique for round ${round}` },
        { now }
      );
      assertEqual(
        presenterPost.status,
        200,
        `presenter POST message round ${round} → 200`
      );
      assert(
        presenterPost.ok === true &&
          presenterPost.body.space.critiqueStage === "critic_response",
        `round ${round} advances to critic_response after presenter post`
      );

      for (const critic of critics) {
        const criticPost = await postMessage(
          critic,
          teamId!,
          { body: `Critic response for round ${round} from ${critic}` },
          { now }
        );
        assertEqual(
          criticPost.status,
          200,
          `critic ${critic} POST message round ${round} → 200`
        );
        if (criticPost.ok) {
          space = criticPost.body.space;
        }
      }
    }
    assertEqual(presented.size, 3, "each of the three members presented once (6.1)");
    assertEqual(
      [...presented].sort(),
      [learnerA, learnerB, learnerC].sort(),
      "presenter set is the three members"
    );
    assertEqual(space.phase, "merge", "third critique round opens merge");

    // --- merge: snapshot with 3–4 criteria, then merge_complete from all present ---
    const snapshot = await postDocSnapshot(
      learnerA,
      teamId!,
      "rubric",
      { text: RUBRIC_SNAPSHOT },
      { now }
    );
    assertEqual(snapshot.status, 200, "merge POST rubric snapshot → 200");
    const criterionKeys = rubricCriterionKeys(RUBRIC_SNAPSHOT);
    assert(
      criterionKeys.length >= 3 && criterionKeys.length <= 4,
      "snapshot yields 3–4 scoring keys"
    );
    assertEqual(
      criterionKeys,
      ["clarity", "evidence", "alignment"],
      "scoring keys match the posted rubric"
    );

    for (const userId of [learnerA, learnerB, learnerC]) {
      const agreed = await postAgreement(
        userId,
        teamId!,
        { subject: "merge_complete" },
        { now }
      );
      assertEqual(agreed.status, 200, `${userId} merge_complete → 200`);
      if (agreed.ok) {
        space = agreed.body;
      }
    }
    assertEqual(space.phase, "scoring", "all-present merge_complete opens scoring");

    // --- 8.4 / 9.2: blind 1–5 scores with ≥2 spread, then reveal ---
    const scoresByMember: Record<string, { criterionKey: string; value: number }[]> =
      {
        [learnerA]: [
          { criterionKey: "clarity", value: SCORE_MIN },
          { criterionKey: "evidence", value: 3 },
          { criterionKey: "alignment", value: 4 },
        ],
        [learnerB]: [
          { criterionKey: "clarity", value: 3 },
          { criterionKey: "evidence", value: 3 },
          { criterionKey: "alignment", value: 4 },
        ],
        [learnerC]: [
          { criterionKey: "clarity", value: SCORE_MAX },
          { criterionKey: "evidence", value: 3 },
          { criterionKey: "alignment", value: 4 },
        ],
      };
    const claritySpread = SCORE_MAX - SCORE_MIN;
    assert(claritySpread >= 2, "clarity scores are designed with spread ≥ 2 (9.2)");

    const firstScore = await postScores(
      learnerA,
      teamId!,
      { scores: scoresByMember[learnerA] },
      { now }
    );
    assertEqual(firstScore.status, 200, "member A POST scores → 200");
    const midSpace = await requireSpace(
      getSpace,
      learnerB,
      teamId!,
      now,
      "member B GET after first score"
    );
    assertEqual(midSpace.revealedAt, null, "scores stay unrevealed until all present submit");

    const secondScore = await postScores(
      learnerB,
      teamId!,
      { scores: scoresByMember[learnerB] },
      { now }
    );
    assertEqual(secondScore.status, 200, "member B POST scores → 200");

    const lastScore = await postScores(
      learnerC,
      teamId!,
      { scores: scoresByMember[learnerC] },
      { now }
    );
    assertEqual(lastScore.status, 200, "member C POST scores → 200 (last present)");

    space = await requireSpace(
      getSpace,
      learnerA,
      teamId!,
      now,
      "member GET after last present submission"
    );
    assert(
      space.revealedAt !== null && space.revealedAt.length > 0,
      "reveal happens on last present submission (8.4)"
    );
    const persisted = await getTeam(teamId!);
    assert(
      persisted?.scoresRevealedAt === space.revealedAt,
      "space.revealedAt matches the stored reveal stamp"
    );
    assert(
      persisted?.state.flaggedCriteria.includes("clarity") === true,
      "clarity is flagged for discussion (spread ≥ 2) (9.2)"
    );
    assert(
      space.phase === "discussion" || space.phase === "consensus",
      "reveal with a ≥2 spread leaves scoring"
    );

    // --- discussion of the flagged criterion, then final_consensus lock (10.2) ---
    if (space.phase === "discussion") {
      const namedScorer =
        persisted?.state.perPersonDeadlines.find((deadline) =>
          deadline.stepKey.startsWith("discussion:")
        )?.userId ?? learnerA;
      const discussed = await postMessage(
        namedScorer,
        teamId!,
        { body: "On clarity: the transcript shows uneven evidence, so I scored lower." },
        { now }
      );
      assertEqual(discussed.status, 200, "discussion POST on flagged criterion → 200");
      if (discussed.ok) {
        space = discussed.body.space;
      }
      if (space.phase === "discussion") {
        for (const userId of [learnerA, learnerB, learnerC]) {
          if (userId === namedScorer) continue;
          const follow = await postMessage(
            userId,
            teamId!,
            { body: `Follow-up on clarity from ${userId}` },
            { now }
          );
          assertEqual(follow.status, 200, `${userId} discussion follow-up → 200`);
          if (follow.ok) {
            space = follow.body.space;
          }
        }
      }
    }
    assertEqual(space.phase, "consensus", "flagged-criterion discussion reaches consensus");

    for (const userId of [learnerA, learnerB, learnerC]) {
      const agreed = await postAgreement(
        userId,
        teamId!,
        { subject: "final_consensus" },
        { now }
      );
      assertEqual(agreed.status, 200, `${userId} final_consensus → 200`);
      if (agreed.ok) {
        space = agreed.body;
      }
    }
    assertEqual(space.phase, "finalized", "all-present final_consensus locks the team (10.2)");
    assert(space.locked === true, "space.locked is true after consensus lock");

    const lockedTeam = await getTeam(teamId!);
    assertEqual(
      lockedTeam?.state.phase,
      "finalized",
      "persisted phase is finalized"
    );
    assert(
      lockedTeam?.finalizedAt !== null && lockedTeam?.finalizedAt !== undefined,
      "team finalizedAt is set"
    );

    const viewBeforeAddendum = await getTeamForMember(teamId!, learnerA);
    const rubricBefore = rubricTextFromView(viewBeforeAddendum);
    assertEqual(
      rubricBefore,
      RUBRIC_SNAPSHOT,
      "locked group rubric still matches the merge snapshot"
    );

    const addendum = await postAddendum(
      learnerA,
      teamId!,
      { body: "Personal note after lock: I still weigh clarity more strictly." },
      { now }
    );
    assertEqual(addendum.status, 200, "addendum POST after lock → 200 (10.6)");
    assert(
      addendum.ok === true &&
        addendum.body.body.includes("Personal note after lock"),
      "addendum returns the personal note"
    );

    const addenda = await listAddenda(teamId!);
    assert(
      addenda.some(
        (row) =>
          row.userId === learnerA && row.body.includes("Personal note after lock")
      ),
      "addendum is persisted"
    );
    const addendumEdit = await postAddendum(
      learnerA,
      teamId!,
      { body: "Edited personal note after lock." },
      { now }
    );
    assertEqual(addendumEdit.status, 200, "addendum edit after lock → 200");
    assert(
      addendum.ok === true &&
        addendumEdit.ok === true &&
        addendumEdit.body.id === addendum.body.id &&
        addendumEdit.body.body.includes("Edited personal note"),
      "a second POST from the same learner updates the same addendum"
    );
    assertEqual(
      (await listAddenda(teamId!)).filter((row) => row.userId === learnerA).length,
      1,
      "the learner still has exactly one addendum"
    );
    const viewAfterAddendum = await getTeamForMember(teamId!, learnerA);
    assertEqual(
      rubricTextFromView(viewAfterAddendum),
      rubricBefore,
      "group rubric text is unchanged after addendum"
    );

    const lockedSnap = await postDocSnapshot(
      learnerA,
      teamId!,
      "rubric",
      { text: "should not replace the locked rubric" },
      { now }
    );
    assertEqual(lockedSnap.status, 409, "POST snapshot after lock → 409");
    const viewAfterRejectedEdit = await getTeamForMember(teamId!, learnerA);
    assertEqual(
      rubricTextFromView(viewAfterRejectedEdit),
      RUBRIC_SNAPSHOT,
      "rejected snapshot leaves the locked rubric unchanged"
    );

    // --- 16.2 / 15.5: joining a team does not write Workspace membership ---
    assertEqual(
      await listWorkspacesForUser(learnerA),
      learnerWorkspacesBefore.a,
      "learner A Workspace list unchanged after full flow (16.2, 15.5)"
    );
    assertEqual(
      await listWorkspacesForUser(learnerB),
      learnerWorkspacesBefore.b,
      "learner B Workspace list unchanged after full flow (16.2, 15.5)"
    );
    assertEqual(
      await listWorkspacesForUser(learnerC),
      learnerWorkspacesBefore.c,
      "learner C Workspace list unchanged after full flow (16.2, 15.5)"
    );
    assertEqual(
      membershipIds(await listMembers(workspace.id)),
      workspaceMembersBefore,
      "existing Workspace membership list is unchanged after full flow (16.2)"
    );

    // --- Boundary: source + helper contracts ---
    const artifactsPanel = await readSource("components/calibration/ArtifactsPanel.tsx");
    const artifactsHelper = await readSource("lib/calibration-ui/artifacts.ts");
    const chatPanel = await readSource("components/calibration/GroupChatPanel.tsx");
    const scoreSheet = await readSource("components/calibration/ScoreSheet.tsx");
    const readyBar = await readSource("components/calibration/ReadyBar.tsx");
    const teamPage = await readSource("app/activity/[offeringId]/team/[teamId]/page.tsx");
    const botPane = await readSource("components/calibration/ActivityBotPane.tsx");

    assert(
      !artifactsPanel.includes("tryChatHref") && !/try chat/i.test(artifactsPanel),
      "ArtifactsPanel does not duplicate Try chat (12.3 lives in the Try pane)"
    );
    assert(
      botPane.includes("sampleChatApiHref") || botPane.includes("sample-chat"),
      "Try pane chats with the sample bot without a prompt override (12.3)"
    );
    assert(
      !botPane.includes("/api/chat"),
      "Try pane does not use the published /api/chat gate (12.3)"
    );
    assert(
      /try the sample bot/i.test(botPane),
      "Try pane is labeled Try the sample bot"
    );
    assert(
      !artifactsPanel.includes("/app/") &&
        !artifactsPanel.toLowerCase().includes("href={\"/editor") &&
        !artifactsPanel.includes("href=\"/editor"),
      "ArtifactsPanel has no editor href (12.3, 16.1)"
    );
    assertEqual(
      tryChatHref({ id: "app_sample_bot", publicSlug: "sample-tutor" }),
      "/chat/sample-tutor",
      "try-chat helper is /chat/{slug} with no query (12.3)"
    );
    assert(
      artifactsHelper.includes('return `/chat/${slug || id}`') ||
        /`\/chat\/\$\{/.test(artifactsHelper),
      "try-chat helper builds a /chat/ path"
    );
    const slugHref = tryChatHref({ id: "app_sample_bot", publicSlug: "sample-tutor" });
    const idHref = tryChatHref({ id: "app_sample_bot" });
    assert(
      slugHref.startsWith("/chat/") &&
        idHref.startsWith("/chat/") &&
        !slugHref.includes("?") &&
        !idHref.includes("?"),
      "try-chat has no prompt-override query (12.3)"
    );
    assert(
      !/promptOverride|systemPrompt=|overridePrompt/i.test(artifactsPanel + botPane),
      "sample-bot try-chat does not apply a prompt override (12.3)"
    );
    assert(
      !teamPage.includes("/app/") && !teamPage.toLowerCase().includes("editor"),
      "team page has no Solo editor links (16.1)"
    );

    const uiSources = await calibrationUiSources();
    for (const file of uiSources) {
      const source = await readSource(file);
      assert(
        !LIVE_SESSION_COPY.test(source),
        `${file} has no live-session / 35-minute mode copy (16.4)`
      );
    }

    const prodSources = await productionCalibrationSources();
    for (const file of prodSources) {
      const source = await readSource(file);
      assert(
        !EXTERNAL_AGENT_ROOM.test(source),
        `${file} has no Bazaar / ClimateChangeAgent / external agent room import (16.3)`
      );
      assert(
        !WORKSPACE_STORE_IMPORT.test(source),
        `${file} does not import workspace-store (16.2, 15.5)`
      );
      assert(
        !WORKSPACE_WRITE.test(source),
        `${file} does not write Workspace membership (16.2, 15.5)`
      );
    }

    assert(
      !LIVEBLOCKS_MARKERS.test(chatPanel),
      "GroupChatPanel has no Liveblocks (7.5)"
    );
    assert(
      !LIVEBLOCKS_MARKERS.test(scoreSheet),
      "ScoreSheet has no Liveblocks (7.5)"
    );
    assert(
      !LIVEBLOCKS_MARKERS.test(artifactsPanel),
      "ArtifactsPanel has no Liveblocks (7.5)"
    );
    assert(
      readyBar.includes("agreementsApiHref") || readyBar.includes("/agreements"),
      "ReadyBar posts merge/consensus agreement through the agreements endpoint"
    );
    assert(
      readyBar.includes("DELETE") &&
        (readyBar.includes("undoReadyLabel") || /Undo Ready/.test(readyBar)),
      "ReadyBar can undo Ready before the phase advances"
    );
    assert(
      !LIVEBLOCKS_MARKERS.test(readyBar),
      "ReadyBar has no Liveblocks (7.5)"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api e2e (check-in→lock→addendum) + boundary source/API checks"
  );
}

void main();
