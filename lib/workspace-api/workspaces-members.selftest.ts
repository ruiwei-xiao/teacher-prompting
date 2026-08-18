/**
 * Self-test: WorkspacesAPI membership handlers (Task 2.2).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-members.selftest.ts
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
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(process.cwd(), ".data", "workspaces-members-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const {
    changeMemberRole,
    listWorkspaceMembers,
    removeWorkspaceMember,
    transferWorkspaceOwnership,
  } = await import("./workspaces-members");
  const {
    addMember,
    acceptPendingEmailInvitesForUser,
    createInvite,
    createWorkspace,
    listActivity,
    listMembers,
    listWorkspacesForUser,
  } = await import("../workspace-store/store");

  try {
    // --- Unauthorized ---
    assertEqual(
      (await listWorkspaceMembers(null, "any")).status,
      401,
      "GET members without auth → 401"
    );
    assertEqual(
      (await changeMemberRole(null, "any", { userId: "x", role: "participant" }))
        .status,
      401,
      "PATCH role without auth → 401"
    );
    assertEqual(
      (
        await transferWorkspaceOwnership(null, "any", {
          transferToUserId: "x",
          demoteTo: "facilitator",
        })
      ).status,
      401,
      "PATCH transfer without auth → 401"
    );
    assertEqual(
      (await removeWorkspaceMember(null, "any", { userId: "x" })).status,
      401,
      "DELETE member without auth → 401"
    );

    const ownerId = "owner_1";
    const ws = await createWorkspace({ name: "Cohort", ownerUserId: ownerId });

    // --- Non-member / missing ---
    assertEqual(
      (await listWorkspaceMembers("stranger", ws.id)).status,
      403,
      "non-member list → 403"
    );
    assertEqual(
      (await listWorkspaceMembers(ownerId, "missing-id")).status,
      404,
      "missing workspace list → 404"
    );

    // --- Facilitator + Participant setup ---
    const facId = "fac_1";
    const partId = "part_1";
    const part2Id = "part_2";
    await addMember({ workspaceId: ws.id, userId: facId, role: "facilitator" });
    await addMember({ workspaceId: ws.id, userId: partId, role: "participant" });
    await addMember({ workspaceId: ws.id, userId: part2Id, role: "participant" });

    // --- List as member ---
    const listed = await listWorkspaceMembers(partId, ws.id);
    assertEqual(listed.status, 200, "Participant list → 200");
    assert(
      listed.ok && listed.body.members.length === 4,
      "list returns all members"
    );

    const labeledSelf = await listWorkspaceMembers(ownerId, ws.id, undefined, {
      email: "owner@school.edu",
      name: "Owner Name",
    });
    assert(labeledSelf.ok === true, "viewer-labeled list ok");
    if (labeledSelf.ok) {
      const ownerRow = labeledSelf.body.members.find(
        (row) => row.userId === ownerId
      );
      assertEqual(ownerRow?.email, "owner@school.edu", "viewer email labels self");
      assertEqual(ownerRow?.name, "Owner Name", "viewer name labels self");
      const otherRow = labeledSelf.body.members.find(
        (row) => row.userId === partId
      );
      assertEqual(
        otherRow?.email,
        null,
        "viewer profile does not leak onto other members"
      );
    }

    await createInvite({
      workspaceId: ws.id,
      kind: "email",
      email: "invited@school.edu",
      role: "participant",
      createdByUserId: ownerId,
    });
    const invitedId = "invited_user";
    await acceptPendingEmailInvitesForUser(invitedId, "invited@school.edu");
    const afterInvite = await listWorkspaceMembers(ownerId, ws.id);
    assert(afterInvite.ok === true, "list after email invite accept ok");
    if (afterInvite.ok) {
      const invitedRow = afterInvite.body.members.find(
        (row) => row.userId === invitedId
      );
      assertEqual(
        invitedRow?.email,
        "invited@school.edu",
        "accepted email invite labels the joined member"
      );
    }

    // --- Search q= ---
    const searched = await listWorkspaceMembers(facId, ws.id, "part_1");
    assertEqual(searched.status, 200, "search → 200");
    assert(
      searched.ok &&
        searched.body.members.length === 1 &&
        searched.body.members[0]?.userId === partId,
      "search filters roster"
    );

    // --- Participant cannot manage others ---
    assertEqual(
      (
        await changeMemberRole(partId, ws.id, {
          userId: part2Id,
          role: "facilitator",
        })
      ).status,
      403,
      "Participant change role → 403"
    );
    assertEqual(
      (await removeWorkspaceMember(partId, ws.id, { userId: part2Id })).status,
      403,
      "Participant remove other → 403"
    );
    assertEqual(
      (
        await transferWorkspaceOwnership(partId, ws.id, {
          transferToUserId: facId,
          demoteTo: "facilitator",
        })
      ).status,
      403,
      "Participant transfer → 403"
    );

    // --- Facilitator may change non-Owner roles ---
    const roleChange = await changeMemberRole(facId, ws.id, {
      userId: part2Id,
      role: "facilitator",
    });
    assertEqual(roleChange.status, 200, "Facilitator promote participant → 200");
    const afterPromote = await listMembers(ws.id);
    assertEqual(
      afterPromote.find((m) => m.userId === part2Id)?.role,
      "facilitator",
      "role updated to facilitator"
    );

    // --- Facilitator cannot change/remove Owner ---
    assertEqual(
      (
        await changeMemberRole(facId, ws.id, {
          userId: ownerId,
          role: "facilitator",
        })
      ).status,
      403,
      "Facilitator change Owner → 403"
    );
    assertEqual(
      (await removeWorkspaceMember(facId, ws.id, { userId: ownerId })).status,
      403,
      "Facilitator remove Owner → 403"
    );

    // --- Cannot assign owner via role PATCH ---
    assertEqual(
      (
        await changeMemberRole(ownerId, ws.id, {
          userId: partId,
          role: "owner",
        })
      ).status,
      400,
      "role=owner via PATCH → 400"
    );

    // --- Owner removes member → member.removed ---
    const removed = await removeWorkspaceMember(ownerId, ws.id, {
      userId: part2Id,
    });
    assertEqual(removed.status, 200, "Owner remove → 200");
    assert(
      !(await listMembers(ws.id)).some((m) => m.userId === part2Id),
      "removed member gone from roster"
    );
    assertEqual(
      await listWorkspacesForUser(part2Id),
      [],
      "removed user no longer lists Workspace"
    );
    const activityAfterRemove = await listActivity(ws.id, {
      viewerRole: "owner",
    });
    assert(
      activityAfterRemove.some(
        (e) =>
          e.type === "member.removed" &&
          e.actorUserId === ownerId &&
          e.payload.userId === part2Id
      ),
      "activity member.removed appended"
    );

    // --- Self-leave (Participant) → member.left ---
    const left = await removeWorkspaceMember(partId, ws.id, { userId: partId });
    assertEqual(left.status, 200, "Participant self-leave → 200");
    assertEqual(
      await listWorkspacesForUser(partId),
      [],
      "self-leave drops Workspace from list"
    );
    const activityAfterLeave = await listActivity(ws.id, {
      viewerRole: "owner",
    });
    assert(
      activityAfterLeave.some(
        (e) =>
          e.type === "member.left" &&
          e.actorUserId === partId &&
          e.payload.userId === partId
      ),
      "activity member.left appended"
    );

    // --- Owner cannot leave without transfer ---
    assertEqual(
      (await removeWorkspaceMember(ownerId, ws.id, { userId: ownerId })).status,
      422,
      "Owner self-leave without transfer → 422"
    );

    // --- Transfer to non-member → 422 ---
    assertEqual(
      (
        await transferWorkspaceOwnership(ownerId, ws.id, {
          transferToUserId: "not_a_member",
          demoteTo: "facilitator",
        })
      ).status,
      422,
      "transfer to non-member → 422"
    );

    // --- Facilitator cannot transfer ---
    assertEqual(
      (
        await transferWorkspaceOwnership(facId, ws.id, {
          transferToUserId: facId,
          demoteTo: "participant",
        })
      ).status,
      403,
      "Facilitator transfer → 403"
    );

    // --- Ownership transfer: sole Owner; demote previous ---
    const transfer = await transferWorkspaceOwnership(ownerId, ws.id, {
      transferToUserId: facId,
      demoteTo: "participant",
    });
    assertEqual(transfer.status, 200, "Owner transfer → 200");
    const afterTransfer = await listMembers(ws.id);
    assertEqual(
      afterTransfer.filter((m) => m.role === "owner").length,
      1,
      "exactly one Owner after transfer"
    );
    assertEqual(
      afterTransfer.find((m) => m.userId === facId)?.role,
      "owner",
      "recipient is Owner"
    );
    assertEqual(
      afterTransfer.find((m) => m.userId === ownerId)?.role,
      "participant",
      "previous Owner demoted"
    );

    // Former Owner (now Participant) cannot manage members
    assertEqual(
      (
        await changeMemberRole(ownerId, ws.id, {
          userId: facId,
          role: "facilitator",
        })
      ).status,
      403,
      "demoted former Owner manage → 403"
    );

    // New Owner can leave after transferring again to former owner
    await addMember({
      workspaceId: ws.id,
      userId: "part_new",
      role: "participant",
    });
    // New owner (facId) transfers to ownerId as facilitator demotion target of current
    // Actually transfer demotes current owner (facId) and promotes ownerId
    const transferBack = await transferWorkspaceOwnership(facId, ws.id, {
      transferToUserId: ownerId,
      demoteTo: "facilitator",
    });
    assertEqual(transferBack.status, 200, "transfer back → 200");

    // Facilitator (facId) may self-leave
    const facLeave = await removeWorkspaceMember(facId, ws.id, {
      userId: facId,
    });
    assertEqual(facLeave.status, 200, "Facilitator self-leave → 200");
    assertEqual(
      await listWorkspacesForUser(facId),
      [],
      "Facilitator leave drops Workspace from list"
    );

    // --- ≥100 members + search (9.1, 9.3) ---
    const large = await createWorkspace({
      name: "Large Course",
      ownerUserId: "large_owner",
    });
    for (let i = 0; i < 99; i++) {
      await addMember({
        workspaceId: large.id,
        userId: `member_${String(i).padStart(3, "0")}`,
        role: "participant",
      });
    }
    const largeList = await listWorkspaceMembers("large_owner", large.id);
    assertEqual(largeList.status, 200, "large roster list → 200");
    assert(
      largeList.ok && largeList.body.members.length === 100,
      "supports ≥100 members"
    );
    const largeSearch = await listWorkspaceMembers(
      "large_owner",
      large.id,
      "member_01"
    );
    assert(
      largeSearch.ok &&
        largeSearch.body.members.length >= 1 &&
        largeSearch.body.members.every((m) => m.userId.includes("member_01")),
      "large roster search filters"
    );

    // --- Bad request bodies ---
    assertEqual(
      (await changeMemberRole(ownerId, ws.id, {})).status,
      400,
      "PATCH missing fields → 400"
    );
    assertEqual(
      (await removeWorkspaceMember(ownerId, ws.id, {})).status,
      400,
      "DELETE missing userId → 400"
    );
    assertEqual(
      (
        await removeWorkspaceMember(ownerId, ws.id, {
          userId: "ghost_user",
        })
      ).status,
      404,
      "remove non-member → 404"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: WorkspacesAPI membership handlers (list/search/role/remove/leave/transfer)"
  );
}

void main();
