/**
 * Runtime self-test for Workspace permission evaluation (Task 1.2).
 * Run: npx tsc --noEmit && npx tsx lib/workspace-store/permissions.selftest.ts
 */
import type { BuildingPermissions, WorkspaceMembership, WorkspaceRole } from "./types";
import {
  assertWorkspaceAction,
  type WorkspaceAction,
} from "./permissions";

function membership(role: WorkspaceRole): WorkspaceMembership {
  return {
    workspaceId: "ws_1",
    userId: "user_1",
    role,
    joinedAt: "2026-01-01T00:00:00.000Z",
  };
}

const allOff: BuildingPermissions = {
  canCreateBots: false,
  canSeeOthersBots: false,
  canShareOutside: false,
  canManageOwnBots: false,
};

const allOn: BuildingPermissions = {
  canCreateBots: true,
  canSeeOthersBots: true,
  canShareOutside: true,
  canManageOwnBots: true,
};

let failures = 0;

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function expectOk(
  role: WorkspaceRole | null,
  permissions: BuildingPermissions,
  action: WorkspaceAction,
  label: string,
  extras?: { isBotOwner?: boolean; hasWorkspaceContext?: boolean }
): void {
  const result = assertWorkspaceAction({
    membership: role ? membership(role) : null,
    permissions,
    action,
    ...extras,
  });
  assert(result.ok === true, `${label}: expected ok, got ${JSON.stringify(result)}`);
}

function expectDenied(
  role: WorkspaceRole | null,
  permissions: BuildingPermissions,
  action: WorkspaceAction,
  code: "unauthorized" | "forbidden",
  label: string,
  extras?: { isBotOwner?: boolean; hasWorkspaceContext?: boolean }
): void {
  const result = assertWorkspaceAction({
    membership: role ? membership(role) : null,
    permissions,
    action,
    ...extras,
  });
  assert(
    result.ok === false && result.code === code,
    `${label}: expected ${code}, got ${JSON.stringify(result)}`
  );
}

// --- Non-member ---
expectDenied(null, allOff, "workspace.view", "unauthorized", "non-member view → unauthorized");
expectDenied(null, allOff, "members.manage", "unauthorized", "non-member manage → unauthorized");

// --- Role matrix: delete Workspace & manage members (3.2, 3.3, 3.4, 3.6) ---
expectOk("owner", allOff, "workspace.delete", "Owner may delete Workspace");
expectDenied("facilitator", allOff, "workspace.delete", "forbidden", "Facilitator may not delete Workspace");
expectDenied("participant", allOff, "workspace.delete", "forbidden", "Participant may not delete Workspace");

expectOk("owner", allOff, "members.manage", "Owner may manage members");
expectOk("facilitator", allOff, "members.manage", "Facilitator may manage members");
expectDenied("participant", allOff, "members.manage", "forbidden", "Participant may not manage members");

expectOk("owner", allOff, "workspace.updatePermissions", "Owner may update permissions");
expectOk("facilitator", allOff, "workspace.updatePermissions", "Facilitator may update permissions");
expectDenied(
  "participant",
  allOff,
  "workspace.updatePermissions",
  "forbidden",
  "Participant may not update permissions"
);

expectOk("owner", allOff, "workspace.rename", "Owner may rename");
expectOk("facilitator", allOff, "workspace.rename", "Facilitator may rename");
expectDenied("participant", allOff, "workspace.rename", "forbidden", "Participant may not rename");

// --- Permission (a) create into Workspace (5.2) ---
expectOk("owner", allOff, "bots.createIntoWorkspace", "Owner create with (a) off");
expectOk("facilitator", allOff, "bots.createIntoWorkspace", "Facilitator create with (a) off");
expectDenied(
  "participant",
  allOff,
  "bots.createIntoWorkspace",
  "forbidden",
  "Participant create with (a) off"
);
expectOk("participant", allOn, "bots.createIntoWorkspace", "Participant create with (a) on");
expectOk("owner", allOff, "bots.place", "Owner place with (a) off");
expectDenied("participant", allOff, "bots.place", "forbidden", "Participant place with (a) off");
expectOk("participant", allOn, "bots.place", "Participant place with (a) on");

// --- Permission (b) see others (5.3, 5.4) ---
expectOk("owner", allOff, "bots.viewOthers", "Owner see others with (b) off");
expectOk("facilitator", allOff, "bots.viewOthers", "Facilitator see others with (b) off");
expectDenied("participant", allOff, "bots.viewOthers", "forbidden", "Participant see others with (b) off");
expectOk("participant", allOn, "bots.viewOthers", "Participant see others with (b) on");
expectDenied("participant", allOff, "bots.inspectPeer", "forbidden", "Participant inspect peer with (b) off");
expectOk("participant", allOn, "bots.inspectPeer", "Participant inspect peer with (b) on");

