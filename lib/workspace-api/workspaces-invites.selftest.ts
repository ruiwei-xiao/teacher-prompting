/**
 * Self-test: WorkspacesAPI invite + join handlers (Task 2.2).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-invites.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { WorkspaceInvite } from "@/lib/workspace-store/types";

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

function isActiveLink(invite: WorkspaceInvite, role: string): boolean {
  if (invite.kind !== "link" || invite.role !== role || invite.revokedAt) {
    return false;
  }
  if (
    invite.expiresAt &&
    new Date(invite.expiresAt).getTime() <= Date.now()
  ) {
    return false;
  }
  return true;
}

function assertCanonicalLink(
  invite: WorkspaceInvite | undefined,
  role: "facilitator" | "participant",
  message: string
): void {
  assert(
    invite !== undefined &&
      invite.kind === "link" &&
      invite.role === role &&
      invite.revokedAt === undefined &&
      typeof invite.token === "string" &&
      invite.token.length >= 32,
    message
  );
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(process.cwd(), ".data", "workspaces-invites-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const {
    acceptInviteByTokenApi,
    createWorkspaceInvite,
    listWorkspaceInvites,
    revokeWorkspaceInvite,
  } = await import("./workspaces-invites");
  const {
    addMember,
    createInvite,
    createWorkspace,
    listActivity,
    listInvites,
    listMembers,
    listWorkspacesForUser,
  } = await import("../workspace-store/store");

  try {
    // --- Unauthorized ---
    assertEqual(
      (await listWorkspaceInvites(null, "any")).status,
      401,
      "GET invites without auth → 401"
    );
    assertEqual(
      (
        await createWorkspaceInvite(null, "any", {
          kind: "email",
          email: "a@b.c",
          role: "participant",
        })
      ).status,
      401,
      "POST email invite without auth → 401"
    );
    assertEqual(
      (
        await createWorkspaceInvite(null, "any", {
          kind: "resetLink",
          role: "participant",
        })
      ).status,
      401,
      "POST resetLink without auth → 401"
    );
    assertEqual(
      (await revokeWorkspaceInvite(null, "any", { inviteId: "x" })).status,
      401,
      "DELETE invite without auth → 401"
    );
    assertEqual(
      (await acceptInviteByTokenApi(null, "tok")).status,
      401,
      "POST join without auth → 401"
    );

    const ownerId = "owner_1";
    const ws = await createWorkspace({ name: "Cohort", ownerUserId: ownerId });
    const facId = "fac_1";
    const partId = "part_1";
    await addMember({ workspaceId: ws.id, userId: facId, role: "facilitator" });
    await addMember({ workspaceId: ws.id, userId: partId, role: "participant" });

    // --- Missing workspace ---
    assertEqual(
      (await listWorkspaceInvites(ownerId, "missing-id")).status,
      404,
      "missing workspace list → 404"
    );

    // --- Non-member / Participant cannot manage invites (Req 2.12) ---
    assertEqual(
      (await listWorkspaceInvites("stranger", ws.id)).status,
      403,
      "non-member list → 403"
    );
    assertEqual(
      (await listWorkspaceInvites(partId, ws.id)).status,
      403,
      "Participant GET invites → 403"
    );
    assertEqual(
      (
        await createWorkspaceInvite(partId, ws.id, {
          kind: "email",
          email: "student@school.edu",
          role: "participant",
        })
      ).status,
      403,
      "Participant POST email → 403"
    );
    assertEqual(
      (
        await createWorkspaceInvite(partId, ws.id, {
          kind: "resetLink",
          role: "participant",
        })
      ).status,
      403,
      "Participant POST resetLink → 403"
    );
    assertEqual(
      (
        await revokeWorkspaceInvite(partId, ws.id, { inviteId: "any" })
      ).status,
      403,
      "Participant DELETE invite → 403"
    );
    assertEqual(
      (
        await createWorkspaceInvite(partId, ws.id, {
          kind: "link",
          role: "participant",
        })
      ).status,
      403,
      "Participant POST kind=link → 403"
    );

    // --- Operator GET ensure-if-missing: one URL per role (Req 2.4, 2.6) ---
    const listedEmpty = await listWorkspaceInvites(ownerId, ws.id);
    assertEqual(listedEmpty.status, 200, "Owner GET invites → 200");
    assert(
      listedEmpty.ok &&
        listedEmpty.body.linkByRole !== undefined &&
        listedEmpty.body.pendingEmails !== undefined,
      "GET body is { linkByRole, pendingEmails }"
    );
    const firstFacilitator = listedEmpty.ok
      ? listedEmpty.body.linkByRole?.facilitator
      : undefined;
    const firstParticipant = listedEmpty.ok
      ? listedEmpty.body.linkByRole?.participant
      : undefined;
    assertCanonicalLink(
      firstFacilitator,
      "facilitator",
      "GET linkByRole.facilitator is an active link"
    );
    assertCanonicalLink(
      firstParticipant,
      "participant",
      "GET linkByRole.participant is an active link"
    );
    assertEqual(
      listedEmpty.ok ? listedEmpty.body.pendingEmails?.length ?? -1 : -1,
      0,
      "GET pendingEmails empty when none recorded"
    );
    assert(
      firstFacilitator?.id !== firstParticipant?.id &&
        firstFacilitator?.token !== firstParticipant?.token,
      "facilitator and participant share links are distinct"
    );

    const listedAgain = await listWorkspaceInvites(facId, ws.id);
    assertEqual(listedAgain.status, 200, "Facilitator GET invites → 200");
    assertEqual(
      listedAgain.ok ? listedAgain.body.linkByRole?.facilitator?.token : "",
      firstFacilitator?.token ?? "missing",
      "second GET does not mint a new facilitator token"
    );
    assertEqual(
      listedAgain.ok ? listedAgain.body.linkByRole?.participant?.token : "",
      firstParticipant?.token ?? "missing",
      "second GET does not mint a new participant token"
    );
    const afterCopyInvites = await listInvites(ws.id);
    assertEqual(
      afterCopyInvites.filter((i) => isActiveLink(i, "facilitator")).length,
      1,
      "GET/copy does not stack facilitator links"
    );
    assertEqual(
      afterCopyInvites.filter((i) => isActiveLink(i, "participant")).length,
      1,
      "GET/copy does not stack participant links"
    );

    // --- POST kind=link is no longer a stacking create ---
    assertEqual(
      (
        await createWorkspaceInvite(ownerId, ws.id, {
          kind: "link",
          role: "participant",
        })
      ).status,
      400,
      "POST kind=link → 400 (use GET or resetLink)"
    );
    assertEqual(
      (await listInvites(ws.id)).filter((i) => isActiveLink(i, "participant"))
        .length,
      1,
      "rejected kind=link does not stack a participant link"
    );

    // --- Facilitator records email invite (Req 2.2, 2.8) ---
    const emailCreated = await createWorkspaceInvite(facId, ws.id, {
      kind: "email",
      email: "New.Teacher@School.edu",
      role: "facilitator",
    });
    assertEqual(emailCreated.status, 200, "Facilitator create email → 200");
    assert(
      emailCreated.ok &&
        emailCreated.body.invite.kind === "email" &&
        emailCreated.body.invite.email === "New.Teacher@School.edu" &&
        emailCreated.body.invite.role === "facilitator" &&
        emailCreated.body.invite.createdByUserId === facId,
      "email invite stores pending email with acting user as createdByUserId"
    );

    const listedWithEmail = await listWorkspaceInvites(ownerId, ws.id);
    assert(
      listedWithEmail.ok &&
        listedWithEmail.body.pendingEmails?.length === 1 &&
        listedWithEmail.body.pendingEmails?.[0]?.kind === "email" &&
        listedWithEmail.body.pendingEmails?.[0]?.email ===
          "New.Teacher@School.edu" &&
        listedWithEmail.body.pendingEmails?.every((i) => i.kind === "email"),
      "GET pendingEmails lists the recorded email invite, not share links"
    );
    assertEqual(
      listedWithEmail.ok
        ? listedWithEmail.body.linkByRole?.participant?.token
        : "",
      firstParticipant?.token ?? "missing",
      "recording email does not change the current participant URL"
    );

    // --- Invite role Owner rejected ---
    assertEqual(
      (
        await createWorkspaceInvite(ownerId, ws.id, {
          kind: "email",
          email: "owner@school.edu",
          role: "owner",
        })
      ).status,
      400,
      "role=owner via email invite → 400"
    );
    assertEqual(
      (
        await createWorkspaceInvite(ownerId, ws.id, {
          kind: "resetLink",
          role: "owner",
        })
      ).status,
      400,
      "role=owner via resetLink → 400"
    );

    // --- Email kind requires email ---
    assertEqual(
      (
        await createWorkspaceInvite(ownerId, ws.id, {
          kind: "email",
          role: "participant",
        })
      ).status,
      400,
      "email kind without email → 400"
    );

    // --- Join via current share link from GET (Req 2.3 reuse via existing accept) ---
    const participantLink = firstParticipant;
    const joinerId = "joiner_1";
    const joined = await acceptInviteByTokenApi(
      joinerId,
      participantLink?.token ?? ""
    );
    assertEqual(joined.status, 200, "valid link join → 200");
    assertEqual(
      joined.ok ? joined.body.workspaceId : null,
      ws.id,
      "join returns workspaceId"
    );
    assert(
      (await listMembers(ws.id)).some(
        (m) => m.userId === joinerId && m.role === "participant"
      ),
      "join adds membership at invite role"
    );
    assert(
      (await listWorkspacesForUser(joinerId)).some((w) => w.id === ws.id),
      "joined user lists Workspace"
    );
    const activityAfterJoin = await listActivity(ws.id, {
      viewerRole: "owner",
    });
    assert(
      activityAfterJoin.some(
        (e) =>
          e.type === "member.joined" &&
          e.actorUserId === joinerId &&
          e.payload.userId === joinerId
      ),
      "activity member.joined appended"
    );

    // --- Idempotent re-join does not duplicate activity ---
    const activityCountBefore = (
      await listActivity(ws.id, { viewerRole: "owner" })
    ).filter((e) => e.type === "member.joined" && e.actorUserId === joinerId)
      .length;
    const rejoin = await acceptInviteByTokenApi(
      joinerId,
      participantLink?.token ?? ""
    );
    assertEqual(rejoin.status, 200, "idempotent re-join → 200");
    const activityCountAfter = (
      await listActivity(ws.id, { viewerRole: "owner" })
    ).filter((e) => e.type === "member.joined" && e.actorUserId === joinerId)
      .length;
    assertEqual(
      activityCountAfter,
      activityCountBefore,
      "re-join does not append duplicate member.joined"
    );

    // --- Burst joins via same current URL ---
    for (let i = 0; i < 5; i++) {
      const r = await acceptInviteByTokenApi(
        `burst_${i}`,
        participantLink?.token ?? ""
      );
      assertEqual(r.status, 200, `burst join ${i} → 200`);
    }
    assert(
      (await listMembers(ws.id)).filter((m) => m.userId.startsWith("burst_"))
        .length === 5,
      "burst sequential joins succeed"
    );

    // --- POST resetLink returns a new URL; old token cannot join (Req 2.9) ---
    const resetParticipant = await createWorkspaceInvite(ownerId, ws.id, {
      kind: "resetLink",
      role: "participant",
    });
    assertEqual(resetParticipant.status, 200, "Owner resetLink → 200");
    assert(
      resetParticipant.ok &&
        resetParticipant.body.invite.kind === "link" &&
        resetParticipant.body.invite.role === "participant" &&
        resetParticipant.body.invite.revokedAt === undefined &&
        resetParticipant.body.invite.token !== participantLink?.token,
      "resetLink returns a new active participant link"
    );
    const afterResetGet = await listWorkspaceInvites(facId, ws.id);
    assertEqual(
      afterResetGet.ok ? afterResetGet.body.linkByRole?.participant?.token : "",
      resetParticipant.ok ? resetParticipant.body.invite.token : "missing",
      "GET after reset shows the replacement URL"
    );
    assertEqual(
      afterResetGet.ok ? afterResetGet.body.linkByRole?.facilitator?.token : "",
      firstFacilitator?.token ?? "missing",
      "resetting participant leaves facilitator URL unchanged"
    );
    assertEqual(
      (await listInvites(ws.id)).filter((i) => isActiveLink(i, "participant"))
        .length,
      1,
      "reset leaves exactly one active participant link"
    );
    const lateJoin = await acceptInviteByTokenApi(
      "late_joiner",
      participantLink?.token ?? ""
    );
    assertEqual(lateJoin.status, 410, "pre-reset link join → 410");
    assert(
      !lateJoin.ok &&
        typeof lateJoin.body.error === "string" &&
        /no longer valid|revoked/i.test(lateJoin.body.error),
      "reset join error is clear"
    );
    const newJoin = await acceptInviteByTokenApi(
      "fresh_joiner",
      resetParticipant.ok ? resetParticipant.body.invite.token : ""
    );
    assertEqual(newJoin.status, 200, "replacement link join → 200");

    // --- DELETE revokes pending email, not share links (Req 2.8, 2.12) ---
    const pendingId = emailCreated.ok ? emailCreated.body.invite.id : "";
    const revokeEmail = await revokeWorkspaceInvite(ownerId, ws.id, {
      inviteId: pendingId,
    });
    assertEqual(revokeEmail.status, 200, "Owner revoke pending email → 200");
    const afterRevokeEmail = await listInvites(ws.id);
    assert(
      typeof afterRevokeEmail.find((i) => i.id === pendingId)?.revokedAt ===
        "string",
      "revoke sets revokedAt on pending email"
    );
    const listedAfterRevoke = await listWorkspaceInvites(ownerId, ws.id);
    assert(
      listedAfterRevoke.ok &&
        !listedAfterRevoke.body.pendingEmails?.some((i) => i.id === pendingId),
      "revoked email is not in pendingEmails"
    );

    const shareLinkId = listedAfterRevoke.ok
      ? listedAfterRevoke.body.linkByRole?.facilitator?.id
      : "";
    assertEqual(
      (
        await revokeWorkspaceInvite(ownerId, ws.id, { inviteId: shareLinkId })
      ).status,
      404,
      "DELETE of a share link inviteId → 404"
    );
    assertEqual(
      (await listInvites(ws.id)).find((i) => i.id === shareLinkId)?.revokedAt,
      undefined,
      "DELETE does not revoke the current share link"
    );

    // --- GET must not revoke existing extra links (Req 2.6) ---
    const wsLegacy = await createWorkspace({
      name: "Legacy Links",
      ownerUserId: ownerId,
    });
    const legacyOlder = await createInvite({
      workspaceId: wsLegacy.id,
      kind: "link",
      role: "participant",
      createdByUserId: ownerId,
    });
    await new Promise((r) => setTimeout(r, 5));
    const legacyNewer = await createInvite({
      workspaceId: wsLegacy.id,
      kind: "link",
      role: "participant",
      createdByUserId: ownerId,
    });
    const listedLegacy = await listWorkspaceInvites(ownerId, wsLegacy.id);
    assertEqual(listedLegacy.status, 200, "GET with extra links → 200");
    assertEqual(
      listedLegacy.ok ? listedLegacy.body.linkByRole?.participant?.id : "",
      legacyNewer.id,
      "GET shows newest participant URL when extras exist"
    );
    assertEqual(
      (await listInvites(wsLegacy.id)).filter((i) =>
        isActiveLink(i, "participant")
      ).length,
      2,
      "GET does not revoke extra legacy participant links"
    );
    const extraJoin = await acceptInviteByTokenApi(
      "legacy_older_joiner",
      legacyOlder.token
    );
    assertEqual(extraJoin.status, 200, "legacy extra link stays joinable until reset");

    const resetLegacy = await createWorkspaceInvite(ownerId, wsLegacy.id, {
      kind: "resetLink",
      role: "participant",
    });
    assert(resetLegacy.ok, "reset legacy extras");
    assertEqual(
      (
        await acceptInviteByTokenApi("legacy_after_reset", legacyOlder.token)
      ).status,
      410,
      "older extra token after reset → 410"
    );
    assertEqual(
      (
        await acceptInviteByTokenApi("legacy_newer_after_reset", legacyNewer.token)
      ).status,
      410,
      "newer extra token after reset → 410"
    );

    // --- Expired join via existing accept path ---
    const expiredCreated = await createInvite({
      workspaceId: ws.id,
      kind: "link",
      role: "participant",
      createdByUserId: ownerId,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const expiredJoin = await acceptInviteByTokenApi(
      "expired_joiner",
      expiredCreated.token
    );
    assertEqual(expiredJoin.status, 410, "expired link join → 410");
    assert(
      !expiredJoin.ok &&
        typeof expiredJoin.body.error === "string" &&
        /no longer valid|expired/i.test(expiredJoin.body.error),
      "expired join error is clear"
    );

    // --- Unknown token → 404 ---
    assertEqual(
      (await acceptInviteByTokenApi(ownerId, "totally-unknown-token")).status,
      404,
      "unknown token → 404"
    );

    // --- Revoke missing / bad bodies ---
    assertEqual(
      (
        await revokeWorkspaceInvite(ownerId, ws.id, { inviteId: "ghost" })
      ).status,
      404,
      "revoke missing invite → 404"
    );
    assertEqual(
      (await createWorkspaceInvite(ownerId, ws.id, {})).status,
      400,
      "POST missing fields → 400"
    );
    assertEqual(
      (await revokeWorkspaceInvite(ownerId, ws.id, {})).status,
      400,
      "DELETE missing inviteId → 400"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: WorkspacesAPI invite handlers (linkByRole, pendingEmails, resetLink, email revoke)"
  );
}

void main();
