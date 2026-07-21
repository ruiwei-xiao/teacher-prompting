/**
 * Self-test: Workspace nav tab helpers.
 * Run: npx tsx lib/workspace-ui/tabs.selftest.ts
 */
import {
  resolveWorkspaceTab,
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

assertEqual(workspaceTabHref("ws_1", "bots"), "/workspace/ws_1", "bots href");
assertEqual(
  workspaceTabHref("ws_1", "settings"),
  "/workspace/ws_1?tab=settings",
  "settings href"
);
assertEqual(
  workspaceTabHref("ws_1", "invites"),
  "/workspace/ws_1?tab=invites",
  "invites href"
);
assertEqual(
  workspaceTabHref("ws_1", "members"),
  "/workspace/ws_1?tab=members",
  "members href"
);

assertEqual(
  resolveWorkspaceTab("/workspace/ws_1", "", "ws_1"),
  "bots",
  "hub default is bots"
);
assertEqual(
  resolveWorkspaceTab("/workspace/ws_1", "activity", "ws_1"),
  "bots",
  "legacy ?tab=activity falls back to bots"
);
assertEqual(
  resolveWorkspaceTab("/workspace/ws_1", "settings", "ws_1"),
  "settings",
  "?tab=settings"
);
assertEqual(
  resolveWorkspaceTab("/workspace/ws_1", "invites", "ws_1"),
  "invites",
  "?tab=invites"
);
assertEqual(
  resolveWorkspaceTab("/workspace/ws_1", "members", "ws_1"),
  "members",
  "?tab=members"
);
assertEqual(
  resolveWorkspaceTab("/workspace/ws_1/settings", "", "ws_1"),
  "settings",
  "legacy settings path defaults to settings"
);

if (failures > 0) {
  console.error(`\ntabs.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log("tabs.selftest: all assertions passed");
