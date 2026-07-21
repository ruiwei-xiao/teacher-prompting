/**
 * Self-test: Workspace members UI helpers + wiring (Task 6.4).
 * Run: npx tsx lib/workspace-ui/members.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { WorkspaceMembership, WorkspaceRole } from "@/lib/workspace-store/types";
import {
  buildChangeRoleBody,
  buildRemoveMemberBody,
  buildTransferOwnershipBody,
  canChangeMemberRole,
  canManageMembers,
  canRemoveMember,
  canSelfLeave,
  canTransferOwnership,
  filterMembersByQuery,
  membersApiHref,
  parseMembersListResponse,
  parseMembersMutationResponse,
} from "./members";

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

function member(
  userId: string,
  role: WorkspaceRole,
  joinedAt = "2026-01-01T00:00:00.000Z"
): WorkspaceMembership {
  return {
    workspaceId: "ws_1",
    userId,
    role,
    joinedAt,
  };
}

async function main(): Promise<void> {
  // --- Role capabilities (Req 3.2, 3.3) ---
  assertEqual(canManageMembers("owner"), true, "Owner can manage members");
  assertEqual(
    canManageMembers("facilitator"),
    true,
    "Facilitator can manage members"
  );
  assertEqual(
    canManageMembers("participant"),
    false,
    "Participant cannot manage other members"
  );

  assertEqual(
    canChangeMemberRole({
      actorRole: "owner",
      targetRole: "facilitator",
      isSelf: false,
    }),
    true,
    "Owner can change Facilitator role"
  );
  assertEqual(
    canChangeMemberRole({
      actorRole: "facilitator",
      targetRole: "participant",
      isSelf: false,
    }),
    true,
    "Facilitator can change Participant role"
  );
  assertEqual(
    canChangeMemberRole({
      actorRole: "facilitator",
      targetRole: "owner",
      isSelf: false,
    }),
    false,
    "Facilitator cannot change Owner role"
  );
  assertEqual(
    canChangeMemberRole({
      actorRole: "participant",
      targetRole: "facilitator",
      isSelf: false,
    }),
    false,
    "Participant cannot change roles"
  );
  assertEqual(
    canChangeMemberRole({
      actorRole: "owner",
      targetRole: "owner",
      isSelf: false,
    }),
    false,
    "Owner role changes go through transfer, not role PATCH"
  );

  assertEqual(
    canRemoveMember({
      actorRole: "owner",
      targetRole: "participant",
      isSelf: false,
    }),
    true,
    "Owner can remove Participant"
  );
  assertEqual(
    canRemoveMember({
      actorRole: "facilitator",
      targetRole: "participant",
      isSelf: false,
    }),
    true,
    "Facilitator can remove Participant"
  );
  assertEqual(
    canRemoveMember({
      actorRole: "facilitator",
      targetRole: "owner",
      isSelf: false,
    }),
    false,
    "Facilitator cannot remove Owner"
  );
  assertEqual(
    canRemoveMember({
      actorRole: "participant",
      targetRole: "facilitator",
      isSelf: false,
    }),
    false,
    "Participant cannot remove others"
  );

  // --- Ownership transfer (Req 3.5) ---
  assertEqual(
    canTransferOwnership("owner"),
    true,
    "Owner can transfer ownership"
  );
  assertEqual(
    canTransferOwnership("facilitator"),
    false,
    "Facilitator cannot transfer ownership"
  );
  assertEqual(
    canTransferOwnership("participant"),
    false,
    "Participant cannot transfer ownership"
  );

  // --- Self-leave (Req 2.5) ---
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
    "Owner must transfer before leaving"
  );

  // --- Search narrows long roster (Req 9.1, 9.3) ---
  const roster: WorkspaceMembership[] = [];
  for (let i = 0; i < 120; i += 1) {
    roster.push(
      member(`user_${String(i).padStart(3, "0")}`, "participant")
    );
  }
  roster.push(member("owner_alice", "owner"));
  roster.push(member("fac_bob", "facilitator"));

  assert(roster.length >= 100, "roster has at least 100 members");
  const narrowed = filterMembersByQuery(roster, "user_01");
  assert(
    narrowed.length > 0 && narrowed.every((m) => m.userId.includes("user_01")),
    "search narrows roster to matching userIds"
  );
  assertEqual(
    filterMembersByQuery(roster, "owner_alice").map((m) => m.userId),
    ["owner_alice"],
    "search finds Owner by userId"
  );
  assertEqual(
    filterMembersByQuery(roster, "   ").length,
    roster.length,
    "blank search returns full roster"
  );
  assertEqual(
    filterMembersByQuery(roster, "NO_SUCH_MEMBER").length,
    0,
    "non-matching search returns empty"
  );

  // --- API helpers ---
  assertEqual(
    membersApiHref("ws_1"),
    "/api/workspaces/ws_1/members",
    "members API href"
  );
  assertEqual(
    membersApiHref("ws_1", "alice"),
    "/api/workspaces/ws_1/members?q=alice",
    "members API href with search q"
  );

  assertEqual(
    buildChangeRoleBody("u2", "facilitator"),
    { userId: "u2", role: "facilitator" },
    "PATCH role body"
  );
  assertEqual(
    buildTransferOwnershipBody("u2", "participant"),
    { transferToUserId: "u2", demoteTo: "participant" },
    "PATCH transfer body"
  );
  assertEqual(
    buildRemoveMemberBody("u2"),
    { userId: "u2" },
    "DELETE member body"
  );

  const listed = parseMembersListResponse(200, {
    members: [
      member("u1", "owner"),
      member("u2", "facilitator"),
      member("u3", "participant"),
    ],
  });
  assert(listed.ok === true, "200 members list is ok");
  if (listed.ok) {
    assertEqual(listed.members.length, 3, "parses member roster");
  }

  const listForbidden = parseMembersListResponse(403, { error: "Forbidden" });
  assert(listForbidden.ok === false, "403 members list fails");

  const mutated = parseMembersMutationResponse(200, { ok: true });
  assert(mutated.ok === true, "200 mutation is ok");

  const mutateForbidden = parseMembersMutationResponse(403, {
    error: "Forbidden",
  });
  assert(mutateForbidden.ok === false, "403 mutation fails");

  const leaveBlocked = parseMembersMutationResponse(422, {
    error: "Transfer ownership before leaving",
  });
  assert(leaveBlocked.ok === false, "422 leave-without-transfer fails");

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/members.ts");
  const listPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceMemberList.tsx"
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
  const listSource = await fs.readFile(listPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");
  const hubSource = await fs.readFile(hubPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/members.ts exists");
  assert(
    listSource.includes("WorkspaceMemberList"),
    "WorkspaceMemberList component exists"
  );
  assert(
    listSource.includes("membersApiHref") ||
      (listSource.includes("/api/workspaces/") &&
        listSource.includes("members")),
    "list calls members API"
  );
  assert(
    listSource.includes("GET") ||
      listSource.includes("fetch") ||
      listSource.includes("method"),
    "list loads members via fetch"
  );
  assert(
    listSource.includes("PATCH"),
    "list uses PATCH for role change / transfer"
  );
  assert(
    listSource.includes("DELETE"),
    "list uses DELETE for remove / self-leave"
  );
  assert(
    listSource.includes("filterMembersByQuery") ||
      listSource.includes("search") ||
      listSource.includes("q="),
    "list supports search"
  );
  assert(
    listSource.includes("canManageMembers") ||
      listSource.includes("facilitator") ||
      listSource.includes("participant"),
    "list gates management by role"
  );
  assert(
    listSource.includes("transfer") ||
      listSource.includes("Transfer") ||
      listSource.includes("transferToUserId"),
    "list supports ownership transfer"
  );
  assert(
    listSource.includes("Leave") ||
      listSource.includes("leave") ||
      listSource.includes("canSelfLeave"),
    "list supports self-leave"
  );
  assert(
    hubSource.includes("WorkspaceMemberList"),
    "hub renders WorkspaceMemberList on members tab"
  );
  assert(
    pageSource.includes("redirect") ||
      pageSource.includes("members") ||
      hubSource.includes("WorkspaceNavTabs"),
    "legacy settings route or hub exposes members"
  );
  assert(
    hubSource.includes("WorkspaceNavTabs") ||
      hubSource.includes("Members") ||
      hubSource.includes("members") ||
      hubSource.includes("WorkspaceMemberList"),
    "hub has members entry via tabs or list link"
  );

  if (failures > 0) {
    console.error(`\nmembers.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("members.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("members.selftest crashed:", err);
  process.exit(1);
});
