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
import {
  canPlaceIntoWorkspace,
  canUnplaceFromWorkspace,
  filterVisiblePlacements,
  listPlaceableOwnedBots,
  parsePlacementsListResponse,
  parseWorkspaceGetResponse,
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
