/**
 * Self-test: read-only artifacts panel and try-chat link (Task 5.3).
 * Run: npx tsx lib/calibration-ui/artifacts.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  buildArtifactsView,
  isReadOnlyArtifactView,
  tryChatHref,
} from "./artifacts";

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
  // --- try-chat is the published student chat, never an editor (12.3) ---
  assertEqual(
    tryChatHref({ id: "app_1", publicSlug: "sample-tutor" }),
    "/chat/sample-tutor",
    "try-chat prefers publicSlug"
  );
  assertEqual(
    tryChatHref({ id: "app_1" }),
    "/chat/app_1",
    "try-chat falls back to app id"
  );
  assertEqual(
    tryChatHref({ id: "app_1", publicSlug: "" }),
    "/chat/app_1",
    "empty publicSlug falls back to app id"
  );
  assertEqual(
    tryChatHref({ id: "app_1", publicSlug: null }),
    "/chat/app_1",
    "null publicSlug falls back to app id"
  );

  const slugHref = tryChatHref({ id: "app_1", publicSlug: "sample-tutor" });
  const idHref = tryChatHref({ id: "app_1" });
  assert(!slugHref.includes("?"), "slug try-chat href has no query string");
  assert(!idHref.includes("?"), "id try-chat href has no query string");
  assert(
    !slugHref.includes("prompt") && !idHref.includes("prompt"),
    "try-chat href has no prompt-override query"
  );
  assert(
    !slugHref.includes("/app/") && !idHref.includes("/app/"),
    "try-chat is not an /app/ editor path"
  );
  assert(
    !slugHref.includes("editor") && !idHref.includes("editor"),
    "try-chat href is not an editor href"
  );

  // --- View model carries the three artifact texts (12.1, 12.4) ---
  const view = buildArtifactsView({
    sampleRubric: "Criterion 1: clarity",
    systemPrompt: "You are a patient lab tutor.",
    deploymentBrief: "Use this bot in week-3 lab.",
    transcriptExcerpt: "Student: help\nTutor: walk me through the setup.",
    sampleAppId: "app_1",
    publicSlug: "sample-tutor",
  });
  assertEqual(
    view.sampleRubric,
    "Criterion 1: clarity",
    "view model includes sample rubric text"
  );
  assertEqual(
    view.systemPrompt,
    "You are a patient lab tutor.",
    "view model includes system prompt text"
  );
  assertEqual(
    view.deploymentBrief,
    "Use this bot in week-3 lab.",
    "view model includes deployment brief text"
  );
  assertEqual(
    view.transcriptExcerpt,
    "Student: help\nTutor: walk me through the setup.",
    "view model includes transcript excerpt text"
  );
  assertEqual(view.sampleAppId, "app_1", "view model keeps sampleAppId");
  assertEqual(view.tryChatHref, "/chat/sample-tutor", "view model try-chat uses slug");
  assert(!view.tryChatHref.includes("?"), "view model try-chat has no query");

  const record = view as Record<string, unknown>;
  assert(!("model" in record), "view model has no model setting");
  assert(!("provider" in record), "view model has no provider setting");
  assert(!("apiKey" in record), "view model has no apiKey");
  assert(!("variability" in record), "view model has no variability");
  assert(!("builderState" in record), "view model has no builderState");
  assert(!("editorHref" in record), "view model has no editor href");
  assert(isReadOnlyArtifactView(view), "built view is a read-only artifact view");

  const noSlugView = buildArtifactsView({
    sampleRubric: "C1",
    systemPrompt: "Be concise.",
    deploymentBrief: "Brief",
    transcriptExcerpt: "Transcript",
    sampleAppId: "app_9",
    publicSlug: null,
  });
  assertEqual(
    noSlugView.tryChatHref,
    "/chat/app_9",
    "view model try-chat falls back to sampleAppId"
  );
  assert(isReadOnlyArtifactView(noSlugView), "fallback view is still read-only");

  // --- Source: helpers stay client-safe and never point at the Solo editor ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/artifacts.ts");
  const panelPath = path.join(
    process.cwd(),
    "components/calibration/ArtifactsPanel.tsx"
  );
  const layoutPath = path.join(
    process.cwd(),
    "components/calibration/SpaceLayout.tsx"
  );
  const teamPagePath = path.join(
    process.cwd(),
    "app/activity/[offeringId]/team/[teamId]/page.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const panelSource = await fs.readFile(panelPath, "utf8").catch(() => "");
  const layoutSource = await fs.readFile(layoutPath, "utf8").catch(() => "");
  const teamPageSource = await fs.readFile(teamPagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/artifacts.ts exists");
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store") &&
      !helpersSource.includes("calibration-api") &&
      !helpersSource.includes("app-store"),
    "artifact helpers do not import engine/store/api"
  );
  assert(
    !helpersSource.includes("/app/") && !helpersSource.includes("editor"),
    "artifact helpers do not build an editor href"
  );

  // --- Source: ArtifactsPanel is read-only (12.2, 12.4) and has try-chat (12.3) ---
  assert(panelSource.includes("ArtifactsPanel"), "ArtifactsPanel component exists");
  assert(
    !/<input\b/i.test(panelSource) &&
      !/<textarea\b/i.test(panelSource) &&
      !/contenteditable/i.test(panelSource) &&
      !/<select\b/i.test(panelSource),
    "ArtifactsPanel has no input/textarea/contenteditable/select"
  );
  assert(
    !panelSource.includes("/app/") && !/\/app\/.*editor/.test(panelSource),
    "ArtifactsPanel has no /app/ editor links"
  );
  assert(
    !panelSource.includes("calibration-store") &&
      !panelSource.includes("app-store") &&
      !panelSource.includes("calibration-engine") &&
      !panelSource.includes("calibration-api"),
    "ArtifactsPanel does not import store/engine/api modules"
  );
  assert(
    !panelSource.toLowerCase().includes("liveblocks") &&
      !panelSource.toLowerCase().includes("yjs") &&
      !panelSource.toLowerCase().includes("cursor"),
    "ArtifactsPanel has no collaborative cursors"
  );
  assert(
    panelSource.includes("sampleRubric") ||
      /sample rubric/i.test(panelSource),
    "ArtifactsPanel renders the sample rubric"
  );
  assert(
    panelSource.includes("systemPrompt") ||
      /system prompt/i.test(panelSource),
    "ArtifactsPanel renders the system prompt"
  );
  assert(
    panelSource.includes("deploymentBrief") ||
      /deployment brief/i.test(panelSource),
    "ArtifactsPanel renders the deployment brief"
  );
  assert(
    panelSource.includes("transcriptExcerpt") ||
      /transcript/i.test(panelSource),
    "ArtifactsPanel renders the transcript excerpt"
  );
  assert(
    /try chat/i.test(panelSource),
    "ArtifactsPanel offers a Try chat control"
  );
  assert(
    panelSource.includes("tryChatHref") || panelSource.includes("/chat/"),
    "Try chat links to the published /chat route"
  );
  assert(
    panelSource.includes("<a") &&
      (panelSource.includes("target=") || panelSource.includes("href=")),
    "Try chat is an anchor to the published chat"
  );

  // --- Source: composed into the SpaceLayout Artifacts slot (1.3) ---
  assert(
    layoutSource.includes("ArtifactsPanel"),
    "ArtifactsPanel is composed into SpaceLayout"
  );
  assert(
    !layoutSource.includes("Sample prompt, brief, and transcript will appear here."),
    "SpaceLayout Artifacts placeholder slot is gone"
  );
  assert(
    !layoutSource.includes('title="Artifacts"'),
    "SpaceLayout no longer uses the Artifacts PanelSlot"
  );
  assert(
    layoutSource.includes("ScoreSheet"),
    "ScoreSheet is composed into SpaceLayout"
  );
  assert(
    layoutSource.includes("SharedDocEditor"),
    "SharedDocEditor is composed into SpaceLayout"
  );

  // --- Source: team page loads texts on the server and passes props ---
  assert(
    teamPageSource.includes("getOffering"),
    "team page loads offering artifact texts via getOffering"
  );
  assert(
    teamPageSource.includes("getAppById"),
    "team page loads the sample bot via getAppById"
  );
  assert(
    teamPageSource.includes("buildArtifactsView") ||
      teamPageSource.includes("artifacts="),
    "team page passes a serializable artifacts props object"
  );
  assert(
    !teamPageSource.includes("ArtifactsPanel"),
    "team page does not import ArtifactsPanel; SpaceLayout composes it"
  );
  assert(
    !teamPageSource.includes("/app/") &&
      !teamPageSource.toLowerCase().includes("editor"),
    "team page has no Solo editor links"
  );

  const uiSources = [helpersSource, panelSource, layoutSource, teamPageSource].join(
    "\n"
  );
  assert(
    !/promptOverride|systemPrompt=|overridePrompt/i.test(uiSources),
    "no learner-authored prompt override is wired into try-chat"
  );

  if (failures > 0) {
    console.error(`\nartifacts.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("artifacts.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("artifacts.selftest crashed:", err);
  process.exit(1);
});
