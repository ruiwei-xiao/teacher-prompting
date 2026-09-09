/**
 * Self-test: Workspace sidebar/nav helpers (Task 6.1).
 * Run: npx tsx lib/workspace-ui/nav.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { BuildingPermissions } from "@/lib/workspace-store/types";
import {
  buildCreateWorkspaceBody,
  COMMUNITY_HREF,
  isCommunityPath,
  MY_BOTS_HREF,
  parseCreateWorkspaceResponse,
  parseWorkspacesListResponse,
  WORKSPACE_NAME_MAX_LENGTH,
  workspaceHubHref,
  workspaceIdFromPath,
  workspaceInitials,
  workspaceMarkTone,
  workspaceNameError,
} from "./nav";

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
  // --- List response parsing (GET /api/workspaces) ---
  const listed = parseWorkspacesListResponse(200, {
    workspaces: [
      {
        id: "ws_1",
        name: "Period 3 Algebra",
        buildingPermissions: {
          canCreateBots: true,
          canSeeOthersBots: true,
          canShareOutside: true,
          canManageOwnBots: true,
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  assert(listed.ok === true, "200 list is ok");
  if (listed.ok) {
    assertEqual(listed.workspaces.length, 1, "parses one membership");
    assertEqual(listed.workspaces[0]?.name, "Period 3 Algebra", "real name");
    assertEqual(listed.workspaces[0]?.id, "ws_1", "workspace id");
  }

  const empty = parseWorkspacesListResponse(200, { workspaces: [] });
  assert(empty.ok === true, "empty membership list is ok");
  if (empty.ok) {
    assertEqual(empty.workspaces.length, 0, "empty array for no memberships");
  }

  const unauthorized = parseWorkspacesListResponse(401, { error: "Unauthorized" });
  assert(unauthorized.ok === false, "401 list is not ok");
  if (!unauthorized.ok) {
    assert(unauthorized.error.length > 0, "401 surfaces error");
  }

  const malformed = parseWorkspacesListResponse(200, { workspaces: "nope" });
  assert(malformed.ok === false, "malformed list body fails");

  // --- Create helpers (POST /api/workspaces) ---
  const allOff: BuildingPermissions = {
    canCreateBots: false,
    canSeeOthersBots: false,
    canShareOutside: false,
    canManageOwnBots: false,
  };
  const overlayOn: BuildingPermissions = {
    canCreateBots: true,
    canSeeOthersBots: true,
    canShareOutside: false,
    canManageOwnBots: true,
  };

  assertEqual(
    buildCreateWorkspaceBody("  Course Hub  "),
    { name: "Course Hub" },
    "trims create name"
  );
  assertEqual(
    buildCreateWorkspaceBody("   "),
    null,
    "rejects blank create name"
  );
  assert(
    !("buildingPermissions" in (buildCreateWorkspaceBody("Course Hub") ?? {})),
    "omitted permissions stay off the create body (API all-off including (b))"
  );
  assertEqual(
    buildCreateWorkspaceBody("Course Hub", allOff),
    { name: "Course Hub" },
    "explicit all-off overlay is omitted from create body"
  );
  const overlaid = buildCreateWorkspaceBody("Course Hub", overlayOn);
  assert(overlaid !== null, "toggled permissions still require a name");
  if (overlaid) {
    assertEqual(
      overlaid.buildingPermissions,
      overlayOn,
      "create body includes toggled buildingPermissions overlay"
    );
    assertEqual(overlaid.name, "Course Hub", "overlaid create keeps trimmed name");
    assert(
      !("assistedAuthoringModeDefault" in overlaid),
      "create body has no Assisted Authoring field"
    );
  }
  assertEqual(
    buildCreateWorkspaceBody("   ", overlayOn),
    null,
    "blank name is rejected even when permissions are toggled"
  );
  assertEqual(
    workspaceNameError(""),
    "Enter a workspace name",
    "blank name surfaces a create error"
  );
  assertEqual(
    workspaceNameError("x".repeat(WORKSPACE_NAME_MAX_LENGTH + 1)),
    `Workspace name must be ${WORKSPACE_NAME_MAX_LENGTH} characters or fewer`,
    "over-long name surfaces a create error"
  );
  assertEqual(
    workspaceNameError("x".repeat(WORKSPACE_NAME_MAX_LENGTH)),
    null,
    "name at the max length is accepted"
  );
  assertEqual(
    buildCreateWorkspaceBody("x".repeat(WORKSPACE_NAME_MAX_LENGTH + 1)),
    null,
    "create body rejects over-long names"
  );

  const created = parseCreateWorkspaceResponse(200, {
    workspace: {
      id: "ws_new",
      name: "Course Hub",
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: true,
        canShareOutside: true,
        canManageOwnBots: true,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(created.ok === true, "200 create is ok");
  if (created.ok) {
    assertEqual(created.workspace.id, "ws_new", "create returns workspace id");
    assertEqual(created.workspace.name, "Course Hub", "create returns name");
  }

  const createBad = parseCreateWorkspaceResponse(400, {
    error: "Missing workspace name",
  });
  assert(createBad.ok === false, "400 create is not ok");

  // --- Navigation targets ---
  assertEqual(workspaceHubHref("ws_1"), "/workspace/ws_1", "hub href");
  assertEqual(MY_BOTS_HREF, "/", "My bots stays on personal dashboard");
  assertEqual(COMMUNITY_HREF, "/community", "Community has its own page");
  assertEqual(isCommunityPath("/community"), true, "community path matches");
  assertEqual(isCommunityPath("/"), false, "home is not community");
  assertEqual(
    workspaceIdFromPath("/workspace/ws_1"),
    "ws_1",
    "hub path exposes workspace id"
  );
  assertEqual(
    workspaceIdFromPath("/workspace/invite/token"),
    null,
    "invite path is not a hub"
  );
  assertEqual(workspaceInitials("test workspace"), "TW", "two-word initials");
  assertEqual(workspaceInitials("Biology"), "BI", "single-word initials");
  assert(
    workspaceMarkTone("Team Workspace").includes("ring-"),
    "workspace mark uses a ringed monogram, not a flat chip"
  );
  assert(
    workspaceMarkTone("Team Workspace") !== workspaceMarkTone("Biology"),
    "workspace marks vary by name"
  );

  // --- Sidebar must not ship placeholder Example Institute names ---
  const sidebarPath = path.join(
    process.cwd(),
    "components/app-shell/WorkspaceSidebar.tsx"
  );
  const sidebarSource = await fs.readFile(sidebarPath, "utf8");
  assert(
    !sidebarSource.includes("Example Institute"),
    "WorkspaceSidebar has no hard-coded Example Institute placeholder"
  );
  assert(
    sidebarSource.includes("/api/workspaces"),
    "WorkspaceSidebar fetches GET /api/workspaces"
  );
  assert(
    sidebarSource.includes("CreateWorkspaceDialog"),
    "WorkspaceSidebar wires CreateWorkspaceDialog"
  );
  assert(
    sidebarSource.includes("workspaceTabHref") &&
      sidebarSource.includes("workspaceSectionNav"),
    "sidebar lists Bots / Activity / Members / Settings under the current workspace"
  );
  assert(
    sidebarSource.includes("inWorkspace ?") &&
      sidebarSource.includes("workspaceLabelClass"),
    "selected workspace name is a label, not a duplicate Bots link"
  );
  assert(
    sidebarSource.includes("COMMUNITY_HREF") &&
      sidebarSource.includes("lucide-react"),
    "sidebar has a Community page link and lucide icons"
  );
  assert(
    sidebarSource.includes("rounded-full") &&
      sidebarSource.includes("workspaceMarkTone"),
    "workspace marks are circular monograms"
  );

  const dialogPath = path.join(
    process.cwd(),
    "components/workspace/CreateWorkspaceDialog.tsx"
  );
  const dialogSource = await fs.readFile(dialogPath, "utf8");
  assert(
    dialogSource.includes("/api/workspaces"),
    "CreateWorkspaceDialog posts to /api/workspaces"
  );
  assert(
    dialogSource.includes("method") && dialogSource.includes("POST"),
    "CreateWorkspaceDialog uses POST"
  );
  assert(
    dialogSource.includes("createPortal") && dialogSource.includes("document.body"),
    "CreateWorkspaceDialog portals to document.body so the overlay is not clipped by sidebar overflow"
  );
  assert(
    /max-w-(xl|2xl|3xl|4xl)/.test(dialogSource),
    "CreateWorkspaceDialog max-w is large enough for four permission toggles"
  );
  assert(
    dialogSource.includes("BUILDING_PERMISSION_FIELDS"),
    "CreateWorkspaceDialog shows the four building-permission fields"
  );
  assert(
    !dialogSource.includes("assistedAuthoring"),
    "CreateWorkspaceDialog has no Assisted Authoring control"
  );
  assert(
    dialogSource.includes("WorkspaceShareLinkControl"),
    "CreateWorkspaceDialog phase 2 reuses WorkspaceShareLinkControl"
  );
  assert(
    dialogSource.includes("buildCreateEmailInviteBody") &&
      dialogSource.includes("invitesApiHref"),
    "CreateWorkspaceDialog phase 2 uses the same email-invite pattern as Members"
  );
  assert(
    /skip/i.test(dialogSource),
    "CreateWorkspaceDialog allows skipping invite after create"
  );
  assert(
    dialogSource.includes("onCreated"),
    "CreateWorkspaceDialog still calls onCreated so the sidebar can open the hub"
  );

  const hubPath = path.join(
    process.cwd(),
    "app/workspace/[workspaceId]/page.tsx"
  );
  const hubSource = await fs.readFile(hubPath, "utf8");
  assert(
    hubSource.includes("WorkspaceHub"),
    "hub page renders WorkspaceHub"
  );
  assert(
    hubSource.includes("AppShell") ||
      hubSource.includes("CollapsibleWorkspaceSidebar") ||
      hubSource.includes("WorkspaceSidebar"),
    "hub page wires AppShell navigation"
  );
  assert(
    !hubSource.toLowerCase().includes("temporary hub"),
    "hub page is no longer the temporary 6.1 placeholder"
  );

  const homePath = path.join(process.cwd(), "app/page.tsx");
  const homeSource = await fs.readFile(homePath, "utf8");
  assert(
    homeSource.includes("AppShell") ||
      homeSource.includes("CollapsibleWorkspaceSidebar") ||
      homeSource.includes("WorkspaceSidebar"),
    "home dashboard wires AppShell navigation"
  );
  assert(
    !homeSource.includes("DashboardTabs") &&
      !homeSource.includes("CommunityGrid"),
    "home is My bots only; Community is not a tab on that page"
  );
  assert(
    dialogSource.includes("WORKSPACE_NAME_MAX_LENGTH") &&
      dialogSource.includes("workspaceNameError"),
    "CreateWorkspaceDialog validates workspace name length"
  );

  const communityPath = path.join(process.cwd(), "app/community/page.tsx");
  const communitySource = await fs.readFile(communityPath, "utf8");
  assert(
    communitySource.includes("CommunityGrid") &&
      communitySource.includes("AppShell"),
    "Community lives on its own /community page"
  );

  const appShellPath = path.join(
    process.cwd(),
    "components/app-shell/AppShell.tsx"
  );
  const appShellSource = await fs.readFile(appShellPath, "utf8").catch(() => "");
  assert(
    appShellSource.includes("menuButton") ||
      appShellSource.includes("Open navigation") ||
      appShellSource.includes("Collapse sidebar"),
    "AppShell exposes sidebar toggle chrome"
  );
  assert(
    appShellSource.includes("WorkspaceSidebar"),
    "AppShell renders WorkspaceSidebar"
  );
  assert(
    appShellSource.includes("pinned") &&
      appShellSource.includes("peeked"),
    "desktop sidebar stays visible and can collapse to icons"
  );
  assert(
    appShellSource.includes("flex-col") &&
      appShellSource.includes("w-[3.5rem]"),
    "header stays full-width; pin control stays in the icon column"
  );

  if (failures > 0) {
    console.error(`\nnav.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("nav.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("nav.selftest crashed:", err);
  process.exit(1);
});
