/**
 * Self-test: Workspace share-link control parsers + wiring (Task 2.3).
 * Run: npx tsx lib/workspace-ui/share-link.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  WorkspaceInvite,
  WorkspaceInviteRole,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import { inviteUrlForToken } from "./invites";
import {
  SHARE_LINK_ROLES,
  buildResetShareLinkBody,
  parseResetShareLinkResponse,
  parseShareLinkListResponse,
  replaceShownShareLink,
  shareLinkUrlForRole,
  toShareLinkClipboardText,
} from "./share-link";

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

function linkByRoleFixture() {
  return {
    facilitator: invite({
      id: "lf",
      kind: "link",
      role: "facilitator",
      token: "tok_fac",
    }),
    participant: invite({
      id: "lp",
      kind: "link",
      role: "participant",
      token: "tok_part",
    }),
  };
}

async function main(): Promise<void> {
  // --- Role picker never includes Owner (Req 2.2, 6.1) ---
  assertEqual(
    [...SHARE_LINK_ROLES],
    ["facilitator", "participant"],
    "share-link roles are Facilitator and Participant only"
  );
  assert(
    SHARE_LINK_ROLES.every((r) => r !== ("owner" as WorkspaceRole)),
    "ordinary share links never grant Owner"
  );

  // --- GET /api/workspaces/:id/invites → { linkByRole, pendingEmails } (Req 2.4) ---
  const listed = parseShareLinkListResponse(200, {
    linkByRole: linkByRoleFixture(),
    pendingEmails: [
      invite({
        id: "e1",
        kind: "email",
        email: "a@b.com",
        role: "facilitator",
      }),
    ],
  });
  assert(listed.ok === true, "200 linkByRole payload is ok");
  if (listed.ok) {
    assertEqual(
      listed.linkByRole.facilitator.token,
      "tok_fac",
      "parses facilitator current link"
    );
    assertEqual(
      listed.linkByRole.participant.token,
      "tok_part",
      "parses participant current link"
    );
    assertEqual(listed.pendingEmails.length, 1, "parses pendingEmails array");
    assertEqual(
      listed.pendingEmails[0]?.email,
      "a@b.com",
      "pending email is available to other surfaces, not this control"
    );
  }

  const listedEmptyPending = parseShareLinkListResponse(200, {
    linkByRole: linkByRoleFixture(),
    pendingEmails: [],
  });
  assert(
    listedEmptyPending.ok === true,
    "200 with empty pendingEmails is ok"
  );

  const oldListShape = parseShareLinkListResponse(200, {
    invites: [
      invite({ id: "1", kind: "link", token: "legacy" }),
      invite({
        id: "2",
        kind: "email",
        email: "a@b.com",
        role: "facilitator",
      }),
    ],
  });
  assert(
    oldListShape.ok === false,
    "legacy { invites } list payload is not a share-link GET"
  );

  const listForbidden = parseShareLinkListResponse(403, { error: "Forbidden" });
  assert(listForbidden.ok === false, "403 share-link GET fails");
  if (!listForbidden.ok) {
    assertEqual(listForbidden.error, "Forbidden", "403 uses API error copy");
  }

  const missingRole = parseShareLinkListResponse(200, {
    linkByRole: { facilitator: linkByRoleFixture().facilitator },
    pendingEmails: [],
  });
  assert(missingRole.ok === false, "missing participant link is invalid");

  const emailAsLink = parseShareLinkListResponse(200, {
    linkByRole: {
      facilitator: linkByRoleFixture().facilitator,
      participant: invite({
        id: "bad",
        kind: "email",
        email: "x@y.com",
        role: "participant",
      }),
    },
    pendingEmails: [],
  });
  assert(emailAsLink.ok === false, "linkByRole entries must be kind=link");

  // --- Shown URL for selected role; copy uses that URL (Req 2.4, 2.5) ---
  const links = linkByRoleFixture();
  assertEqual(
    shareLinkUrlForRole(links, "facilitator"),
    inviteUrlForToken("tok_fac"),
    "selecting Facilitator shows that role's current path"
  );
  assertEqual(
    shareLinkUrlForRole(links, "participant"),
    inviteUrlForToken("tok_part"),
    "selecting Participant shows that role's current path"
  );
  assertEqual(
    toShareLinkClipboardText(shareLinkUrlForRole(links, "participant")),
    "/workspace/invite/tok_part",
    "copy without window origin uses the shown URL as-is"
  );
  assertEqual(
    toShareLinkClipboardText(
      shareLinkUrlForRole(links, "participant"),
      "https://app.example"
    ),
    "https://app.example/workspace/invite/tok_part",
    "copy with origin puts the absolute shown URL on the clipboard"
  );
  assertEqual(
    toShareLinkClipboardText(
      "https://app.example/workspace/invite/tok_part",
      "https://other.example"
    ),
    "https://app.example/workspace/invite/tok_part",
    "already-absolute shown URL is copied unchanged"
  );

  // --- Reset POST { kind: resetLink, role } then replacement URL (Req 2.4, 2.9 UX) ---
  assertEqual(
    buildResetShareLinkBody("facilitator"),
    { kind: "resetLink", role: "facilitator" },
    "reset POST body for Facilitator"
  );
  assertEqual(
    buildResetShareLinkBody("participant"),
    { kind: "resetLink", role: "participant" },
    "reset POST body for Participant"
  );

  const replacement = invite({
    id: "new_p",
    kind: "link",
    role: "participant",
    token: "tok_part_new",
  });
  const resetOk = parseResetShareLinkResponse(200, { invite: replacement });
  assert(resetOk.ok === true, "200 resetLink is ok");
  if (resetOk.ok) {
    const next = replaceShownShareLink(links, resetOk.invite);
    assertEqual(
      shareLinkUrlForRole(next, "participant"),
      inviteUrlForToken("tok_part_new"),
      "reset replaces the shown URL for that role"
    );
    assertEqual(
      shareLinkUrlForRole(next, "facilitator"),
      inviteUrlForToken("tok_fac"),
      "reset of Participant leaves Facilitator URL unchanged"
    );
  }

  const resetBad = parseResetShareLinkResponse(400, {
    error: "kind must be email or resetLink",
  });
  assert(resetBad.ok === false, "400 resetLink fails");

  const resetEmail = parseResetShareLinkResponse(200, {
    invite: invite({
      id: "e",
      kind: "email",
      email: "z@z.com",
      role: "participant",
    }),
  });
  assert(resetEmail.ok === false, "reset response must be a link invite");

  // --- UI wiring: one control, no Active invites list (Req 2.1, 2.7, 6.1) ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/invites.ts");
  const shareHelpersPath = path.join(
    process.cwd(),
    "lib/workspace-ui/share-link.ts"
  );
  const controlPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceShareLinkControl.tsx"
  );
  const membersPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceMemberList.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const shareHelpersSource = await fs
    .readFile(shareHelpersPath, "utf8")
    .catch(() => "");
  const controlSource = await fs.readFile(controlPath, "utf8").catch(() => "");
  const membersSource = await fs.readFile(membersPath, "utf8").catch(() => "");

  assert(shareHelpersSource.length > 0, "lib/workspace-ui/share-link.ts exists");
  assert(
    controlSource.includes("WorkspaceShareLinkControl"),
    "WorkspaceShareLinkControl component exists"
  );
  assert(
    membersSource.includes("WorkspaceRoleHintGroup"),
    "Members hosts one shared role-hint group for invite role pickers"
  );
  assert(
    !controlSource.includes("WorkspaceRoleHint"),
    "share-link control does not duplicate role hints next to the Members invite form"
  );
  assert(
    !/<p[\s>]/.test(controlSource) ||
      !controlSource.includes("administers the Workspace"),
    "role explanations are hover/? only, not body paragraphs of role copy"
  );
  assert(
    controlSource.includes("facilitator") &&
      controlSource.includes("participant"),
    "picker offers Facilitator and Participant"
  );
  assert(
    !controlSource.includes('value="owner"') &&
      !controlSource.includes("value={'owner'}") &&
      !controlSource.includes('value={"owner"}'),
    "picker does not offer Owner"
  );
  assert(
    controlSource.includes("Copy") || controlSource.includes("clipboard"),
    "control has a copy action"
  );
  assert(
    /reset/i.test(controlSource),
    "control has a reset action"
  );
  assert(
    controlSource.includes("resetLink") ||
      controlSource.includes("buildResetShareLinkBody"),
    "reset posts kind resetLink"
  );
  assert(
    controlSource.includes("navigator.clipboard") ||
      controlSource.includes("clipboard") ||
      controlSource.includes("toShareLinkClipboardText"),
    "copy writes the shown URL to the clipboard"
  );
  assert(
    controlSource.includes("parseShareLinkListResponse") ||
      controlSource.includes("linkByRole"),
    "control loads GET linkByRole"
  );
  assert(
    !/Active invites/i.test(controlSource),
    "share-link control has no Active invites list"
  );
  assert(
    membersSource.includes("WorkspaceShareLinkControl"),
    "Members mounts the share-link control"
  );
  assert(
    !/Active invites/i.test(membersSource),
    "Members has no Active invites list of links"
  );

  assert(
    !helpersSource.includes("export function filterActiveInvites"),
    "invites.ts dropped filterActiveInvites (Active-list helper)"
  );
  assert(
    !helpersSource.includes("export function parseInvitesListResponse"),
    "invites.ts dropped parseInvitesListResponse (old { invites } list)"
  );
  assert(
    !helpersSource.includes("export function buildCreateLinkInviteBody"),
    "invites.ts dropped buildCreateLinkInviteBody (POST kind:link is 400)"
  );
  assert(
    !membersSource.includes("filterActiveInvites") &&
      !membersSource.includes("parseInvitesListResponse") &&
      !membersSource.includes("buildCreateLinkInviteBody"),
    "Members no longer uses Active-list helpers"
  );

  if (failures > 0) {
    console.error(`\nshare-link.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("share-link.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("share-link.selftest crashed:", err);
  process.exit(1);
});
