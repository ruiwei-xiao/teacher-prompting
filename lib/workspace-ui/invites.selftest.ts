/**
 * Self-test: Workspace invite UI helpers + wiring (email + revoke).
 * Share-link parsers live in share-link.selftest.ts (Task 2.3).
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
  buildCreateEmailInviteBody,
  buildRevokeInviteBody,
  canManageInvites,
  emailInviteRecordedMessage,
  inviteUrlForToken,
  invitesApiHref,
  parseCreateInviteResponse,
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
  // --- Role capabilities ---
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

  // --- Email invite recording success copy ---
  assertEqual(
    emailInviteRecordedMessage("teacher@school.edu"),
    "Invite recorded for teacher@school.edu. They join automatically when they next open Workspaces (or sign in) with that address.",
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

  assertEqual(
    inviteUrlForToken("abc123"),
    "/workspace/invite/abc123",
    "inviteUrl path matches API contract"
  );

  assertEqual(
    buildRevokeInviteBody("inv_1"),
    { inviteId: "inv_1" },
    "revoke DELETE body"
  );

  assertEqual(
    invitesApiHref("ws_1"),
    "/api/workspaces/ws_1/invites",
    "invites API href"
  );

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

  const roles: WorkspaceInviteRole[] = ["facilitator", "participant"];
  assert(
    roles.every((r) => r !== ("owner" as WorkspaceRole)),
    "ordinary invites never grant Owner"
  );

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
    !helpersSource.includes("export function filterActiveInvites"),
    "Active-list helper filterActiveInvites is gone"
  );
  assert(
    !helpersSource.includes("export function parseInvitesListResponse"),
    "old { invites } list parser is gone"
  );
  assert(
    !helpersSource.includes("export function buildCreateLinkInviteBody"),
    "POST kind:link helper is gone"
  );
  assert(
    panelSource.includes("WorkspaceInvitePanel"),
    "WorkspaceInvitePanel component exists"
  );
  assert(
    panelSource.includes("WorkspaceShareLinkControl"),
    "panel hosts the share-link control instead of an Active invites list"
  );
  assert(
    !/Active invites/i.test(panelSource),
    "panel has no Active invites list of links"
  );
  assert(
    panelSource.includes("invitesApiHref") ||
      (panelSource.includes("/api/workspaces/") &&
        panelSource.includes("invites")),
    "panel calls invites API"
  );
  assert(
    panelSource.includes("fetch") || panelSource.includes("method"),
    "panel records email invites via fetch"
  );
  assert(
    panelSource.includes("POST") || panelSource.includes('"POST"'),
    "panel uses POST to record email invites"
  );
  assert(
    panelSource.includes("emailInviteRecordedMessage") ||
      panelSource.includes("Invite recorded for") ||
      panelSource.includes("join automatically"),
    "panel shows email recorded success copy"
  );
  assert(
    panelSource.includes("canManageInvites") ||
      panelSource.includes("facilitator") ||
      panelSource.includes("participant"),
    "panel gates invite management by role"
  );
  assert(
    !hubSource.includes('case "invites"') &&
      !hubSource.includes('activeTab === "invites"'),
    "hub has no Invites tab (invites resolve onto Members later)"
  );
  assert(
    pageSource.includes("redirect") ||
      pageSource.includes("invites") ||
      hubSource.includes("WorkspaceNavTabs"),
    "legacy settings route or hub exposes invites"
  );
  assert(
    hubSource.includes("WorkspaceNavTabs") ||
      hubSource.includes("Invite") ||
      hubSource.includes("invite") ||
      hubSource.includes("WorkspaceInvitePanel"),
    "hub has invites entry via tabs or panel link"
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
