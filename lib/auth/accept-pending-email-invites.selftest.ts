/**
 * Self-test: auth bootstrap for pending email Workspace invites (Task 5.1).
 * Forces JSON file mode (no Postgres) for reliable local runs.
 *
 * Run: npx tsx lib/auth/accept-pending-email-invites.selftest.ts
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

  const tempDir = path.join(
    process.cwd(),
    ".data",
    "accept-pending-email-invites-selftest"
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const { acceptPendingEmailInvitesOnSignIn } = await import(
    "./accept-pending-email-invites"
  );
  const {
    createInvite,
    createWorkspace,
    getInvite,
    listMembers,
    removeMember,
  } = await import("../workspace-store/store");

  try {
    assertEqual(
      await acceptPendingEmailInvitesOnSignIn(null, "a@b.com"),
      [],
      "missing userId → no-op"
    );
    assertEqual(
      await acceptPendingEmailInvitesOnSignIn("user_1", null),
      [],
      "missing email → no-op"
    );
    assertEqual(
      await acceptPendingEmailInvitesOnSignIn("  ", "a@b.com"),
      [],
      "blank userId → no-op"
    );
    assertEqual(
      await acceptPendingEmailInvitesOnSignIn("user_1", "  "),
      [],
      "blank email → no-op"
    );

    const ws = await createWorkspace({
      name: "Auth Invite Lab",
      ownerUserId: "owner_auth",
    });
    const invite = await createInvite({
      workspaceId: ws.id,
      kind: "email",
      email: "Invited.Teacher@School.edu",
      role: "participant",
      createdByUserId: "owner_auth",
    });

    const accepted = await acceptPendingEmailInvitesOnSignIn(
      "invited_user",
      "invited.teacher@school.edu"
    );
    assert(accepted.includes(ws.id), "sign-in accept joins matching email invite");
    assertEqual(
      (await listMembers(ws.id)).find((m) => m.userId === "invited_user")?.role,
      "participant",
      "sign-in accept grants invite role"
    );
    const consumed = await getInvite(ws.id, invite.id);
    assert(
      typeof consumed?.revokedAt === "string",
      "sign-in accept consumes email invite"
    );

    await removeMember(ws.id, "invited_user");
    const afterLeave = await acceptPendingEmailInvitesOnSignIn(
      "invited_user",
      "invited.teacher@school.edu"
    );
    assertEqual(
      afterLeave,
      [],
      "re-sign-in after leave does not re-add via consumed invite"
    );
    assert(
      !(await listMembers(ws.id)).some((m) => m.userId === "invited_user"),
      "membership stays removed after leave + re-sign-in"
    );

    if (failures > 0) {
      console.error(`\n${failures} failure(s)`);
      process.exitCode = 1;
    } else {
      console.log("OK: accept-pending-email-invites.selftest passed");
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
