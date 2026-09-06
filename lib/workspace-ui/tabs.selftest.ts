/**
 * Self-test: Workspace nav tab helpers.
 * Run: npx tsx lib/workspace-ui/tabs.selftest.ts
 */
import {
  WORKSPACE_TABS,
  isWorkspaceTab,
  resolveWorkspaceTab,
  visibleWorkspaceTabs,
  workspaceTabHref,
} from "./tabs";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(
    actual === expected,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function assertTabs(
  actual: readonly string[],
  expected: readonly string[],
  message: string
): void {
  assertEqual(actual.join(","), expected.join(","), message);
}

assertEqual(workspaceTabHref("ws_1", "bots"), "/workspace/ws_1", "bots href");
assertEqual(
  workspaceTabHref("ws_1", "settings"),
  "/workspace/ws_1?tab=settings",
  "settings href"
);
assertEqual(
  workspaceTabHref("ws_1", "members"),
  "/workspace/ws_1?tab=members",
  "members href"
);
assertEqual(
  workspaceTabHref("ws_1", "activity"),
  "/workspace/ws_1?tab=activity",
  "activity href"
);

assert(
  !WORKSPACE_TABS.some((tab) => tab.id === "invites"),
  "Invites is not a WorkspaceTab"
);
assertEqual(
  isWorkspaceTab("invites"),
  false,
  "isWorkspaceTab rejects invites"
);
assertEqual(
  isWorkspaceTab("activity"),
  true,
  "isWorkspaceTab accepts activity"
);
assertEqual(
  WORKSPACE_TABS.find((tab) => tab.id === "activity")?.label,
  "Activity",
  "Activity tab label is Activity, not Sessions"
);

assertTabs(
  visibleWorkspaceTabs("participant"),
  ["bots"],
  "Participant-visible tabs are Bots only"
);
assertTabs(
  visibleWorkspaceTabs("owner"),
  ["bots", "settings", "members", "activity"],
  "Owner tabs are Bots, Settings, Members, Activity"
);
assertTabs(
  visibleWorkspaceTabs("facilitator"),
  ["bots", "settings", "members", "activity"],
  "Facilitator tabs are Bots, Settings, Members, Activity"
);
assert(
  !visibleWorkspaceTabs("owner").includes("invites" as never) &&
    !visibleWorkspaceTabs("facilitator").includes("invites" as never) &&
    !visibleWorkspaceTabs("participant").includes("invites" as never),
  "Invites is not a visible tab for any role"
);

const hub = "/workspace/ws_1";
const settingsPath = "/workspace/ws_1/settings";

assertEqual(
  resolveWorkspaceTab(hub, "", "ws_1", "owner"),
  "bots",
  "operator hub default is bots"
);
assertEqual(
  resolveWorkspaceTab(hub, "", "ws_1", "participant"),
  "bots",
  "participant hub default is bots"
);
assertEqual(
  resolveWorkspaceTab(hub, "activity", "ws_1", "owner"),
  "activity",
  "operator ?tab=activity resolves to Activity"
);
assertEqual(
  resolveWorkspaceTab(hub, "activity", "ws_1", "facilitator"),
  "activity",
  "facilitator ?tab=activity resolves to Activity"
);
assertEqual(
  resolveWorkspaceTab(hub, "activity", "ws_1", "participant"),
  "bots",
  "participant ?tab=activity resolves to Bots"
);
assertEqual(
  resolveWorkspaceTab(hub, "settings", "ws_1", "owner"),
  "settings",
  "operator ?tab=settings"
);
assertEqual(
  resolveWorkspaceTab(hub, "settings", "ws_1", "participant"),
  "bots",
  "participant ?tab=settings resolves to Bots"
);
assertEqual(
  resolveWorkspaceTab(hub, "members", "ws_1", "facilitator"),
  "members",
  "operator ?tab=members"
);
assertEqual(
  resolveWorkspaceTab(hub, "members", "ws_1", "participant"),
  "bots",
  "participant ?tab=members resolves to Bots"
);
assertEqual(
  resolveWorkspaceTab(hub, "invites", "ws_1", "owner"),
  "members",
  "operator ?tab=invites resolves to Members"
);
assertEqual(
  resolveWorkspaceTab(hub, "invites", "ws_1", "facilitator"),
  "members",
  "facilitator ?tab=invites resolves to Members"
);
assertEqual(
  resolveWorkspaceTab(hub, "invites", "ws_1", "participant"),
  "bots",
  "participant ?tab=invites resolves to Bots"
);
assertEqual(
  resolveWorkspaceTab(settingsPath, "", "ws_1", "owner"),
  "settings",
  "operator legacy settings path defaults to settings"
);
assertEqual(
  resolveWorkspaceTab(settingsPath, "", "ws_1", "participant"),
  "bots",
  "participant legacy settings path resolves to Bots"
);
assertEqual(
  resolveWorkspaceTab(settingsPath, "invites", "ws_1", "owner"),
  "members",
  "operator legacy settings ?tab=invites resolves to Members"
);
assertEqual(
  resolveWorkspaceTab(hub, "unknown", "ws_1", "owner"),
  "bots",
  "unknown tab falls back to bots"
);

if (failures > 0) {
  console.error(`\ntabs.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log("tabs.selftest: all assertions passed");
