/**
 * Self-test: Workspace hub filter + place/unplace helpers (Task 6.2).
 * Run: npx tsx lib/workspace-ui/hub.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  BuildingPermissions,
  WorkspacePlacement,
} from "@/lib/workspace-store/types";
import { canSelfLeave } from "./members";
import { visibleWorkspaceTabs } from "./tabs";
import {
  canPlaceIntoWorkspace,
  canUnplaceFromWorkspace,
  filterVisiblePlacements,
  listPlaceableOwnedBots,
  parsePlacementsListResponse,
  parseWorkspaceGetResponse,
  shouldShowHubSelfLeave,
} from "./hub";

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

const permsSeeOthers: BuildingPermissions = {
  ...permsOff,
  canSeeOthersBots: true,
};

const permsCreate: BuildingPermissions = {
  ...permsOff,
  canCreateBots: true,
};

const permsManageOwn: BuildingPermissions = {
  ...permsOff,
  canManageOwnBots: true,
};

function placement(
  appId: string,
  placedByUserId = "u1"
): WorkspacePlacement {
  return {
    workspaceId: "ws_1",
    appId,
    placedByUserId,
    placedAt: "2026-01-01T00:00:00.000Z",
  };
}

async function main(): Promise<void> {
  const placements = [
    placement("mine"),
    placement("peer", "u_peer"),
  ];
  const owned = new Set(["mine"]);

  // --- Visibility (permission b) ---
  const participantHidden = filterVisiblePlacements({
    placements,
    role: "participant",
    permissions: permsOff,
    ownedAppIds: owned,
  });
  assertEqual(
    participantHidden.map((p) => p.appId),
    ["mine"],
    "Participant with (b) off sees only own placements"
  );

  const participantOpen = filterVisiblePlacements({
    placements,
    role: "participant",
    permissions: permsSeeOthers,
    ownedAppIds: owned,
  });
  assertEqual(
    participantOpen.map((p) => p.appId).sort(),
    ["mine", "peer"],
    "Participant with (b) on sees all placed bots"
  );

  const facilitatorAll = filterVisiblePlacements({
    placements,
    role: "facilitator",
    permissions: permsOff,
    ownedAppIds: owned,
  });
  assertEqual(
    facilitatorAll.map((p) => p.appId).sort(),
    ["mine", "peer"],
    "Facilitator sees all placed bots even when (b) off"
  );

  const ownerAll = filterVisiblePlacements({
    placements,
    role: "owner",
    permissions: permsOff,
    ownedAppIds: new Set(),
  });
  assertEqual(
    ownerAll.map((p) => p.appId).sort(),
    ["mine", "peer"],
    "Owner sees all placed bots for facilitation"
  );

  const membershipAlone = filterVisiblePlacements({
    placements,
    role: "participant",
    permissions: permsOff,
    ownedAppIds: new Set(),
  });
  assertEqual(
    membershipAlone.map((p) => p.appId),
    [],
    "membership alone does not reveal others' placed bots (permission b off)"
  );

  // --- Place (permission a) ---
  assertEqual(
    canPlaceIntoWorkspace({ role: "participant", permissions: permsOff }),
    false,
    "Participant cannot place when (a) off"
  );
  assertEqual(
    canPlaceIntoWorkspace({ role: "participant", permissions: permsCreate }),
    true,
    "Participant can place when (a) on"
  );
  assertEqual(
    canPlaceIntoWorkspace({ role: "facilitator", permissions: permsOff }),
    true,
    "Facilitator can place when (a) off"
  );
  assertEqual(
    canPlaceIntoWorkspace({ role: "owner", permissions: permsOff }),
    true,
    "Owner can place when (a) off"
  );

  // --- Unplace (permission d) ---
  assertEqual(
    canUnplaceFromWorkspace({
      role: "participant",
      permissions: permsOff,
      isBotOwner: true,
    }),
    false,
    "Participant cannot unplace own when (d) off"
  );
  assertEqual(
    canUnplaceFromWorkspace({
      role: "participant",
      permissions: permsManageOwn,
      isBotOwner: true,
    }),
    true,
    "Participant can unplace own when (d) on"
  );
  assertEqual(
    canUnplaceFromWorkspace({
      role: "participant",
      permissions: permsManageOwn,
      isBotOwner: false,
    }),
    false,
    "Participant cannot unplace peer bots"
  );
  assertEqual(
    canUnplaceFromWorkspace({
      role: "facilitator",
      permissions: permsOff,
      isBotOwner: false,
    }),
    true,
    "Facilitator may unplace others' placements"
  );
  assertEqual(
    canUnplaceFromWorkspace({
      role: "owner",
      permissions: permsOff,
      isBotOwner: false,
    }),
    true,
    "Owner may unplace others' placements"
  );

  // --- Placeable owned list ---
  const placeable = listPlaceableOwnedBots({
    ownedBots: [
      { id: "mine", name: "Mine" },
      { id: "extra", name: "Extra" },
    ],
    placedAppIds: new Set(["mine"]),
  });
  assertEqual(
    placeable.map((b) => b.id),
    ["extra"],
    "lists only unplaced owned bots"
  );

  // --- Response parsers ---
  const ws = parseWorkspaceGetResponse(200, {
    workspace: {
      id: "ws_1",
      name: "Period 3",
      buildingPermissions: permsOff,
    },
    role: "facilitator",
  });
  assert(ws.ok === true, "200 workspace get is ok");
  if (ws.ok) {
    assertEqual(ws.workspace.name, "Period 3", "parses workspace name");
    assertEqual(ws.role, "facilitator", "parses role");
    assertEqual(
      ws.workspace.assistedAuthoringModeDefault,
      false,
      "missing assistedAuthoringModeDefault reads as false"
    );
  }

  const wsAaOn = parseWorkspaceGetResponse(200, {
    workspace: {
      id: "ws_1",
      name: "Period 3",
      buildingPermissions: permsOff,
      assistedAuthoringModeDefault: true,
    },
    role: "owner",
  });
  assert(wsAaOn.ok === true, "200 workspace get with AA default is ok");
  if (wsAaOn.ok) {
    assertEqual(
      wsAaOn.workspace.assistedAuthoringModeDefault,
      true,
      "parses assistedAuthoringModeDefault true"
    );
  }

  const wsForbidden = parseWorkspaceGetResponse(403, { error: "Forbidden" });
  assert(wsForbidden.ok === false, "403 workspace get fails");

  const listed = parsePlacementsListResponse(200, {
    placements: [placement("mine")],
  });
  assert(listed.ok === true, "200 placements list is ok");
  if (listed.ok) {
    assertEqual(listed.placements.length, 1, "parses placements");
  }

  // --- UI wiring ---
  const hubComponentPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceHub.tsx"
  );
  const gridComponentPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceBotGrid.tsx"
  );
  const pagePath = path.join(
    process.cwd(),
    "app/workspace/[workspaceId]/page.tsx"
  );

  const hubSource = await fs.readFile(hubComponentPath, "utf8");
  const gridSource = await fs.readFile(gridComponentPath, "utf8");
  const pageSource = await fs.readFile(pagePath, "utf8");

  assert(
    hubSource.includes("WorkspaceBotGrid"),
    "WorkspaceHub renders WorkspaceBotGrid"
  );
  assert(
    hubSource.includes("/api/workspaces/"),
    "WorkspaceHub fetches GET /api/workspaces/:id"
  );
  assert(
    gridSource.includes("/placements"),
    "WorkspaceBotGrid uses placements API"
  );
  assert(
    gridSource.includes("method") && gridSource.includes("POST"),
    "WorkspaceBotGrid can POST place"
  );
  assert(
    gridSource.includes("DELETE"),
    "WorkspaceBotGrid can DELETE unplace"
  );
  assert(
    gridSource.includes("ShareDialog"),
    "WorkspaceBotGrid wires ShareDialog"
  );
  assert(
    gridSource.includes("workspaceId"),
    "WorkspaceBotGrid passes workspaceId for share context"
  );
  assert(
    gridSource.includes("filterVisiblePlacements") ||
      hubSource.includes("filterVisiblePlacements"),
    "hub UI applies filterVisiblePlacements"
  );
  assert(
    pageSource.includes("WorkspaceHub"),
    "hub page renders WorkspaceHub"
  );
  assert(
    !pageSource.toLowerCase().includes("temporary hub"),
    "hub page is no longer the temporary 6.1 placeholder"
  );

  // --- Role-visible hub tabs, Activity, Settings/Members (Req 1.1, 1.2, 1.7, 3.8, 5.6) ---
  const navTabsPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceNavTabs.tsx"
  );
  const membersListPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceMemberList.tsx"
  );
  const navTabsSource = await fs.readFile(navTabsPath, "utf8");
  const membersListSource = await fs.readFile(membersListPath, "utf8");

  assertEqual(
    visibleWorkspaceTabs("participant").join(","),
    "bots",
    "Participant hub shows only Bots"
  );
  assertEqual(
    visibleWorkspaceTabs("owner").join(","),
    "bots,settings,members,activity",
    "Owner hub shows Bots, Settings, Members, and Activity"
  );
  assertEqual(
    visibleWorkspaceTabs("facilitator").join(","),
    "bots,settings,members,activity",
    "Facilitator hub shows Bots, Settings, Members, and Activity"
  );
  assert(
    navTabsSource.includes("visibleWorkspaceTabs"),
    "WorkspaceNavTabs renders only role-visible tabs"
  );
  assert(
    hubSource.includes("WorkspaceNavTabs") && hubSource.includes("role={state.role}"),
    "hub passes membership role into nav tabs"
  );
  assert(
    !hubSource.includes('activeTab === "invites"') &&
      !hubSource.includes('case "invites"') &&
      !hubSource.includes("WorkspaceInvitePanel"),
    "hub has no Invites tab"
  );
  assert(
    /activeTab === ["']activity["']/.test(hubSource) &&
      hubSource.includes("WorkspaceActivityView"),
    "hub mounts the Activity browse view"
  );
  assert(
    !hubSource.includes("WorkspaceActivityFeed") &&
      !hubSource.includes("activityApiHref"),
    "hub Activity is not the membership/placement event feed"
  );
  assert(
    hubSource.includes("WorkspacePermissionsForm") &&
      hubSource.includes("initialAssistedAuthoringModeDefault"),
    "operators can change building permissions and AA default in Settings after create"
  );
  assert(
    hubSource.includes("WorkspaceMemberList") &&
      membersListSource.includes("WorkspaceShareLinkControl") &&
      membersListSource.includes("buildCreateEmailInviteBody"),
    "operators invite from Members after create"
  );
  assert(
    membersListSource.includes("canSelfLeave") &&
      membersListSource.includes("Leave Workspace"),
    "operators keep self-leave on Members"
  );

  // --- Participant leave on Bots (Req 1.6) ---
  assertEqual(
    canSelfLeave("participant"),
    true,
    "Participant may self-leave"
  );
  assertEqual(
    canSelfLeave("facilitator"),
    true,
    "Facilitator may self-leave"
  );
  assertEqual(
    canSelfLeave("owner"),
    false,
    "Owner cannot self-leave"
  );
  assertEqual(
    shouldShowHubSelfLeave({ role: "participant", activeTab: "bots" }),
    true,
    "Participant leave control shows on Bots"
  );
  assertEqual(
    shouldShowHubSelfLeave({ role: "facilitator", activeTab: "bots" }),
    true,
    "non-owner leave control shows on Bots when they are not on Members"
  );
  assertEqual(
    shouldShowHubSelfLeave({ role: "owner", activeTab: "bots" }),
    false,
    "Owner does not get hub header leave on Bots"
  );
  assertEqual(
    shouldShowHubSelfLeave({ role: "facilitator", activeTab: "members" }),
    false,
    "operator leave stays on Members when that tab is active"
  );
  assertEqual(
    shouldShowHubSelfLeave({ role: "participant", activeTab: "settings" }),
    false,
    "leave control is not shown with Settings"
  );
  assertEqual(
    shouldShowHubSelfLeave({ role: "participant", activeTab: "members" }),
    false,
    "leave control is not shown with Members"
  );
  assertEqual(
    shouldShowHubSelfLeave({ role: "participant", activeTab: "activity" }),
    false,
    "leave control is not shown with Activity"
  );
  assert(
    hubSource.includes("shouldShowHubSelfLeave"),
    "WorkspaceHub uses shouldShowHubSelfLeave for Bots leave"
  );
  assert(
    hubSource.includes("Leave Workspace"),
    "Participant leave control is on the hub header"
  );
  assert(
    hubSource.includes("buildRemoveMemberBody") &&
      hubSource.includes("DELETE") &&
      (hubSource.includes("membersApiHref") || hubSource.includes("/members")),
    "hub self-leave uses existing members API DELETE"
  );
  assert(
    hubSource.includes("parseMembersMutationResponse"),
    "hub self-leave parses the members DELETE response"
  );
  assert(
    !gridSource.includes("Leave Workspace") &&
      !gridSource.includes("canSelfLeave") &&
      !gridSource.includes("shouldShowHubSelfLeave"),
    "leave lives on the hub header, not BotGrid"
  );
  assert(
    !hubSource.includes("WorkspacePermissionsForm") ||
      hubSource.includes('activeTab === "settings"'),
    "Settings content is tab-gated"
  );
  assert(
    hubSource.includes('activeTab === "members"') &&
      hubSource.includes("WorkspaceMemberList"),
    "Members content is tab-gated"
  );

  if (failures > 0) {
    console.error(`\nhub.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("hub.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("hub.selftest crashed:", err);
  process.exit(1);
});
