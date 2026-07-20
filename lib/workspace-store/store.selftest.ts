/**
 * Runtime self-test for WorkspaceStore persistence (Task 1.3).
 * Forces JSON file mode (no Postgres) for reliable local runs.
 *
 * Run: npx tsx lib/workspace-store/store.selftest.ts
 */
import fs from "fs/promises";
import path from "path";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function main(): Promise<void> {
  // Force JSON fallback before loading the store module.
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(process.cwd(), ".data", "workspace-store-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  const dataFile = path.join(tempDir, "workspaces.json");
  process.env.WORKSPACES_DATA_FILE = dataFile;

  const {
    addMember,
    createWorkspace,
    deleteWorkspace,
    getWorkspace,
    listMembers,
    listWorkspacesForUser,
    removeMember,
    setMemberRole,
    transferOwnership,
    updateWorkspace,
  } = await import("./store");

  try {
    const ownerId = "user_owner";
    const otherId = "user_other";

    // --- createWorkspace: creator is Owner; building permissions default all off ---
    const ws = await createWorkspace({ name: "Course A", ownerUserId: ownerId });
    assert(typeof ws.id === "string" && ws.id.length > 0, "createWorkspace assigns id");
    assertEqual(ws.name, "Course A", "createWorkspace stores name");
    assertEqual(
      ws.buildingPermissions,
      {
        canCreateBots: false,
        canSeeOthersBots: false,
        canShareOutside: false,
        canManageOwnBots: false,
      },
      "new Workspace defaults all building permissions off"
    );

    const membersAfterCreate = await listMembers(ws.id);
    assertEqual(membersAfterCreate.length, 1, "createWorkspace adds exactly one membership");
    assertEqual(membersAfterCreate[0]?.userId, ownerId, "creator membership userId");
    assertEqual(membersAfterCreate[0]?.role, "owner", "creator is Owner");
    assertEqual(membersAfterCreate[0]?.workspaceId, ws.id, "creator membership workspaceId");

    // --- listWorkspacesForUser / getWorkspace ---
    const listed = await listWorkspacesForUser(ownerId);
    assertEqual(listed.length, 1, "owner sees created Workspace");
    assertEqual(listed[0]?.id, ws.id, "listed Workspace id matches");

    const emptyList = await listWorkspacesForUser("nobody");
    assertEqual(emptyList.length, 0, "non-member sees no Workspaces");

    const fetched = await getWorkspace(ws.id);
    assert(fetched !== null, "getWorkspace returns created Workspace");
    assertEqual(fetched?.name, "Course A", "getWorkspace name");

    const missing = await getWorkspace("missing-id");
    assertEqual(missing, null, "getWorkspace returns null for unknown id");

    // --- updateWorkspace ---
    const renamed = await updateWorkspace(ws.id, { name: "Course A Renamed" });
    assertEqual(renamed.name, "Course A Renamed", "updateWorkspace renames");
    const withPerms = await updateWorkspace(ws.id, {
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: false,
        canShareOutside: false,
        canManageOwnBots: true,
      },
    });
    assertEqual(withPerms.buildingPermissions.canCreateBots, true, "updateWorkspace permissions (a)");
    assertEqual(withPerms.buildingPermissions.canManageOwnBots, true, "updateWorkspace permissions (d)");
    assertEqual(
      withPerms.buildingPermissions.canSeeOthersBots,
      false,
      "updateWorkspace permissions (b) stays off"
    );

    // --- membership mutations ---
    await addMember({ workspaceId: ws.id, userId: otherId, role: "participant" });
    await setMemberRole(ws.id, otherId, "facilitator");
    const afterRole = await listMembers(ws.id);
    const otherMember = afterRole.find((m) => m.userId === otherId);
    assertEqual(otherMember?.role, "facilitator", "setMemberRole updates role");

    await transferOwnership(ws.id, otherId, "facilitator");
    const afterTransfer = await listMembers(ws.id);
    assertEqual(
      afterTransfer.find((m) => m.userId === otherId)?.role,
      "owner",
      "transferOwnership promotes recipient to Owner"
    );
    assertEqual(
      afterTransfer.find((m) => m.userId === ownerId)?.role,
      "facilitator",
      "transferOwnership demotes previous Owner"
    );
    assertEqual(
      afterTransfer.filter((m) => m.role === "owner").length,
      1,
      "exactly one Owner after transfer"
    );

    // transfer to non-member should fail
    let transferFailed = false;
    try {
      await transferOwnership(ws.id, "not-a-member", "participant");
    } catch {
      transferFailed = true;
    }
    assert(transferFailed, "transferOwnership to non-member throws");

    await removeMember(ws.id, ownerId);
    const afterRemove = await listMembers(ws.id);
    assert(
      afterRemove.every((m) => m.userId !== ownerId),
      "removeMember drops membership"
    );
    const ownerWorkspaces = await listWorkspacesForUser(ownerId);
    assertEqual(ownerWorkspaces.length, 0, "removed member no longer lists Workspace");

    // --- ≥100 members ---
    const large = await createWorkspace({ name: "Large Cohort", ownerUserId: "lead" });
    for (let i = 0; i < 99; i += 1) {
      await addMember({
        workspaceId: large.id,
        userId: `member_${i}`,
        role: "participant",
      });
    }
    const largeMembers = await listMembers(large.id);
    assertEqual(largeMembers.length, 100, "supports at least 100 members");

    const filtered = await listMembers(large.id, "member_1");
    assert(
      filtered.length >= 1 && filtered.every((m) => m.userId.includes("member_1")),
      "listMembers query filters roster"
    );

    // --- deleteWorkspace cascades members only ---
    await deleteWorkspace(large.id);
    assertEqual(await getWorkspace(large.id), null, "deleteWorkspace removes Workspace");
    assertEqual(await listMembers(large.id), [], "deleteWorkspace cascades memberships");
    assertEqual(
      await listWorkspacesForUser("lead"),
      [],
      "deleted Workspace gone from user list"
    );

    // Confirm JSON file mode wrote to the forced path
    const raw = await fs.readFile(dataFile, "utf-8");
    const parsed = JSON.parse(raw) as { workspaces: unknown[]; members: unknown[] };
    assert(Array.isArray(parsed.workspaces), "JSON store has workspaces array");
    assert(Array.isArray(parsed.members), "JSON store has members array");
    assert(
      parsed.workspaces.some(
        (w) => typeof w === "object" && w !== null && (w as { id: string }).id === ws.id
      ),
      "remaining Workspace persisted in JSON file"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nstore.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("store.selftest: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