// --- Permission (c) share outside — Playlab-scoped (5.5, 5.6, 5.7) ---
// Same-Workspace place/share is NOT gated by (c): with (c) off but (a) on, place still allowed.
const cOffAOn: BuildingPermissions = { ...allOn, canShareOutside: false };
expectOk(
  "participant",
  cOffAOn,
  "bots.place",
  "Participant same-Workspace place allowed when (c) off (not gated by c)"
);

// Beyond-Workspace / educator outward share WITH Workspace context: gated by (c).
expectOk("owner", allOff, "bots.shareEducatorOutside", "Owner share-outside with (c) off");
expectOk("facilitator", allOff, "bots.shareEducatorOutside", "Facilitator share-outside with (c) off");
expectDenied(
  "participant",
  allOff,
  "bots.shareEducatorOutside",
  "forbidden",
  "Participant share-outside with (c) off + Workspace context",
  { hasWorkspaceContext: true }
);
expectOk(
  "participant",
  allOn,
  "bots.shareEducatorOutside",
  "Participant share-outside with (c) on + Workspace context",
  { hasWorkspaceContext: true }
);

// Beyond-Workspace gated ONLY with Workspace context: without context, (c) does not apply.
expectOk(
  "participant",
  allOff,
  "bots.shareEducatorOutside",
  "Participant outward share without Workspace context ignores (c)",
  { hasWorkspaceContext: false }
);

// Publish never gated by (c).
expectOk(
  "participant",
  allOff,
  "bots.publish",
  "Participant publish with (c) off is never gated",
  { isBotOwner: true }
);
{
  const result = assertWorkspaceAction({
    membership: null,
    permissions: allOff,
    action: "bots.publish",
    isBotOwner: true,
  });
  assert(result.ok === true, "null membership publish → ok (never gated by Workspace policy)");
}

// --- Permission (d) manage own (5.8, 5.9) ---
expectDenied(
  "participant",
  allOff,
  "bots.removeOwnPlacement",
  "forbidden",
  "Participant remove own placement with (d) off",
  { isBotOwner: true }
);
expectDenied(
  "participant",
  allOff,
  "bots.deleteOwn",
  "forbidden",
  "Participant delete own with (d) off",
  { isBotOwner: true }
);
expectOk(
  "participant",
  allOn,
  "bots.removeOwnPlacement",
  "Participant remove own placement with (d) on",
  { isBotOwner: true }
);
expectOk(
  "participant",
  allOn,
  "bots.deleteOwn",
  "Participant delete own with (d) on",
  { isBotOwner: true }
);
expectOk(
  "facilitator",
  allOff,
  "bots.removeAnyPlacement",
  "Facilitator may remove any placement with (d) off"
);
expectOk("owner", allOff, "bots.removeAnyPlacement", "Owner may remove any placement");
expectDenied(
  "participant",
  allOn,
  "bots.removeAnyPlacement",
  "forbidden",
  "Participant may not remove any placement"
);
expectDenied(
  "participant",
  allOn,
  "bots.deleteOwn",
  "forbidden",
  "Participant deleteOwn without isBotOwner",
  { isBotOwner: false }
);

// --- Sample matrix summary (task acceptance) ---
const sampleActions: WorkspaceAction[] = [
  "bots.createIntoWorkspace",
  "bots.viewOthers",
  "bots.shareEducatorOutside",
  "bots.removeOwnPlacement",
  "workspace.delete",
  "members.manage",
];

for (const action of sampleActions) {
  expectOk("owner", allOff, action, `Owner matrix ${action}`, {
    isBotOwner: true,
    hasWorkspaceContext: true,
  });
}

for (const action of sampleActions) {
  if (action === "workspace.delete") {
    expectDenied(
      "facilitator",
      allOff,
      action,
      "forbidden",
      `Facilitator matrix ${action}`
    );
  } else {
    expectOk("facilitator", allOff, action, `Facilitator matrix ${action}`, {
      isBotOwner: true,
      hasWorkspaceContext: true,
    });
  }
}

for (const action of sampleActions) {
  expectDenied(
    "participant",
    allOff,
    action,
    "forbidden",
    `Participant matrix all-off ${action}`,
    { isBotOwner: true, hasWorkspaceContext: true }
  );
}

for (const action of [
  "bots.createIntoWorkspace",
  "bots.viewOthers",
  "bots.shareEducatorOutside",
  "bots.removeOwnPlacement",
] as WorkspaceAction[]) {
  expectOk("participant", allOn, action, `Participant matrix all-on ${action}`, {
    isBotOwner: true,
    hasWorkspaceContext: true,
  });
}
expectDenied(
  "participant",
  allOn,
  "workspace.delete",
  "forbidden",
  "Participant matrix all-on workspace.delete"
);
expectDenied(
  "participant",
  allOn,
  "members.manage",
  "forbidden",
  "Participant matrix all-on members.manage"
);

if (failures > 0) {
  console.error(`\npermissions.selftest: ${failures} failure(s)`);
  process.exit(1);
}

console.log("permissions.selftest: all assertions passed");
