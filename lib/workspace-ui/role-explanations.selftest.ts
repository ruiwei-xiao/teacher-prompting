/**
 * Self-test: Short Owner / Facilitator / Participant explanations (Task 1.4).
 * Run: npx tsx lib/workspace-ui/role-explanations.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { WorkspaceRole } from "@/lib/workspace-store/types";
import {
  WORKSPACE_ROLE_EXPLANATIONS,
  WORKSPACE_ROLE_HINT_IDS,
} from "./role-explanations";

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

function includesAll(
  text: string,
  needles: readonly string[],
  message: string
): void {
  const haystack = text.toLowerCase();
  for (const needle of needles) {
    assert(
      haystack.includes(needle.toLowerCase()),
      `${message}: expected ${JSON.stringify(text)} to include ${JSON.stringify(needle)}`
    );
  }
}

const ROLES: readonly WorkspaceRole[] = ["owner", "facilitator", "participant"];

assertEqual(
  WORKSPACE_ROLE_EXPLANATIONS.owner.title,
  "Owner",
  "6.3 owner display name stays Owner"
);
assertEqual(
  WORKSPACE_ROLE_EXPLANATIONS.facilitator.title,
  "Facilitator",
  "6.3 facilitator display name stays Facilitator"
);
assertEqual(
  WORKSPACE_ROLE_EXPLANATIONS.participant.title,
  "Participant",
  "6.3 participant display name stays Participant"
);

for (const role of ROLES) {
  const explanation = WORKSPACE_ROLE_EXPLANATIONS[role];
  assert(
    Boolean(explanation.title) && Boolean(explanation.summary),
    `${role} has title and summary`
  );
  assert(
    !/\badmin\b/i.test(explanation.title),
    `${role} title is not renamed to Admin`
  );
  assert(
    !/\badmin\b/i.test(explanation.summary),
    `${role} summary does not rename the role to Admin`
  );
  assertEqual(
    WORKSPACE_ROLE_HINT_IDS[role],
    `workspace-role-hint-${role}`,
    `${role} tooltip id is stable`
  );
}

includesAll(
  WORKSPACE_ROLE_EXPLANATIONS.owner.summary,
  ["administers", "Workspace", "delete", "transfer"],
  "6.4 Owner administers, deletes, and transfers"
);

includesAll(
  WORKSPACE_ROLE_EXPLANATIONS.facilitator.summary,
  [
    "day-to-day administration",
    "except",
    "delete",
    "change or remove the Owner",
  ],
  "6.4 Facilitator matches Owner except delete or change/remove Owner"
);

includesAll(
  WORKSPACE_ROLE_EXPLANATIONS.participant.summary,
  [
    "building permissions",
    "cannot change Settings",
    "manage members",
    "view Activity",
  ],
  "6.4 Participant uses building permissions and cannot change Settings, manage members, or view Activity"
);

async function main(): Promise<void> {
  const hintPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceRoleHint.tsx"
  );
  const membersPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceMemberList.tsx"
  );
  const shareLinkPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceShareLinkControl.tsx"
  );

  const hintSource = await fs.readFile(hintPath, "utf8").catch(() => "");
  const membersSource = await fs.readFile(membersPath, "utf8").catch(() => "");
  const shareLinkSource = await fs
    .readFile(shareLinkPath, "utf8")
    .catch(() => "");

  assert(hintSource.length > 0, "WorkspaceRoleHint.tsx exists");
  assert(
    hintSource.includes("WORKSPACE_ROLE_EXPLANATIONS"),
    "WorkspaceRoleHint reads WORKSPACE_ROLE_EXPLANATIONS"
  );
  assert(
    hintSource.includes("?") || hintSource.includes("title="),
    "WorkspaceRoleHint uses hover or a ? control"
  );
  assert(
    hintSource.includes("title=") || hintSource.includes('role="tooltip"'),
    "WorkspaceRoleHint exposes copy on hover or tooltip"
  );
  assert(
    !/\bAdmin\b/.test(hintSource),
    "WorkspaceRoleHint does not rename Owner to Admin"
  );
  assert(
    !/<p[\s>]/.test(hintSource),
    "WorkspaceRoleHint does not add long body paragraphs"
  );
  assert(
    membersSource.includes("WorkspaceRoleHint"),
    "Members wires WorkspaceRoleHint on roster role labels"
  );
  assert(
    shareLinkSource.includes("WorkspaceRoleHint"),
    "share-link role picker wires WorkspaceRoleHint (task 2.3)"
  );

  if (failures > 0) {
    console.error(`\nrole-explanations.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("role-explanations.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("role-explanations.selftest crashed:", err);
  process.exit(1);
});
