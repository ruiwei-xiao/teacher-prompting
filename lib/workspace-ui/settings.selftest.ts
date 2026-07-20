/**
 * Self-test: Workspace settings helpers + UI wiring (Task 6.3).
 * Run: npx tsx lib/workspace-ui/settings.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { BuildingPermissions } from "@/lib/workspace-store/types";
import {
  BUILDING_PERMISSION_FIELDS,
  buildWorkspaceSettingsPatchBody,
  canDeleteWorkspace,
  canEditWorkspaceSettings,
  parseWorkspaceDeleteResponse,
  parseWorkspacePatchResponse,
  workspaceSettingsHref,
} from "./settings";

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

const permsOpen: BuildingPermissions = {
  canCreateBots: true,
  canSeeOthersBots: true,
  canShareOutside: true,
  canManageOwnBots: true,
};

async function main(): Promise<void> {
  // --- Role capabilities (Req 3.2, 3.3, 3.4) ---
  assertEqual(
    canEditWorkspaceSettings("owner"),
    true,
    "Owner can edit settings"
  );
  assertEqual(
    canEditWorkspaceSettings("facilitator"),
    true,
    "Facilitator can edit settings"
  );
  assertEqual(
    canEditWorkspaceSettings("participant"),
    false,
    "Participant cannot edit settings"
  );

  assertEqual(
    canDeleteWorkspace("owner"),
    true,
    "Owner can delete Workspace"
  );
  assertEqual(
    canDeleteWorkspace("facilitator"),
    false,
    "Facilitator cannot delete Workspace"
  );
  assertEqual(
    canDeleteWorkspace("participant"),
    false,
    "Participant cannot delete Workspace"
  );

  // --- Patch body (Req 1.4, 5.1) ---
  assertEqual(
    buildWorkspaceSettingsPatchBody({
      name: "  Period 3  ",
      buildingPermissions: permsOpen,
    }),
    { name: "Period 3", buildingPermissions: permsOpen },
    "trims rename and includes building permissions a–d"
  );
  assertEqual(
    buildWorkspaceSettingsPatchBody({
      name: "   ",
      buildingPermissions: permsOff,
    }),
    null,
    "blank name is rejected"
  );

  assertEqual(
    BUILDING_PERMISSION_FIELDS.map((f) => f.key).sort(),
    [
      "canCreateBots",
      "canManageOwnBots",
      "canSeeOthersBots",
      "canShareOutside",
    ].sort(),
    "exposes all four building permission toggles"
  );

  // --- Response parsers (PATCH/DELETE /api/workspaces/:id) ---
  const patched = parseWorkspacePatchResponse(200, {
    workspace: {
      id: "ws_1",
      name: "Renamed",
      buildingPermissions: permsOpen,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  });
  assert(patched.ok === true, "200 patch is ok");
  if (patched.ok) {
    assertEqual(patched.workspace.name, "Renamed", "parses renamed workspace");
    assertEqual(
      patched.workspace.buildingPermissions,
      permsOpen,
      "parses updated permissions for subsequent member actions"
    );
  }

  const patchForbidden = parseWorkspacePatchResponse(403, {
    error: "Forbidden",
  });
  assert(patchForbidden.ok === false, "403 patch fails");

  const deleted = parseWorkspaceDeleteResponse(200, { ok: true });
  assert(deleted.ok === true, "200 delete is ok");

  const deleteForbidden = parseWorkspaceDeleteResponse(403, {
    error: "Forbidden",
  });
  assert(deleteForbidden.ok === false, "403 delete fails");

  assertEqual(
    workspaceSettingsHref("ws_1"),
    "/workspace/ws_1/settings",
    "settings href"
  );

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/settings.ts");
  const formPath = path.join(
    process.cwd(),
    "components/workspace/WorkspacePermissionsForm.tsx"
  );
  const pagePath = path.join(
    process.cwd(),
    "app/workspace/[workspaceId]/settings/page.tsx"
  );
  const hubPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceHub.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const formSource = await fs.readFile(formPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");
  const hubSource = await fs.readFile(hubPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/settings.ts exists");
  assert(
    formSource.includes("WorkspacePermissionsForm"),
    "WorkspacePermissionsForm component exists"
  );
  assert(
    formSource.includes("PATCH") || formSource.includes("method"),
    "form can PATCH /api/workspaces/:id"
  );
  assert(
    formSource.includes("/api/workspaces/"),
    "form calls workspace API"
  );
  assert(
    formSource.includes("buildingPermissions") ||
      formSource.includes("canCreateBots"),
    "form edits building permissions"
  );
  assert(
    formSource.includes("canDeleteWorkspace") ||
      formSource.includes('role === "owner"') ||
      formSource.includes('role==="owner"'),
    "form gates delete to Owner"
  );
  assert(
    formSource.includes("DELETE"),
    "Owner delete uses DELETE /api/workspaces/:id"
  );
  assert(
    formSource.includes("canEditWorkspaceSettings") ||
      formSource.includes("facilitator") ||
      formSource.includes("participant"),
    "form distinguishes edit vs read-only by role"
  );
  assert(
    pageSource.includes("WorkspacePermissionsForm"),
    "settings page renders WorkspacePermissionsForm"
  );
  assert(
    pageSource.includes("workspaceId") || pageSource.includes("useParams"),
    "settings page is workspace-scoped"
  );
  assert(
    hubSource.includes("settings") || hubSource.includes("workspaceSettingsHref"),
    "hub links to settings"
  );

  if (failures > 0) {
    console.error(`\nsettings.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("settings.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("settings.selftest crashed:", err);
  process.exit(1);
});
