/**
 * Self-test: team space shell helpers, polling chat, recap, and role labels (Task 5.2).
 * Run: npx tsx lib/calibration-ui/space.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  SPACE_POLL_MS,
  SPACE_VISIBLE_POLL_MS,
  applyPostedMessage,
  canCompose,
  currentRoundRoleLabel,
  isFacilitatorMessage,
  isReturnVisitRecap,
  messagePostBody,
  messagesApiHref,
  parsePostedMessageResponse,
  parseSpaceResponse,
  recapMessages,
  spaceApiHref,
} from "./space";

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

const learnerMessage = {
  id: "m1",
  authorKind: "learner" as const,
  authorUserId: "u-alice",
  body: "Here is my critique.",
  createdAt: "2026-08-15T12:00:00.000Z",
};

const facilitatorMessage = {
  id: "m2",
  authorKind: "facilitator" as const,
  authorUserId: null,
  body: "Alice is the Presenter for round 1.",
  createdAt: "2026-08-15T12:01:00.000Z",
};

const critiqueSpace = {
  role: "member" as const,
  phase: "critique",
  round: 1,
  critiqueStage: "presenter_share",
  presenterUserId: "u-alice",
  criticUserIds: ["u-bob", "u-cara"],
  recap: {
    since: "2026-08-14T09:00:00.000Z",
    messages: [facilitatorMessage],
  },
  messages: [facilitatorMessage, learnerMessage],
  locked: false,
  ownScores: [],
  submittedBy: [],
  revealedAt: null,
  matrix: [],
  labels: {},
  avatars: {},
};

async function main(): Promise<void> {
  // --- Poll interval is 10s (3.3 — no co-presence; sessions converge by polling) ---
  assertEqual(SPACE_POLL_MS, 10_000, "poll interval is 10000");
  assertEqual(
    SPACE_VISIBLE_POLL_MS,
    3_000,
    "visible-tab poll is 3000 so new chat arrives without a reload"
  );

  assertEqual(
    spaceApiHref("team_9"),
    "/api/calibration/teams/team_9",
    "space GET is /api/calibration/teams/{teamId}"
  );
  assertEqual(
    messagesApiHref("team_9"),
    "/api/calibration/teams/team_9/messages",
    "chat POST is /api/calibration/teams/{teamId}/messages"
  );
  assertEqual(
    messagePostBody("  hello team  "),
    { body: "hello team" },
    "posting uses { body } to the messages endpoint"
  );

  // --- Presenter/Critic only in the current critique round (6.2, 15.2) ---
  assertEqual(
    currentRoundRoleLabel(critiqueSpace, "u-alice"),
    "Presenter",
    "current presenter is labeled Presenter"
  );
  assertEqual(
    currentRoundRoleLabel(critiqueSpace, "u-bob"),
    "Critic",
    "current critic is labeled Critic"
  );
  assertEqual(
    currentRoundRoleLabel(critiqueSpace, "u-cara"),
    "Critic",
    "second critic is labeled Critic"
  );
  assertEqual(
    currentRoundRoleLabel(critiqueSpace, "u-dana"),
    null,
    "unassigned user has no invented role"
  );

  const mergeSpace = { ...critiqueSpace, phase: "merge", presenterUserId: "u-alice" };
  assertEqual(
    currentRoundRoleLabel(mergeSpace, "u-alice"),
    null,
    "Presenter label is hidden outside critique"
  );
  assertEqual(
    currentRoundRoleLabel({ ...critiqueSpace, phase: "scoring" }, "u-bob"),
    null,
    "Critic label is hidden in scoring"
  );
  assertEqual(
    currentRoundRoleLabel({ ...critiqueSpace, phase: "discussion" }, "u-alice"),
    null,
    "no critique roles in discussion"
  );
  assertEqual(
    currentRoundRoleLabel({ ...critiqueSpace, phase: "consensus" }, "u-alice"),
    null,
    "no critique roles in consensus"
  );
  assertEqual(
    currentRoundRoleLabel({ ...critiqueSpace, phase: "finalized" }, "u-alice"),
    null,
    "no critique roles after lock"
  );

  const role = currentRoundRoleLabel(critiqueSpace, "u-alice");
  assert(role === "Presenter" || role === "Critic" || role === null, "role labels are only Presenter or Critic");
  assert(role !== "Scribe" && role !== "Moderator" && role !== "Note-taker", "no extra learner roles");

  // --- Facilitator vs learner (11.1) ---
  assert(isFacilitatorMessage(facilitatorMessage), "facilitator authorKind is distinct");
  assert(!isFacilitatorMessage(learnerMessage), "learner messages are not facilitator");

  // --- Recap since last participation is surfaced (3.2) ---
  assertEqual(
    recapMessages(critiqueSpace).map((message) => message.body),
    ["Alice is the Presenter for round 1."],
    "recap messages are surfaced"
  );
  assertEqual(
    recapMessages({
      ...critiqueSpace,
      recap: { since: null, messages: [facilitatorMessage, learnerMessage] },
    }).length,
    2,
    "first-visit recap still surfaces accumulated messages"
  );
  assertEqual(
    isReturnVisitRecap(critiqueSpace),
    true,
    "return visit with new messages shows the recap banner"
  );
  assertEqual(
    isReturnVisitRecap({
      ...critiqueSpace,
      recap: { since: null, messages: [facilitatorMessage] },
    }),
    false,
    "first visit does not show the full-width recap banner"
  );

  // --- Operator is read-only (14.6); members can compose ---
  assertEqual(canCompose(critiqueSpace), true, "member can use the chat composer");
  assertEqual(
    canCompose({ ...critiqueSpace, role: "operator" }),
    false,
    "operator cannot compose as a learner"
  );

  // --- Parse space GET and posted-message responses ---
  const parsed = parseSpaceResponse(200, {
    ...critiqueSpace,
    docs: [],
    ownScores: [],
    submittedBy: [],
    revealedAt: null,
    matrix: [],
  });
  assert(parsed.ok === true, "200 space GET is ok");
  if (parsed.ok) {
    assertEqual(parsed.space.phase, "critique", "parsed space keeps phase");
    assertEqual(parsed.space.presenterUserId, "u-alice", "parsed space keeps presenter");
    assertEqual(parsed.space.recap.messages.length, 1, "parsed space keeps recap");
  }
  const denied = parseSpaceResponse(403, { error: "Forbidden" });
  assert(denied.ok === false, "403 space GET is not ok");

  const posted = parsePostedMessageResponse(200, {
    message: learnerMessage,
    space: {
      ...critiqueSpace,
      messages: [facilitatorMessage, learnerMessage],
    },
  });
  assert(posted.ok === true, "200 message POST is ok");
  if (posted.ok) {
    const next = applyPostedMessage(critiqueSpace, posted);
    assertEqual(next.messages.length, 2, "applyPostedMessage uses the returned space");
    assertEqual(next.messages[1]?.body, "Here is my critique.", "posted body lands in space");
  }

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/space.ts");
  const layoutPath = path.join(
    process.cwd(),
    "components/calibration/SpaceLayout.tsx"
  );
  const chatPath = path.join(
    process.cwd(),
    "components/calibration/GroupChatPanel.tsx"
  );
  const teamPagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/team/[teamId]/page.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const layoutSource = await fs.readFile(layoutPath, "utf8").catch(() => "");
  const chatSource = await fs.readFile(chatPath, "utf8").catch(() => "");
  const teamPageSource = await fs.readFile(teamPagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/space.ts exists");
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store") &&
      !helpersSource.includes("calibration-api"),
    "space helpers do not import engine/store/api"
  );

  assert(layoutSource.includes("SpaceLayout"), "SpaceLayout component exists");
  assert(
    layoutSource.includes("SPACE_POLL_MS") ||
      layoutSource.includes("10_000") ||
      layoutSource.includes("10000"),
    "SpaceLayout uses the 10s poll interval"
  );
  assert(
    layoutSource.includes("SPACE_VISIBLE_POLL_MS") ||
      layoutSource.includes("visibilitychange"),
    "SpaceLayout polls faster while the tab is visible"
  );
  assert(
    layoutSource.includes("spaceApiHref") ||
      layoutSource.includes("/api/calibration/teams/"),
    "SpaceLayout polls GET /api/calibration/teams/[teamId]"
  );
  assert(
    layoutSource.includes('addEventListener("focus"') ||
      layoutSource.includes("addEventListener('focus'") ||
      layoutSource.includes("addEventListener(`focus`"),
    "SpaceLayout refetches on window focus"
  );
  assert(
    layoutSource.includes("setInterval") || layoutSource.includes("SPACE_POLL_MS"),
    "SpaceLayout polls on an interval"
  );
  assert(
    layoutSource.toLowerCase().includes("recap") ||
      layoutSource.includes("recapMessages") ||
      layoutSource.includes("Since you last"),
    "SpaceLayout treats group chat as the recap-since-last-visit"
  );
  assert(
    layoutSource.includes("GroupChatPanel"),
    "SpaceLayout composes GroupChatPanel"
  );
  assert(
    layoutSource.includes("ActivityBotPane"),
    "SpaceLayout embeds the sample bot in the editor-style pane"
  );
  assert(
    layoutSource.includes("Shared documents") ||
      layoutSource.includes("SharedDocEditor"),
    "SpaceLayout has a shared-documents region"
  );
  assert(
    layoutSource.includes("ArtifactsPanel"),
    "SpaceLayout composes ArtifactsPanel"
  );
  assert(
    layoutSource.includes("ScoreSheet"),
    "SpaceLayout composes ScoreSheet"
  );
  assert(
    /shared|rubric|notes|document/i.test(layoutSource),
    "SpaceLayout has a shared-documents region"
  );
    assert(
      layoutSource.includes("SharedDocEditor"),
      "SpaceLayout composes SharedDocEditor"
    );
    assert(
      layoutSource.includes("ReadyBar"),
      "SpaceLayout composes ReadyBar on the docs pane"
    );
  assert(
    !/!deliverableLocked\s*&&\s*\(?\s*<SharedDocEditor/.test(layoutSource),
    "SpaceLayout still mounts SharedDocEditor when locked"
  );
  assert(
    !layoutSource.includes("calibration-engine") &&
      !layoutSource.includes("calibration-store"),
    "SpaceLayout does not import engine/store"
  );
  assert(
    !layoutSource.toLowerCase().includes("liveblocks") &&
      !layoutSource.toLowerCase().includes("yjs"),
    "SpaceLayout has no collaborative cursors"
  );

  assert(chatSource.includes("GroupChatPanel"), "GroupChatPanel component exists");
  assert(
    chatSource.includes("<textarea") || chatSource.includes("<textarea "),
    "composer is a plain textarea"
  );
  assert(
    chatSource.includes("Enter") && chatSource.includes("Shift"),
    "group chat sends on Enter and inserts a line on Shift+Enter"
  );
  assert(
    chatSource.includes("isComposing"),
    "group chat does not send while IME is composing"
  );
  assert(
    !chatSource.toLowerCase().includes("liveblocks") &&
      !chatSource.toLowerCase().includes("yjs") &&
      !chatSource.toLowerCase().includes("cursor"),
    "GroupChatPanel has no Liveblocks/Yjs/collaborative cursors"
  );
  assert(
    chatSource.includes("onOpenScores") ||
      chatSource.includes("Open Score") ||
      chatSource.includes("OPEN_SCORE_LABEL"),
    "group chat can open Score from a facilitator prompt"
  );
  assert(
    chatSource.includes("onOpenDeliverable") ||
      chatSource.includes("Open Final") ||
      chatSource.includes("OPEN_FINAL_LABEL"),
    "group chat can open Final from a facilitator prompt"
  );
  assert(
    chatSource.includes("messagePostBody") ||
      chatSource.includes("{ body") ||
      chatSource.includes("body:"),
    "composer posts { body }"
  );
  assert(
    chatSource.includes("isFacilitatorMessage") ||
      chatSource.includes("facilitator"),
    "chat distinguishes facilitator messages"
  );
  assert(
    chatSource.includes("canCompose") ||
      chatSource.includes("operator") ||
      chatSource.includes("read-only") ||
      chatSource.includes("read only"),
    "operator cannot use the composer"
  );
  assert(
    !chatSource.includes("calibration-engine") &&
      !chatSource.includes("calibration-store"),
    "GroupChatPanel does not import engine/store"
  );

  assert(teamPageSource.includes("SpaceLayout"), "team page renders SpaceLayout");
  assert(
    teamPageSource.includes("SpaceLayout") &&
      !teamPageSource.includes("AppShell"),
    "team page uses the full-height space chrome instead of AppShell"
  );
  assert(
    teamPageSource.includes("SignInPanel"),
    "team page sends unauthenticated visitors to sign-in"
  );
  assert(
    !teamPageSource.includes("ArtifactsPanel") &&
      !teamPageSource.includes("ScoreSheet") &&
      !teamPageSource.includes("SharedDocEditor"),
    "team page does not implement later panels"
  );

  const uiSources = [helpersSource, layoutSource, chatSource, teamPageSource]
    .join("\n")
    .toLowerCase();
  assert(
    !uiSources.includes("35-minute") &&
      !uiSources.includes("35 minute") &&
      !uiSources.includes("live session") &&
      !uiSources.includes("livesession"),
    "no 35-minute / live-session copy in space components"
  );
  assert(
    !uiSources.includes("everyone must be online") &&
      !uiSources.includes("waiting for all three") &&
      !uiSources.includes("co-presence"),
    "no co-presence requirement is offered"
  );

  if (failures > 0) {
    console.error(`\nspace.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("space.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("space.selftest crashed:", err);
  process.exit(1);
});
