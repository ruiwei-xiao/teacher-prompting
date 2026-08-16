/**
 * Self-test: offering create form helpers + wiring (Task 5.1).
 * Run: npx tsx lib/calibration-ui/offering.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  ACTIVITY_HREF,
  ACTIVITY_NEW_HREF,
  OFFERING_CREATE_API,
  OWN_BOTS_API,
  buildOfferingCreatePayload,
  isCalibrationPath,
  parseOfferingCreateResponse,
  parseOfferingListResponse,
  parseOwnBotsResponse,
} from "./offering";

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
  // --- Form payload maps to POST /api/calibration/offerings fields (1.1) ---
  const payload = buildOfferingCreatePayload({
    title: "  Rubric Calibration Pilot  ",
    sampleAppId: " app_sample_bot ",
    sampleRubric: " Criterion 1: clarity ",
    deploymentBrief: " Deploy the tutor for week-3 lab. ",
    transcriptExcerpt: " Student: ...\nTutor: ... ",
    facilitatorSelection: "openai:gpt-5.4-mini",
  });
  assertEqual(
    payload,
    {
      title: "Rubric Calibration Pilot",
      sampleAppId: "app_sample_bot",
      sampleRubric: "Criterion 1: clarity",
      deploymentBrief: "Deploy the tutor for week-3 lab.",
      transcriptExcerpt: "Student: ...\nTutor: ...",
      aiProvider: "openai",
      aiModel: "gpt-5.4-mini",
    },
    "offering payload maps to create API fields and trims values"
  );
  assertEqual(
    Object.keys(payload).sort(),
    [
      "aiModel",
      "aiProvider",
      "deploymentBrief",
      "sampleAppId",
      "sampleRubric",
      "title",
      "transcriptExcerpt",
    ],
    "payload keys are exactly the POST /api/calibration/offerings body"
  );
  assertEqual(
    OFFERING_CREATE_API,
    "/api/calibration/offerings",
    "create posts to the existing offerings API"
  );
  assertEqual(
    OWN_BOTS_API,
    "/api/apps",
    "own-bot select uses existing GET /api/apps"
  );

  const anthropic = buildOfferingCreatePayload({
    title: "Pilot",
    sampleAppId: "app_1",
    sampleRubric: "C1",
    deploymentBrief: "Brief",
    transcriptExcerpt: "Transcript",
    facilitatorSelection: "anthropic:claude-sonnet-4-6",
  });
  assertEqual(anthropic.aiProvider, "anthropic", "splits anthropic provider");
  assertEqual(anthropic.aiModel, "claude-sonnet-4-6", "splits anthropic model");
  assertEqual(
    "facilitatorApiKey" in anthropic,
    false,
    "omits facilitator key when using the sample bot key"
  );

  const customKey = buildOfferingCreatePayload({
    title: "Pilot",
    sampleAppId: "app_1",
    sampleRubric: "C1",
    deploymentBrief: "Brief",
    transcriptExcerpt: "Transcript",
    facilitatorSelection: "openai:gpt-5.4-mini",
    facilitatorApiKey: "  sk-fac  ",
  });
  assertEqual(
    customKey.facilitatorApiKey,
    "sk-fac",
    "includes a custom facilitator key when provided"
  );

  // --- Own-bot list from GET /api/apps (AppGrid shape) ---
  const bots = parseOwnBotsResponse(200, {
    apps: [
      { id: "app_a", name: "Tutor A" },
      { id: "app_b", name: "Tutor B", description: "extra" },
    ],
  });
  assert(bots.ok === true, "200 apps list is ok");
  if (bots.ok) {
    assertEqual(
      bots.apps,
      [
        { id: "app_a", name: "Tutor A" },
        { id: "app_b", name: "Tutor B" },
      ],
      "own-bot options keep id and name from GET /api/apps"
    );
  }
  assert(
    parseOwnBotsResponse(401, { error: "Unauthorized" }).ok === false,
    "unauthenticated apps list fails"
  );
  assert(
    parseOwnBotsResponse(200, { apps: "nope" }).ok === false,
    "invalid apps payload fails"
  );

  const created = parseOfferingCreateResponse(200, {
    offering: { id: "off_1", title: "Pilot" },
  });
  assert(created.ok === true, "200 create is ok");
  if (created.ok) {
    assertEqual(created.offeringId, "off_1", "create returns offering id");
  }
  assert(
    parseOfferingCreateResponse(400, { error: "Missing title" }).ok === false,
    "400 create fails"
  );

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/calibration-ui/offering.ts");
  const formPath = path.join(
    process.cwd(),
    "components/calibration/OfferingCreateForm.tsx"
  );
  const pagePath = path.join(process.cwd(), "app/activity/new/page.tsx");

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const formSource = await fs.readFile(formPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/calibration-ui/offering.ts exists");
  assert(
    helpersSource.includes("buildOfferingCreatePayload"),
    "offering helpers export buildOfferingCreatePayload"
  );
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store"),
    "offering helpers do not import engine/store"
  );

  assert(
    formSource.includes("buildOfferingCreatePayload"),
    "OfferingCreateForm uses the payload builder"
  );
  assert(
    formSource.includes("OWN_BOTS_API") ||
      formSource.includes(OWN_BOTS_API) ||
      formSource.includes("/api/apps"),
    "OfferingCreateForm loads own bots from GET /api/apps"
  );
  assert(
    formSource.includes("OFFERING_CREATE_API") ||
      formSource.includes(OFFERING_CREATE_API) ||
      formSource.includes("/api/calibration/offerings"),
    "OfferingCreateForm posts to /api/calibration/offerings"
  );
  assert(
    formSource.includes('method: "POST"') ||
      formSource.includes("method: 'POST'") ||
      formSource.includes('"POST"'),
    "OfferingCreateForm POSTs the offering"
  );
  assert(
    formSource.includes("operatePageHref") ||
      formSource.includes("/operate"),
    "create form sends the operator to progress, not the join page"
  );
  for (const field of [
    "title",
    "sampleAppId",
    "sampleRubric",
    "deploymentBrief",
    "transcriptExcerpt",
    "aiProvider",
    "aiModel",
  ]) {
    assert(
      formSource.includes(field) || helpersSource.includes(field),
      `form/helpers mention ${field}`
    );
  }
  assert(
    formSource.toLowerCase().includes("sample rubric") ||
      formSource.includes("sampleRubric"),
    "form includes sample rubric"
  );
  assert(
    formSource.toLowerCase().includes("deployment brief") ||
      formSource.includes("deploymentBrief"),
    "form includes deployment brief"
  );
  assert(
    formSource.toLowerCase().includes("transcript") ||
      formSource.includes("transcriptExcerpt"),
    "form includes transcript excerpt"
  );
  assert(
    formSource.toLowerCase().includes("provider") ||
      formSource.includes("aiProvider") ||
      formSource.includes("facilitator"),
    "form includes facilitator provider/model"
  );
  assert(
    formSource.includes("Use the sample bot") ||
      formSource.includes("sample bot"),
    "form can use the sample bot API key"
  );
  assert(
    formSource.includes("Use a different API key") ||
      formSource.includes("facilitatorApiKey"),
    "form can supply a different facilitator API key"
  );
  assert(
    !formSource.includes("calibration-engine") &&
      !formSource.includes("calibration-store"),
    "OfferingCreateForm does not import engine/store"
  );

  assert(
    pageSource.includes("OfferingCreateForm"),
    "activity/new page renders OfferingCreateForm"
  );
  assert(pageSource.includes("AppShell"), "activity/new uses AppShell chrome");
  assert(
    pageSource.includes("SignInPanel"),
    "activity/new sends unauthenticated visitors to sign-in"
  );
  assert(
    pageSource.includes("/activity/new") || pageSource.includes("callbackUrl"),
    "sign-in callback returns to the offering form"
  );

  assertEqual(ACTIVITY_HREF, "/activity", "hub path");
  assertEqual(ACTIVITY_NEW_HREF, "/activity/new", "create path");
  assert(isCalibrationPath("/activity"), "hub is a calibration path");
  assert(isCalibrationPath("/activity/new"), "create is a calibration path");
  assert(!isCalibrationPath("/"), "home is not a calibration path");

  const listed = parseOfferingListResponse(200, {
    offerings: [
      {
        id: "off_1",
        title: "Pilot",
        createdAt: "2026-08-15T00:00:00.000Z",
      },
    ],
  });
  assert(listed.ok === true, "200 list is ok");
  if (listed.ok) {
    assertEqual(listed.offerings.length, 1, "parses one offering");
    assertEqual(listed.offerings[0]?.id, "off_1", "list item id");
  }

  const sidebarPath = path.join(
    process.cwd(),
    "components/app-shell/WorkspaceSidebar.tsx"
  );
  const hubPath = path.join(process.cwd(), "app/activity/page.tsx");
  const sidebarSource = await fs.readFile(sidebarPath, "utf8").catch(() => "");
  const hubSource = await fs.readFile(hubPath, "utf8").catch(() => "");
  assert(
    sidebarSource.includes("ACTIVITY_HREF") ||
      sidebarSource.includes("/activity"),
    "sidebar links to the calibration hub"
  );
  assert(
    sidebarSource.includes("Activities"),
    "sidebar shows an Activities item"
  );
  assert(hubSource.includes("ACTIVITY_NEW_HREF") || hubSource.includes("/activity/new"), "hub links to create");
  assert(hubSource.includes("listMyOfferings"), "hub loads the operator's offerings");

  if (failures > 0) {
    console.error(`\noffering.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("offering.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("offering.selftest crashed:", err);
  process.exit(1);
});
