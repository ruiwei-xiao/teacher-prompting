/**
 * Self-test: Workspace sidebar/nav helpers (Task 6.1).
 * Run: npx tsx lib/workspace-ui/nav.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  buildCreateWorkspaceBody,
  MY_BOTS_HREF,
  parseCreateWorkspaceResponse,
  parseWorkspacesListResponse,
  workspaceHubHref,
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

  const hubPath = path.join(
    process.cwd(),
    "app/workspace/[workspaceId]/page.tsx"
  );
  const hubSource = await fs.readFile(hubPath, "utf8");
  assert(
    hubSource.includes("/api/workspaces/"),
    "minimal hub loads workspace by id"
  );
  assert(
    hubSource.toLowerCase().includes("temporary") ||
      hubSource.includes("6.2"),
    "minimal hub is labeled temporary / pending 6.2"
  );

  const homePath = path.join(process.cwd(), "app/page.tsx");
  const homeSource = await fs.readFile(homePath, "utf8");
  assert(
    homeSource.includes("WorkspaceSidebar"),
    "home dashboard wires WorkspaceSidebar entry"
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
