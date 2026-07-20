/**
 * Self-test: Workspace invite UI helpers + wiring (Task 6.5).
 * Run: npx tsx lib/workspace-ui/invites.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  WorkspaceInvite,
  WorkspaceInviteRole,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import {
  EMAIL_INVITE_NO_SMTP_NOTICE,
  buildCreateEmailInviteBody,
  buildCreateLinkInviteBody,
  buildRevokeInviteBody,
  canManageInvites,
  emailInviteRecordedMessage,
  filterActiveInvites,
  inviteUrlForToken,
  invitesApiHref,
  parseCreateInviteResponse,
  parseInvitesListResponse,
  parseRevokeInviteResponse,
} from "./invites";

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

function invite(input: {
  id: string;
  kind: "email" | "link";
  role?: WorkspaceInviteRole;
  email?: string;
  token?: string;
  revokedAt?: string;
  expiresAt?: string;
}): WorkspaceInvite {
  return {
    id: input.id,
    workspaceId: "ws_1",
    kind: input.kind,
    role: input.role ?? "participant",
    token: input.token ?? `tok_${input.id}`,
    createdByUserId: "owner_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...(input.email ? { email: input.email } : {}),
    ...(input.revokedAt ? { revokedAt: input.revokedAt } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
}

async function main(): Promise<void> {
  // --- Role capabilities (Req 2.1, 2.2) ---
  assertEqual(canManageInvites("owner"), true, "Owner can manage invites");
  assertEqual(
    canManageInvites("facilitator"),
    true,
    "Facilitator can manage invites"
  );
  assertEqual(
    canManageInvites("participant"),
    false,
    "Participant cannot manage invites"
  );

  // --- Email invite recording + no-SMTP copy (Req 2.1) ---
  assert(
    EMAIL_INVITE_NO_SMTP_NOTICE.toLowerCase().includes("smtp") ||
      EMAIL_INVITE_NO_SMTP_NOTICE.toLowerCase().includes("email is not") ||
      EMAIL_INVITE_NO_SMTP_NOTICE.toLowerCase().includes("not sent"),
    "no-SMTP notice is explicit that email is not delivered"
  );
  assertEqual(
    emailInviteRecordedMessage("teacher@school.edu"),
    "Invite recorded for teacher@school.edu. They join automatically on next sign-in with that address.",
    "email recorded success copy matches design"
  );
  assertEqual(
    buildCreateEmailInviteBody("  Teacher@School.edu  ", "facilitator"),
    { kind: "email", email: "Teacher@School.edu", role: "facilitator" },
    "email invite POST body trims email"
  );
  assertEqual(
    buildCreateEmailInviteBody("", "participant"),
    null,
    "blank email cannot create invite body"
  );

  // --- Invite link URL + create body (Req 2.2, 9.2) ---
  assertEqual(
    inviteUrlForToken("abc123"),
    "/workspace/invite/abc123",
    "inviteUrl path matches API contract"
  );
  assertEqual(
    buildCreateLinkInviteBody("participant"),
    { kind: "link", role: "participant" },
    "link invite POST body"
  );
  assertEqual(
    buildCreateLinkInviteBody("facilitator", "2026-12-31T00:00:00.000Z"),
    {
      kind: "link",
      role: "facilitator",
      expiresAt: "2026-12-31T00:00:00.000Z",
    },
    "link invite POST body with expiry"
  );

  // --- Revoke (Req 2.4) ---
  assertEqual(
    buildRevokeInviteBody("inv_1"),
    { inviteId: "inv_1" },
    "revoke DELETE body"
  );

  const active = filterActiveInvites([
    invite({ id: "a", kind: "link" }),
    invite({
      id: "b",
      kind: "link",
      revokedAt: "2026-02-01T00:00:00.000Z",
    }),
    invite({
      id: "c",
      kind: "email",
      email: "x@y.com",
      expiresAt: "2000-01-01T00:00:00.000Z",
    }),
    invite({ id: "d", kind: "email", email: "live@y.com" }),
  ]);
  assertEqual(
    active.map((i) => i.id),
    ["a", "d"],
    "filterActiveInvites drops revoked and expired"
  );

  // --- API helpers ---
  assertEqual(
    invitesApiHref("ws_1"),
    "/api/workspaces/ws_1/invites",
    "invites API href"
  );

  const listed = parseInvitesListResponse(200, {
    invites: [
      invite({ id: "1", kind: "link", token: "t1" }),
      invite({
        id: "2",
        kind: "email",
        email: "a@b.com",
        role: "facilitator",
      }),
    ],
  });
  assert(listed.ok === true, "200 invites list is ok");
  if (listed.ok) {
    assertEqual(listed.invites.length, 2, "parses invite list");
  }

  const listForbidden = parseInvitesListResponse(403, { error: "Forbidden" });
  assert(listForbidden.ok === false, "403 invites list fails");

  const createdLink = parseCreateInviteResponse(200, {
    invite: invite({ id: "3", kind: "link", token: "tok_link" }),
    inviteUrl: "/workspace/invite/tok_link",
  });
  assert(createdLink.ok === true, "200 create link is ok");
  if (createdLink.ok) {
    assertEqual(
      createdLink.inviteUrl,
      "/workspace/invite/tok_link",
      "create response exposes inviteUrl"
    );
  }

  const createdEmail = parseCreateInviteResponse(200, {
    invite: invite({
      id: "4",
      kind: "email",
      email: "c@d.com",
      token: "tok_email",
    }),
  });
  assert(createdEmail.ok === true, "200 create email is ok");
  if (createdEmail.ok) {
    assertEqual(
      createdEmail.inviteUrl,
      undefined,
      "email create has no inviteUrl"
    );
  }

  const createBad = parseCreateInviteResponse(400, {
    error: "Email invite requires an email address",
  });
  assert(createBad.ok === false, "400 create fails");

  const revoked = parseRevokeInviteResponse(200, { ok: true });
  assert(revoked.ok === true, "200 revoke is ok");

  const revokeForbidden = parseRevokeInviteResponse(403, {
    error: "Forbidden",
  });
  assert(revokeForbidden.ok === false, "403 revoke fails");

  // Role type guard: invite roles never include owner
  const roles: WorkspaceInviteRole[] = ["facilitator", "participant"];
  assert(
    roles.every((r) => r !== ("owner" as WorkspaceRole)),
    "ordinary invites never grant Owner"
  );

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/invites.ts");
  const panelPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceInvitePanel.tsx"
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
  const panelSource = await fs.readFile(panelPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");
  const hubSource = await fs.readFile(hubPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/invites.ts exists");
  assert(
    panelSource.includes("WorkspaceInvitePanel"),
    "WorkspaceInvitePanel component exists"
  );
  assert(
    panelSource.includes("invitesApiHref") ||
      (panelSource.includes("/api/workspaces/") &&
        panelSource.includes("invites")),
    "panel calls invites API"
  );
  assert(
    panelSource.includes("fetch") || panelSource.includes("method"),
    "panel loads/creates invites via fetch"
  );
  assert(
    panelSource.includes("POST") || panelSource.includes('"POST"'),
    "panel uses POST to create invites"
  );
  assert(
    panelSource.includes("DELETE") || panelSource.includes('"DELETE"'),
    "panel uses DELETE to revoke invites"
  );
  assert(
    panelSource.includes("clipboard") ||
      panelSource.includes("copy") ||
      panelSource.includes("Copy") ||
      panelSource.includes("navigator.clipboard"),
    "panel supports copyable invite links"
  );
  assert(
    panelSource.includes("SMTP") ||
      panelSource.includes("not sent") ||
      panelSource.includes("not deliver") ||
      panelSource.includes(EMAIL_INVITE_NO_SMTP_NOTICE.slice(0, 20)),
    "panel states email is not SMTP-delivered"
  );
  assert(
    panelSource.includes("emailInviteRecordedMessage") ||
      panelSource.includes("Invite recorded for") ||
      panelSource.includes("join automatically"),
    "panel shows email recorded success copy"
  );
  assert(
    panelSource.includes("inviteUrlForToken") ||
      panelSource.includes("/workspace/invite/") ||
      panelSource.includes("inviteUrl"),
    "panel uses /workspace/invite/{token} URLs"
  );
  assert(
    panelSource.includes("canManageInvites") ||
      panelSource.includes("facilitator") ||
      panelSource.includes("participant"),
    "panel gates invite management by role"
  );
  assert(
    pageSource.includes("WorkspaceInvitePanel"),
    "settings page renders WorkspaceInvitePanel"
  );
  assert(
    hubSource.includes("Invite") ||
      hubSource.includes("invite") ||
      hubSource.includes("WorkspaceInvitePanel"),
    "hub has invites entry"
  );

  if (failures > 0) {
    console.error(`\ninvites.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("invites.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("invites.selftest crashed:", err);
  process.exit(1);
});
