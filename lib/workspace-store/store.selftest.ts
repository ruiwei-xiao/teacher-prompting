/**
 * Runtime self-test for WorkspaceStore persistence (Tasks 1.3–1.4).
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

async function expectThrow(
  fn: () => Promise<unknown>,
  message: string
): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
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
    acceptInviteByToken,
    acceptPendingEmailInvitesForUser,
    addMember,
    createInvite,
    createWorkspace,
    deleteWorkspace,
    getInvite,
    getWorkspace,
    listInvites,
    listMembers,
    listPlacements,
    listWorkspacesForUser,
    placeApp,
    removeMember,
    removePlacement,
    revokeInvite,
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

    // =========================================================================
    // Task 1.4 — invites + placements (no AppConfig / ownerId mutation)
    // =========================================================================
    const wsInvite = await createWorkspace({
      name: "Invite Lab",
      ownerUserId: "invite_owner",
    });
    const wsB = await createWorkspace({
      name: "Second Lab",
      ownerUserId: "invite_owner",
    });

    // --- createInvite: link token (high-entropy) + email pending ---
    const linkInvite = await createInvite({
      workspaceId: wsInvite.id,
      kind: "link",
      role: "participant",
      createdByUserId: "invite_owner",
    });
    assert(typeof linkInvite.id === "string" && linkInvite.id.length > 0, "createInvite assigns id");
    assert(
      typeof linkInvite.token === "string" && linkInvite.token.length >= 32,
      "createInvite generates high-entropy token"
    );
    assertEqual(linkInvite.kind, "link", "link invite kind");
    assertEqual(linkInvite.role, "participant", "link invite role frozen");
    assertEqual(linkInvite.workspaceId, wsInvite.id, "link invite workspaceId");
    assertEqual(linkInvite.revokedAt, undefined, "new invite not revoked");

    const emailInvite = await createInvite({
      workspaceId: wsInvite.id,
      kind: "email",
      email: "New.Teacher@School.edu",
      role: "facilitator",
      createdByUserId: "invite_owner",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assertEqual(emailInvite.kind, "email", "email invite kind");
    assertEqual(emailInvite.email, "New.Teacher@School.edu", "email invite stores email");
    assertEqual(emailInvite.role, "facilitator", "email invite role is Facilitator");

    const listedInvites = await listInvites(wsInvite.id);
    assertEqual(listedInvites.length, 2, "listInvites returns both invites");
    const fetchedInvite = await getInvite(wsInvite.id, linkInvite.id);
    assertEqual(fetchedInvite?.token, linkInvite.token, "getInvite returns invite by id");

    // --- acceptInviteByToken: join + idempotent retry ---
    const join = await acceptInviteByToken(linkInvite.token, "joiner_1");
    assertEqual(join.workspaceId, wsInvite.id, "acceptInviteByToken returns workspaceId");
    const joinMembers = await listMembers(wsInvite.id);
    assertEqual(
      joinMembers.find((m) => m.userId === "joiner_1")?.role,
      "participant",
      "link accept adds Participant membership"
    );
    const joinAgain = await acceptInviteByToken(linkInvite.token, "joiner_1");
    assertEqual(joinAgain.workspaceId, wsInvite.id, "acceptInviteByToken idempotent");
    assertEqual(
      (await listMembers(wsInvite.id)).filter((m) => m.userId === "joiner_1").length,
      1,
      "acceptInviteByToken does not duplicate membership"
    );
    // second user via same link
    await acceptInviteByToken(linkInvite.token, "joiner_2");
    assert(
      (await listMembers(wsInvite.id)).some((m) => m.userId === "joiner_2"),
      "valid link allows another educator to join"
    );

    // --- revoke / expiry rejection ---
    await revokeInvite(wsInvite.id, linkInvite.id);
    const revoked = await getInvite(wsInvite.id, linkInvite.id);
    assert(typeof revoked?.revokedAt === "string", "revokeInvite sets revokedAt");
    await expectThrow(
      () => acceptInviteByToken(linkInvite.token, "late_joiner"),
      "revoked invite token is rejected"
    );

    const expiredInvite = await createInvite({
      workspaceId: wsInvite.id,
      kind: "link",
      role: "participant",
      createdByUserId: "invite_owner",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expectThrow(
      () => acceptInviteByToken(expiredInvite.token, "late_joiner"),
      "expired invite token is rejected"
    );

    // --- acceptPendingEmailInvitesForUser (case-insensitive email) ---
    const pendingIds = await acceptPendingEmailInvitesForUser(
      "email_user",
      "new.teacher@school.edu"
    );
    assert(pendingIds.includes(wsInvite.id), "pending email invite accepted into Workspace");
    assertEqual(
      (await listMembers(wsInvite.id)).find((m) => m.userId === "email_user")?.role,
      "facilitator",
      "email invite grants Facilitator role"
    );
    const pendingAgain = await acceptPendingEmailInvitesForUser(
      "email_user",
      "NEW.TEACHER@SCHOOL.EDU"
    );
    assert(
      pendingAgain.includes(wsInvite.id),
      "acceptPendingEmailInvitesForUser is idempotent"
    );
    assertEqual(
      (await listMembers(wsInvite.id)).filter((m) => m.userId === "email_user").length,
      1,
      "email accept does not duplicate membership"
    );

    // --- placements: multi-Workspace, unique per Workspace, no AppConfig ---
    const appId = "bot_owned_by_educator";
    await placeApp(wsInvite.id, appId, "invite_owner");
    await placeApp(wsB.id, appId, "invite_owner");
    const placementsA = await listPlacements(wsInvite.id);
    const placementsB = await listPlacements(wsB.id);
    assertEqual(placementsA.length, 1, "placeApp lists in first Workspace");
    assertEqual(placementsB.length, 1, "same bot placed in second Workspace");
    assertEqual(placementsA[0]?.appId, appId, "placement appId");
    assertEqual(placementsA[0]?.placedByUserId, "invite_owner", "placement placedByUserId");
    assertEqual(placementsB[0]?.workspaceId, wsB.id, "second placement workspaceId");

    // idempotent place in same Workspace
    await placeApp(wsInvite.id, appId, "invite_owner");
    assertEqual(
      (await listPlacements(wsInvite.id)).length,
      1,
      "placeApp is idempotent per Workspace"
    );

    await placeApp(wsInvite.id, "other_bot", "invite_owner");
    assertEqual(
      (await listPlacements(wsInvite.id)).length,
      2,
      "distinct bots can both be placed"
    );

    await removePlacement(wsInvite.id, appId);
    assertEqual(
      (await listPlacements(wsInvite.id)).map((p) => p.appId).sort(),
      ["other_bot"],
      "removePlacement drops only that Workspace placement"
    );
    assertEqual(
      (await listPlacements(wsB.id)).length,
      1,
      "removePlacement leaves other Workspace placements intact"
    );

    // --- delete cascades invites + placements (bots untouched — store never holds AppConfig) ---
    await deleteWorkspace(wsInvite.id);
    assertEqual(await listInvites(wsInvite.id), [], "deleteWorkspace cascades invites");
    assertEqual(await listPlacements(wsInvite.id), [], "deleteWorkspace cascades placements");
    assertEqual(
      (await listPlacements(wsB.id)).length,
      1,
      "deleting one Workspace leaves other placements"
    );

    // Confirm JSON file mode wrote invites/placements arrays
    const raw = await fs.readFile(dataFile, "utf-8");
    const parsed = JSON.parse(raw) as {
      workspaces: unknown[];
      members: unknown[];
      invites?: unknown[];
      placements?: unknown[];
    };
    assert(Array.isArray(parsed.workspaces), "JSON store has workspaces array");
    assert(Array.isArray(parsed.members), "JSON store has members array");
    assert(Array.isArray(parsed.invites), "JSON store has invites array");
    assert(Array.isArray(parsed.placements), "JSON store has placements array");
    assert(
      parsed.workspaces.some(
        (w) => typeof w === "object" && w !== null && (w as { id: string }).id === ws.id
      ),
      "remaining Workspace persisted in JSON file"
    );
    assert(
      parsed.workspaces.some(
        (w) => typeof w === "object" && w !== null && (w as { id: string }).id === wsB.id
      ),
      "second Workspace persisted after invite/placement tests"
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
