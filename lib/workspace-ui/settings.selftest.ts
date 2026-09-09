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
import { WORKSPACE_NAME_MAX_LENGTH } from "./nav";

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

  // --- Patch body (Req 1.4, 4.1, 5.1) ---
  assertEqual(
    buildWorkspaceSettingsPatchBody({
      name: "  Period 3  ",
      buildingPermissions: permsOpen,
      assistedAuthoringModeDefault: true,
    }),
    {
      name: "Period 3",
      buildingPermissions: permsOpen,
      assistedAuthoringModeDefault: true,
    },
    "trims rename and includes building permissions a–d and assistedAuthoringModeDefault"
  );
  assertEqual(
    buildWorkspaceSettingsPatchBody({
      name: "Course",
      buildingPermissions: permsOff,
      assistedAuthoringModeDefault: false,
    }),
    {
      name: "Course",
      buildingPermissions: permsOff,
      assistedAuthoringModeDefault: false,
    },
    "patch body includes assistedAuthoringModeDefault false"
  );
  assertEqual(
    buildWorkspaceSettingsPatchBody({
      name: "   ",
      buildingPermissions: permsOff,
      assistedAuthoringModeDefault: true,
    }),
    null,
    "blank name is rejected"
  );
  assertEqual(
    buildWorkspaceSettingsPatchBody({
      name: "x".repeat(WORKSPACE_NAME_MAX_LENGTH + 1),
      buildingPermissions: permsOff,
      assistedAuthoringModeDefault: false,
    }),
    null,
    "over-long rename is rejected"
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
      assistedAuthoringModeDefault: true,
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
    assertEqual(
      patched.workspace.assistedAuthoringModeDefault,
      true,
      "parses saved assistedAuthoringModeDefault"
    );
  }

  const patchForbidden = parseWorkspacePatchResponse(403, {
    error: "Forbidden",
  });
  assert(patchForbidden.ok === false, "403 patch fails");
  assert(
    patchForbidden.ok === false,
    "failed parse does not look saved"
  );

  const patchServerError = parseWorkspacePatchResponse(500, {
    error: "Save failed",
  });
  assert(patchServerError.ok === false, "500 patch does not look saved");
  if (!patchServerError.ok) {
    assertEqual(
      patchServerError.error,
      "Save failed",
      "failed parse surfaces the error"
    );
  }

  const patchMissingAaDefault = parseWorkspacePatchResponse(200, {
    workspace: {
      id: "ws_1",
      name: "Renamed",
      buildingPermissions: permsOpen,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  });
  assert(
    patchMissingAaDefault.ok === false,
    "200 without assistedAuthoringModeDefault does not look saved"
  );

  const deleted = parseWorkspaceDeleteResponse(200, { ok: true });
  assert(deleted.ok === true, "200 delete is ok");

  const deleteForbidden = parseWorkspaceDeleteResponse(403, {
    error: "Forbidden",
  });
  assert(deleteForbidden.ok === false, "403 delete fails");

  assertEqual(
    workspaceSettingsHref("ws_1"),
    "/workspace/ws_1?tab=settings",
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
    formSource.includes("assistedAuthoringModeDefault"),
    "form has Assisted Authoring Mode default control"
  );
  assert(
    formSource.includes("WORKSPACE_NAME_MAX_LENGTH") &&
      formSource.includes("workspaceNameError"),
    "settings form validates workspace name length"
  );
  assert(
    formSource.includes("Save settings") &&
      formSource.indexOf("Save settings") < formSource.indexOf("Building permissions"),
    "Save settings is at the top of the form, next to Name"
  );
  assert(
    !formSource.includes("Workspace name:"),
    "Name heading is the field label; no duplicate Workspace name: row"
  );
  assert(
    formSource.includes("ON") && formSource.includes("OFF"),
    "Settings control is ON or OFF"
  );
  assert(
    formSource.includes("disabled={!canEdit") ||
      formSource.includes("disabled={!canEdit ||"),
    "Participants cannot edit the Assisted Authoring default"
  );
  assert(
    formSource.includes("if (!parsed.ok)") &&
      formSource.includes("setError") &&
      formSource.includes("setSuccess"),
    "form parses PATCH and can show error or success"
  );
  const saveCatchIdx = formSource.indexOf("} catch (e: unknown) {");
  const saveFinallyIdx = formSource.indexOf("} finally {", saveCatchIdx);
  const saveCatchBlock =
    saveCatchIdx >= 0 && saveFinallyIdx > saveCatchIdx
      ? formSource.slice(saveCatchIdx, saveFinallyIdx)
      : "";
  assert(
    saveCatchBlock.includes("setError") &&
      !saveCatchBlock.includes("setSuccess(") &&
      saveCatchBlock.includes("setAssistedAuthoringModeDefault"),
    "failed parse does not look saved and leaves the previous default on screen"
  );
  assert(
    hubSource.includes("WorkspacePermissionsForm"),
    "hub renders WorkspacePermissionsForm on settings tab"
  );
  assert(
    pageSource.includes("redirect") || pageSource.includes("workspaceTabHref"),
    "legacy settings route redirects to hub ?tab="
  );
  assert(
    hubSource.includes("WorkspaceNavTabs") ||
      hubSource.includes("settings") ||
      hubSource.includes("workspaceSettingsHref"),
    "hub links to settings via tabs or direct href"
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
