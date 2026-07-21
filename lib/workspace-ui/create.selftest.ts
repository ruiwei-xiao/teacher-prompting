/**
 * Self-test: Optional place-into-Workspace on create UI (Task 7.1).
 * Run: npx tsx lib/workspace-ui/create.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { BuildingPermissions } from "@/lib/workspace-store/types";
import {
  PERSONAL_CREATE_TARGET_VALUE,
  buildCreateAppRequestBody,
  createHrefWithWorkspace,
  listAllowedCreateIntoWorkspaceTargets,
  resolveInitialCreateWorkspaceId,
} from "./create";

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

const permsOff: BuildingPermissions = {
  canCreateBots: false,
  canSeeOthersBots: false,
  canShareOutside: false,
  canManageOwnBots: false,
};

const permsCreate: BuildingPermissions = {
  ...permsOff,
  canCreateBots: true,
};

async function main(): Promise<void> {
  // --- Personal create: workspaceId omitted (Req 1.5, 7.1) ---
  const personal = buildCreateAppRequestBody({
    name: "Bot",
    description: "Desc",
    genaiModel: "openai:gpt-5.4-mini",
    genaiApiKey: "sk-test",
  });
  assertEqual(
    personal,
    {
      name: "Bot",
      description: "Desc",
      genaiModel: "openai:gpt-5.4-mini",
      genaiApiKey: "sk-test",
    },
    "personal create omits workspaceId"
  );
  assert(
    !("workspaceId" in personal),
    "personal create body has no workspaceId key"
  );

  const blankTarget = buildCreateAppRequestBody({
    name: "Bot",
    description: "Desc",
    genaiModel: "openai:gpt-5.4-mini",
    genaiApiKey: "sk-test",
    workspaceId: "   ",
  });
  assert(
    !("workspaceId" in blankTarget),
    "blank workspaceId is treated as personal create"
  );

  // --- Allowed create-into-Workspace includes workspaceId (Req 5.2) ---
  const intoWs = buildCreateAppRequestBody({
    name: "Bot",
    description: "Desc",
    genaiModel: "openai:gpt-5.4-mini",
    genaiApiKey: "sk-test",
    workspaceId: "ws_allowed",
  });
  assertEqual(
    intoWs.workspaceId,
    "ws_allowed",
    "create-into-Workspace body includes workspaceId for placement API"
  );

  // --- Target filter: permission (a) × role ---
  const targets = listAllowedCreateIntoWorkspaceTargets([
    {
      id: "ws_owner",
      name: "Owner Hub",
      role: "owner",
      buildingPermissions: permsOff,
    },
    {
      id: "ws_fac",
      name: "Fac Hub",
      role: "facilitator",
      buildingPermissions: permsOff,
    },
    {
      id: "ws_part_on",
      name: "Part Open",
      role: "participant",
      buildingPermissions: permsCreate,
    },
    {
      id: "ws_part_off",
      name: "Part Closed",
      role: "participant",
      buildingPermissions: permsOff,
    },
  ]);
  assertEqual(
    targets.map((t) => t.id).sort(),
    ["ws_fac", "ws_owner", "ws_part_on"].sort(),
    "Owners/Facilitators always; Participants need permission (a)"
  );

  assertEqual(
    PERSONAL_CREATE_TARGET_VALUE,
    "",
    "personal target sentinel is empty string (not a Workspace id)"
  );

  // --- Optional query preselect; never forces a Workspace ---
  const allowed = listAllowedCreateIntoWorkspaceTargets([
    {
      id: "ws_allowed",
      name: "Allowed",
      role: "owner",
      buildingPermissions: permsOff,
    },
  ]);
  assertEqual(
    resolveInitialCreateWorkspaceId({
      queryWorkspaceId: null,
      allowedTargets: allowed,
    }),
    PERSONAL_CREATE_TARGET_VALUE,
    "no query → personal create (Workspace not required)"
  );
  assertEqual(
    resolveInitialCreateWorkspaceId({
      queryWorkspaceId: "ws_allowed",
      allowedTargets: allowed,
    }),
    "ws_allowed",
    "allowed query workspaceId preselects that target"
  );
  assertEqual(
    resolveInitialCreateWorkspaceId({
      queryWorkspaceId: "ws_denied",
      allowedTargets: allowed,
    }),
    PERSONAL_CREATE_TARGET_VALUE,
    "disallowed query falls back to personal create"
  );

  assertEqual(
    createHrefWithWorkspace(),
    "/create",
    "create href without Workspace stays personal"
  );
  assertEqual(
    createHrefWithWorkspace("ws_1"),
    "/create?workspaceId=ws_1",
    "create href can optionally target a Workspace"
  );

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/create.ts");
  const formPath = path.join(
    process.cwd(),
    "components/forms/CreateAppForm.tsx"
  );
  const pagePath = path.join(process.cwd(), "app/create/page.tsx");

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const formSource = await fs.readFile(formPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/create.ts exists");
  assert(
    helpersSource.includes("buildCreateAppRequestBody"),
    "create helpers export buildCreateAppRequestBody"
  );
  assert(
    helpersSource.includes("listAllowedCreateIntoWorkspaceTargets"),
    "create helpers filter allowed Workspace targets"
  );
  assert(
    formSource.includes("workspaceId"),
    "CreateAppForm accepts/passes optional workspaceId"
  );
  assert(
    formSource.includes("buildCreateAppRequestBody") ||
      formSource.includes("workspaceId"),
    "CreateAppForm wires create body with optional workspaceId"
  );
  assert(
    formSource.includes("/api/apps"),
    "CreateAppForm still posts to /api/apps (placement via existing create API)"
  );
  assert(
    pageSource.includes("listAllowedCreateIntoWorkspaceTargets") ||
      pageSource.includes("workspaceId"),
    "create page supports optional Workspace target"
  );
  assert(
    pageSource.includes("PERSONAL_CREATE_TARGET_VALUE") ||
      pageSource.toLowerCase().includes("my bots") ||
      pageSource.includes('value=""'),
    "create page offers personal My bots create (does not require Workspace)"
  );
  assert(
    pageSource.includes("CreateAppForm"),
    "create page renders CreateAppForm"
  );

  const gridPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceBotGrid.tsx"
  );
  const gridSource = await fs.readFile(gridPath, "utf8").catch(() => "");
  assert(
    gridSource.includes("createHrefWithWorkspace") &&
      gridSource.includes("Create bot"),
    "Workspace hub offers Create bot into this Workspace"
  );

  if (failures > 0) {
    console.error(`\ncreate.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("create.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("create.selftest crashed:", err);
  process.exit(1);
});
