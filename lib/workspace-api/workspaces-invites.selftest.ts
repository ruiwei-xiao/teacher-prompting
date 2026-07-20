/**
 * Self-test: WorkspacesAPI invite + join handlers (Task 2.3).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-invites.selftest.ts
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
          kind: "link",
          role: "participant",
        })
      ).status,
      401,
      "POST invite without auth → 401"
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

    // --- Non-member / Participant cannot manage invites ---
    assertEqual(
      (await listWorkspaceInvites("stranger", ws.id)).status,
      403,
      "non-member list → 403"
    );
    assertEqual(
      (await listWorkspaceInvites(partId, ws.id)).status,
      403,
      "Participant list invites → 403"
    );
    assertEqual(
      (
        await createWorkspaceInvite(partId, ws.id, {
          kind: "link",
          role: "participant",
        })
      ).status,
      403,
      "Participant create invite → 403"
    );

    // --- Owner creates link invite (Req 2.2) ---
    const linkCreated = await createWorkspaceInvite(ownerId, ws.id, {
      kind: "link",
      role: "participant",
    });
    assertEqual(linkCreated.status, 200, "Owner create link → 200");
    assert(
      linkCreated.ok &&
        linkCreated.body.invite.kind === "link" &&
        linkCreated.body.invite.role === "participant" &&
        typeof linkCreated.body.invite.token === "string" &&
        linkCreated.body.invite.token.length >= 32 &&
        typeof linkCreated.body.inviteUrl === "string" &&
        linkCreated.body.inviteUrl.startsWith("/workspace/invite/") &&
        linkCreated.body.inviteUrl.includes(linkCreated.body.invite.token),
      "link invite returns invite + inviteUrl with token"
    );
    const linkInvite = linkCreated.ok ? linkCreated.body.invite : null;

    // --- Facilitator creates email invite (Req 2.1) ---
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
        emailCreated.body.inviteUrl === undefined,
      "email invite stores pending email; no inviteUrl"
    );

    // --- Invite role Owner rejected ---
    assertEqual(
      (
        await createWorkspaceInvite(ownerId, ws.id, {
          kind: "link",
          role: "owner",
        })
      ).status,
      400,
      "role=owner via invite → 400"
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

    // --- List invites (Owner/Facilitator) ---
    const listed = await listWorkspaceInvites(facId, ws.id);
    assertEqual(listed.status, 200, "Facilitator list → 200");
    assert(
      listed.ok && listed.body.invites.length === 2,
      "list returns created invites"
    );

    // --- Join via valid link (Req 2.2, 9.2) ---
    const joinerId = "joiner_1";
    assert(linkInvite !== null, "link invite exists");
    const joined = await acceptInviteByTokenApi(joinerId, linkInvite!.token);
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
      "activity member.joined appended (Req 6.1)"
    );

    // --- Idempotent re-join does not duplicate activity ---
    const activityCountBefore = (
      await listActivity(ws.id, { viewerRole: "owner" })
    ).filter((e) => e.type === "member.joined" && e.actorUserId === joinerId)
      .length;
    const rejoin = await acceptInviteByTokenApi(joinerId, linkInvite!.token);
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

    // --- Burst joins via same link (Req 9.2) ---
    for (let i = 0; i < 5; i++) {
      const r = await acceptInviteByTokenApi(`burst_${i}`, linkInvite!.token);
      assertEqual(r.status, 200, `burst join ${i} → 200`);
    }
    assert(
      (await listMembers(ws.id)).filter((m) => m.userId.startsWith("burst_"))
        .length === 5,
      "burst sequential joins succeed"
    );

    // --- Revoke then join → 410 (Req 2.4) ---
    const revoke = await revokeWorkspaceInvite(ownerId, ws.id, {
      inviteId: linkInvite!.id,
    });
    assertEqual(revoke.status, 200, "Owner revoke → 200");
    const afterRevoke = await listInvites(ws.id);
    assert(
      typeof afterRevoke.find((i) => i.id === linkInvite!.id)?.revokedAt ===
        "string",
      "revoke sets revokedAt"
    );
    const lateJoin = await acceptInviteByTokenApi("late_joiner", linkInvite!.token);
    assertEqual(lateJoin.status, 410, "revoked link join → 410");
    assert(
      !lateJoin.ok &&
        typeof lateJoin.body.error === "string" &&
        /no longer valid|revoked/i.test(lateJoin.body.error),
      "revoked join error is clear"
    );

    // --- Participant cannot revoke ---
    const anotherLink = await createWorkspaceInvite(facId, ws.id, {
      kind: "link",
      role: "facilitator",
    });
    assert(anotherLink.ok, "create another link");
    assertEqual(
      (
        await revokeWorkspaceInvite(partId, ws.id, {
          inviteId: anotherLink.ok ? anotherLink.body.invite.id : "",
        })
      ).status,
      403,
      "Participant revoke → 403"
    );

    // --- Expired join → 410 (Req 2.4) ---
    const expiredCreated = await createWorkspaceInvite(ownerId, ws.id, {
      kind: "link",
      role: "participant",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    assertEqual(expiredCreated.status, 200, "create expired link → 200");
    assert(expiredCreated.ok, "expired invite created");
    const expiredJoin = await acceptInviteByTokenApi(
      "expired_joiner",
      expiredCreated.ok ? expiredCreated.body.invite.token : ""
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

    // --- Revoke missing invite ---
    assertEqual(
      (
        await revokeWorkspaceInvite(ownerId, ws.id, { inviteId: "ghost" })
      ).status,
      404,
      "revoke missing invite → 404"
    );

    // --- Bad create bodies ---
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
    "OK: WorkspacesAPI invite/join handlers (create/list/revoke/accept)"
  );
}

void main();
