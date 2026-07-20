/**
 * WorkspaceStore — dual persistence (Postgres + JSON fallback) for workspaces,
 * memberships, invites, and placements. Mirrors lib/app-store/store.ts and
 * lib/auth/user-store.ts.
 *
 * Task 1.3: workspace + membership methods.
 * Task 1.4: invites + placements (does not mutate AppConfig / ownerId).
 */
import { randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import type {
  BuildingPermissions,
  Workspace,
  WorkspaceInvite,
  WorkspaceInviteRole,
  WorkspaceMembership,
  WorkspacePlacement,
  WorkspaceRole,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DEFAULT_WORKSPACES_FILE = path.join(DATA_DIR, "workspaces.json");

type WorkspaceFileData = {
  workspaces: Workspace[];
  members: WorkspaceMembership[];
  invites: WorkspaceInvite[];
  placements: WorkspacePlacement[];
};

type WorkspaceRow = {
  id: string;
  name: string;
  building_permissions: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type MemberRow = {
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: string | Date;
};

type InviteRow = {
  id: string;
  workspace_id: string;
  kind: string;
  email: string | null;
  role: string;
  token: string;
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
  created_by: string;
  created_at: string | Date;
};

type PlacementRow = {
  workspace_id: string;
  app_id: string;
  placed_by: string;
  placed_at: string | Date;
};

export type CreateInviteInput = Omit<
  WorkspaceInvite,
  "id" | "token" | "createdAt" | "revokedAt"
> & { token?: string };

let postgresReadyPromise: Promise<void> | null = null;

const DEFAULT_BUILDING_PERMISSIONS: BuildingPermissions = {
  canCreateBots: false,
  canSeeOthersBots: false,
  canShareOutside: false,
  canManageOwnBots: false,
};

function workspacesFilePath(): string {
  return process.env.WORKSPACES_DATA_FILE || DEFAULT_WORKSPACES_FILE;
}

function shouldUsePostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function parseBuildingPermissions(raw: string): BuildingPermissions {
  try {
    const parsed = JSON.parse(raw) as Partial<BuildingPermissions>;
    return {
      canCreateBots: Boolean(parsed.canCreateBots),
      canSeeOthersBots: Boolean(parsed.canSeeOthersBots),
      canShareOutside: Boolean(parsed.canShareOutside),
      canManageOwnBots: Boolean(parsed.canManageOwnBots),
    };
  } catch {
    return { ...DEFAULT_BUILDING_PERMISSIONS };
  }
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    buildingPermissions: parseBuildingPermissions(row.building_permissions),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToMembership(row: MemberRow): WorkspaceMembership {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role as WorkspaceRole,
    joinedAt: new Date(row.joined_at).toISOString(),
  };
}

function rowToInvite(row: InviteRow): WorkspaceInvite {
  const invite: WorkspaceInvite = {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind as "email" | "link",
    role: row.role as WorkspaceInviteRole,
    token: row.token,
    createdByUserId: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
  if (row.email) invite.email = row.email;
  if (row.expires_at) invite.expiresAt = new Date(row.expires_at).toISOString();
  if (row.revoked_at) invite.revokedAt = new Date(row.revoked_at).toISOString();
  return invite;
}

function rowToPlacement(row: PlacementRow): WorkspacePlacement {
  return {
    workspaceId: row.workspace_id,
    appId: row.app_id,
    placedByUserId: row.placed_by,
    placedAt: new Date(row.placed_at).toISOString(),
  };
}

function emptyFileData(): WorkspaceFileData {
  return { workspaces: [], members: [], invites: [], placements: [] };
}

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isInviteAcceptable(invite: WorkspaceInvite, now = new Date()): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

function inviteRejectReason(invite: WorkspaceInvite | null | undefined): string {
  if (!invite) return "Invite not found.";
  if (invite.revokedAt) return "Invite is no longer valid (revoked).";
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    return "Invite is no longer valid (expired).";
  }
  return "Invite is no longer valid.";
}

async function ensureFileStore() {
  const filePath = workspacesFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(emptyFileData(), null, 2), "utf-8");
  }
}

async function readFileData(): Promise<WorkspaceFileData> {
  await ensureFileStore();
  const raw = await fs.readFile(workspacesFilePath(), "utf-8");
  const parsed = JSON.parse(raw) as Partial<WorkspaceFileData>;
  return {
    workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
    members: Array.isArray(parsed.members) ? parsed.members : [],
    invites: Array.isArray(parsed.invites) ? parsed.invites : [],
    placements: Array.isArray(parsed.placements) ? parsed.placements : [],
  };
}

async function writeFileData(data: WorkspaceFileData) {
  await ensureFileStore();
  await fs.writeFile(
    workspacesFilePath(),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

async function ensurePostgresStore() {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          building_permissions TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS workspace_members (
          workspace_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          joined_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (workspace_id, user_id)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx
        ON workspace_members (user_id)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS workspace_invites (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          email TEXT,
          role TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ,
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS workspace_invites_token_idx
        ON workspace_invites (token)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS workspace_invites_workspace_id_idx
        ON workspace_invites (workspace_id)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS workspace_placements (
          workspace_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          placed_by TEXT NOT NULL,
          placed_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (workspace_id, app_id)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS workspace_placements_app_id_idx
        ON workspace_placements (app_id)
      `;
    })();
  }

  return postgresReadyPromise;
}

function matchesMemberQuery(member: WorkspaceMembership, query?: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return member.userId.toLowerCase().includes(q);
}

// --- File implementations ---

async function createWorkspaceInFile(input: {
  name: string;
  ownerUserId: string;
}): Promise<Workspace> {
  const data = await readFileData();
  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: input.name,
    buildingPermissions: { ...DEFAULT_BUILDING_PERMISSIONS },
    createdAt: now,
    updatedAt: now,
  };
  const membership: WorkspaceMembership = {
    workspaceId: workspace.id,
    userId: input.ownerUserId,
    role: "owner",
    joinedAt: now,
  };
  data.workspaces.push(workspace);
  data.members.push(membership);
  await writeFileData(data);
  return workspace;
}

async function listWorkspacesForUserInFile(userId: string): Promise<Workspace[]> {
  const data = await readFileData();
  const workspaceIds = new Set(
    data.members.filter((m) => m.userId === userId).map((m) => m.workspaceId)
  );
  return data.workspaces.filter((w) => workspaceIds.has(w.id));
}

async function getWorkspaceInFile(workspaceId: string): Promise<Workspace | null> {
  const data = await readFileData();
  return data.workspaces.find((w) => w.id === workspaceId) ?? null;
}

async function updateWorkspaceInFile(
  workspaceId: string,
  patch: Partial<Pick<Workspace, "name" | "buildingPermissions">>
): Promise<Workspace> {
  const data = await readFileData();
  const idx = data.workspaces.findIndex((w) => w.id === workspaceId);
  if (idx === -1) {
    throw new Error("Workspace not found.");
  }
  const current = data.workspaces[idx];
  const updated: Workspace = {
    ...current,
    name: patch.name ?? current.name,
    buildingPermissions: patch.buildingPermissions
      ? { ...patch.buildingPermissions }
      : current.buildingPermissions,
    updatedAt: new Date().toISOString(),
  };
  data.workspaces[idx] = updated;
  await writeFileData(data);
  return updated;
}

async function deleteWorkspaceInFile(workspaceId: string): Promise<void> {
  const data = await readFileData();
  data.workspaces = data.workspaces.filter((w) => w.id !== workspaceId);
  data.members = data.members.filter((m) => m.workspaceId !== workspaceId);
  data.invites = data.invites.filter((i) => i.workspaceId !== workspaceId);
  data.placements = data.placements.filter((p) => p.workspaceId !== workspaceId);
  await writeFileData(data);
}

async function listMembersInFile(
  workspaceId: string,
  query?: string
): Promise<WorkspaceMembership[]> {
  const data = await readFileData();
  return data.members
    .filter((m) => m.workspaceId === workspaceId)
    .filter((m) => matchesMemberQuery(m, query));
}

async function addMemberInFile(input: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<WorkspaceMembership> {
  const data = await readFileData();
  if (!data.workspaces.some((w) => w.id === input.workspaceId)) {
    throw new Error("Workspace not found.");
  }
  const existing = data.members.find(
    (m) => m.workspaceId === input.workspaceId && m.userId === input.userId
  );
  if (existing) {
    return existing;
  }
  const membership: WorkspaceMembership = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: input.role,
    joinedAt: new Date().toISOString(),
  };
  data.members.push(membership);
  await writeFileData(data);
  return membership;
}

async function setMemberRoleInFile(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  const data = await readFileData();
  const idx = data.members.findIndex(
    (m) => m.workspaceId === workspaceId && m.userId === userId
  );
  if (idx === -1) {
    throw new Error("Membership not found.");
  }
  data.members[idx] = { ...data.members[idx], role };
  await writeFileData(data);
}

async function removeMemberInFile(
  workspaceId: string,
  userId: string
): Promise<void> {
  const data = await readFileData();
  data.members = data.members.filter(
    (m) => !(m.workspaceId === workspaceId && m.userId === userId)
  );
  await writeFileData(data);
}

async function transferOwnershipInFile(
  workspaceId: string,
  toUserId: string,
  demoteTo: "facilitator" | "participant"
): Promise<void> {
  const data = await readFileData();
  const recipient = data.members.find(
    (m) => m.workspaceId === workspaceId && m.userId === toUserId
  );
  if (!recipient) {
    throw new Error("Transfer target must be an existing member.");
  }
  data.members = data.members.map((m) => {
    if (m.workspaceId !== workspaceId) return m;
    if (m.userId === toUserId) {
      return { ...m, role: "owner" as const };
    }
    if (m.role === "owner") {
      return { ...m, role: demoteTo };
    }
    return m;
  });
  await writeFileData(data);
}

async function createInviteInFile(input: CreateInviteInput): Promise<WorkspaceInvite> {
  const data = await readFileData();
  if (!data.workspaces.some((w) => w.id === input.workspaceId)) {
    throw new Error("Workspace not found.");
  }
  if (input.kind === "email" && !input.email?.trim()) {
    throw new Error("Email invite requires an email address.");
  }
  const invite: WorkspaceInvite = {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    kind: input.kind,
    role: input.role,
    token: input.token ?? generateInviteToken(),
    createdByUserId: input.createdByUserId,
    createdAt: new Date().toISOString(),
  };
  if (input.email) invite.email = input.email.trim();
  if (input.expiresAt) invite.expiresAt = input.expiresAt;
  data.invites.push(invite);
  await writeFileData(data);
  return invite;
}

async function listInvitesInFile(workspaceId: string): Promise<WorkspaceInvite[]> {
  const data = await readFileData();
  return data.invites.filter((i) => i.workspaceId === workspaceId);
}

async function getInviteInFile(
  workspaceId: string,
  inviteId: string
): Promise<WorkspaceInvite | null> {
  const data = await readFileData();
  return (
    data.invites.find((i) => i.workspaceId === workspaceId && i.id === inviteId) ??
    null
  );
}

async function revokeInviteInFile(
  workspaceId: string,
  inviteId: string
): Promise<void> {
  const data = await readFileData();
  const idx = data.invites.findIndex(
    (i) => i.workspaceId === workspaceId && i.id === inviteId
  );
  if (idx === -1) {
    throw new Error("Invite not found.");
  }
  data.invites[idx] = {
    ...data.invites[idx],
    revokedAt: new Date().toISOString(),
  };
  await writeFileData(data);
}

async function acceptInviteByTokenInFile(
  token: string,
  userId: string
): Promise<{ workspaceId: string }> {
  const data = await readFileData();
  const invite = data.invites.find((i) => i.token === token);
  if (!invite || !isInviteAcceptable(invite)) {
    throw new Error(inviteRejectReason(invite));
  }
  await addMemberInFile({
    workspaceId: invite.workspaceId,
    userId,
    role: invite.role,
  });
  return { workspaceId: invite.workspaceId };
}

async function acceptPendingEmailInvitesForUserInFile(
  userId: string,
  email: string
): Promise<string[]> {
  const normalized = normalizeEmail(email);
  const data = await readFileData();
  const pending = data.invites.filter(
    (i) =>
      i.kind === "email" &&
      i.email &&
      normalizeEmail(i.email) === normalized &&
      isInviteAcceptable(i)
  );
  const workspaceIds: string[] = [];
  for (const invite of pending) {
    await addMemberInFile({
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role,
    });
    if (!workspaceIds.includes(invite.workspaceId)) {
      workspaceIds.push(invite.workspaceId);
    }
  }
  return workspaceIds;
}

async function placeAppInFile(
  workspaceId: string,
  appId: string,
  placedByUserId: string
): Promise<void> {
  const data = await readFileData();
  if (!data.workspaces.some((w) => w.id === workspaceId)) {
    throw new Error("Workspace not found.");
  }
  const existing = data.placements.find(
    (p) => p.workspaceId === workspaceId && p.appId === appId
  );
  if (existing) {
    return;
  }
  data.placements.push({
    workspaceId,
    appId,
    placedByUserId,
    placedAt: new Date().toISOString(),
  });
  await writeFileData(data);
}

async function removePlacementInFile(
  workspaceId: string,
  appId: string
): Promise<void> {
  const data = await readFileData();
  data.placements = data.placements.filter(
    (p) => !(p.workspaceId === workspaceId && p.appId === appId)
  );
  await writeFileData(data);
}

async function listPlacementsInFile(
  workspaceId: string
): Promise<WorkspacePlacement[]> {
  const data = await readFileData();
  return data.placements.filter((p) => p.workspaceId === workspaceId);
}

// --- Postgres implementations ---

async function createWorkspaceInPostgres(input: {
  name: string;
  ownerUserId: string;
}): Promise<Workspace> {
  await ensurePostgresStore();
  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: input.name,
    buildingPermissions: { ...DEFAULT_BUILDING_PERMISSIONS },
    createdAt: now,
    updatedAt: now,
  };
  const permissionsJson = JSON.stringify(workspace.buildingPermissions);

  await sql`
    INSERT INTO workspaces (id, name, building_permissions, created_at, updated_at)
    VALUES (
      ${workspace.id},
      ${workspace.name},
      ${permissionsJson},
      ${workspace.createdAt},
      ${workspace.updatedAt}
    )
  `;

  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
    VALUES (${workspace.id}, ${input.ownerUserId}, ${"owner"}, ${now})
  `;

  return workspace;
}

async function listWorkspacesForUserInPostgres(userId: string): Promise<Workspace[]> {
  await ensurePostgresStore();
  const result = await sql<WorkspaceRow>`
    SELECT w.id, w.name, w.building_permissions, w.created_at, w.updated_at
    FROM workspaces w
    INNER JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ${userId}
  `;
  return result.rows.map(rowToWorkspace);
}

async function getWorkspaceInPostgres(
  workspaceId: string
): Promise<Workspace | null> {
  await ensurePostgresStore();
  const result = await sql<WorkspaceRow>`
    SELECT id, name, building_permissions, created_at, updated_at
    FROM workspaces
    WHERE id = ${workspaceId}
    LIMIT 1
  `;
  const row = result.rows[0];
  return row ? rowToWorkspace(row) : null;
}

async function updateWorkspaceInPostgres(
  workspaceId: string,
  patch: Partial<Pick<Workspace, "name" | "buildingPermissions">>
): Promise<Workspace> {
  await ensurePostgresStore();
  const current = await getWorkspaceInPostgres(workspaceId);
  if (!current) {
    throw new Error("Workspace not found.");
  }
  const updated: Workspace = {
    ...current,
    name: patch.name ?? current.name,
    buildingPermissions: patch.buildingPermissions
      ? { ...patch.buildingPermissions }
      : current.buildingPermissions,
    updatedAt: new Date().toISOString(),
  };
  const permissionsJson = JSON.stringify(updated.buildingPermissions);
  await sql`
    UPDATE workspaces
    SET
      name = ${updated.name},
      building_permissions = ${permissionsJson},
      updated_at = ${updated.updatedAt}
    WHERE id = ${workspaceId}
  `;
  return updated;
}

async function deleteWorkspaceInPostgres(workspaceId: string): Promise<void> {
  await ensurePostgresStore();
  await sql`DELETE FROM workspace_placements WHERE workspace_id = ${workspaceId}`;
  await sql`DELETE FROM workspace_invites WHERE workspace_id = ${workspaceId}`;
  await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}`;
  await sql`DELETE FROM workspaces WHERE id = ${workspaceId}`;
}

async function listMembersInPostgres(
  workspaceId: string,
  query?: string
): Promise<WorkspaceMembership[]> {
  await ensurePostgresStore();
  const result = await sql<MemberRow>`
    SELECT workspace_id, user_id, role, joined_at
    FROM workspace_members
    WHERE workspace_id = ${workspaceId}
  `;
  return result.rows
    .map(rowToMembership)
    .filter((m) => matchesMemberQuery(m, query));
}

async function addMemberInPostgres(input: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<WorkspaceMembership> {
  await ensurePostgresStore();
  const workspace = await getWorkspaceInPostgres(input.workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const existing = await sql<MemberRow>`
    SELECT workspace_id, user_id, role, joined_at
    FROM workspace_members
    WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.userId}
    LIMIT 1
  `;
  if (existing.rows[0]) {
    return rowToMembership(existing.rows[0]);
  }

  const joinedAt = new Date().toISOString();
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
    VALUES (${input.workspaceId}, ${input.userId}, ${input.role}, ${joinedAt})
  `;
  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: input.role,
    joinedAt,
  };
}

async function setMemberRoleInPostgres(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  await ensurePostgresStore();
  const result = await sql`
    UPDATE workspace_members
    SET role = ${role}
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
  `;
  if (result.rowCount === 0) {
    throw new Error("Membership not found.");
  }
}

async function removeMemberInPostgres(
  workspaceId: string,
  userId: string
): Promise<void> {
  await ensurePostgresStore();
  await sql`
    DELETE FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
  `;
}

async function transferOwnershipInPostgres(
  workspaceId: string,
  toUserId: string,
  demoteTo: "facilitator" | "participant"
): Promise<void> {
  await ensurePostgresStore();
  const recipient = await sql<MemberRow>`
    SELECT workspace_id, user_id, role, joined_at
    FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${toUserId}
    LIMIT 1
  `;
  if (!recipient.rows[0]) {
    throw new Error("Transfer target must be an existing member.");
  }

  await sql`
    UPDATE workspace_members
    SET role = ${demoteTo}
    WHERE workspace_id = ${workspaceId} AND role = ${"owner"}
  `;
  await sql`
    UPDATE workspace_members
    SET role = ${"owner"}
    WHERE workspace_id = ${workspaceId} AND user_id = ${toUserId}
  `;
}

async function createInviteInPostgres(
  input: CreateInviteInput
): Promise<WorkspaceInvite> {
  await ensurePostgresStore();
  const workspace = await getWorkspaceInPostgres(input.workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }
  if (input.kind === "email" && !input.email?.trim()) {
    throw new Error("Email invite requires an email address.");
  }
  const invite: WorkspaceInvite = {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    kind: input.kind,
    role: input.role,
    token: input.token ?? generateInviteToken(),
    createdByUserId: input.createdByUserId,
    createdAt: new Date().toISOString(),
  };
  if (input.email) invite.email = input.email.trim();
  if (input.expiresAt) invite.expiresAt = input.expiresAt;

  await sql`
    INSERT INTO workspace_invites (
      id, workspace_id, kind, email, role, token, expires_at, revoked_at, created_by, created_at
    )
    VALUES (
      ${invite.id},
      ${invite.workspaceId},
      ${invite.kind},
      ${invite.email ?? null},
      ${invite.role},
      ${invite.token},
      ${invite.expiresAt ?? null},
      ${null},
      ${invite.createdByUserId},
      ${invite.createdAt}
    )
  `;
  return invite;
}

async function listInvitesInPostgres(
  workspaceId: string
): Promise<WorkspaceInvite[]> {
  await ensurePostgresStore();
  const result = await sql<InviteRow>`
    SELECT id, workspace_id, kind, email, role, token, expires_at, revoked_at, created_by, created_at
    FROM workspace_invites
    WHERE workspace_id = ${workspaceId}
  `;
  return result.rows.map(rowToInvite);
}

async function getInviteInPostgres(
  workspaceId: string,
  inviteId: string
): Promise<WorkspaceInvite | null> {
  await ensurePostgresStore();
  const result = await sql<InviteRow>`
    SELECT id, workspace_id, kind, email, role, token, expires_at, revoked_at, created_by, created_at
    FROM workspace_invites
    WHERE workspace_id = ${workspaceId} AND id = ${inviteId}
    LIMIT 1
  `;
  const row = result.rows[0];
  return row ? rowToInvite(row) : null;
}

async function revokeInviteInPostgres(
  workspaceId: string,
  inviteId: string
): Promise<void> {
  await ensurePostgresStore();
  const revokedAt = new Date().toISOString();
  const result = await sql`
    UPDATE workspace_invites
    SET revoked_at = ${revokedAt}
    WHERE workspace_id = ${workspaceId} AND id = ${inviteId}
  `;
  if (result.rowCount === 0) {
    throw new Error("Invite not found.");
  }
}

async function acceptInviteByTokenInPostgres(
  token: string,
  userId: string
): Promise<{ workspaceId: string }> {
  await ensurePostgresStore();
  const result = await sql<InviteRow>`
    SELECT id, workspace_id, kind, email, role, token, expires_at, revoked_at, created_by, created_at
    FROM workspace_invites
    WHERE token = ${token}
    LIMIT 1
  `;
  const invite = result.rows[0] ? rowToInvite(result.rows[0]) : null;
  if (!invite || !isInviteAcceptable(invite)) {
    throw new Error(inviteRejectReason(invite));
  }
  await addMemberInPostgres({
    workspaceId: invite.workspaceId,
    userId,
    role: invite.role,
  });
  return { workspaceId: invite.workspaceId };
}

async function acceptPendingEmailInvitesForUserInPostgres(
  userId: string,
  email: string
): Promise<string[]> {
  await ensurePostgresStore();
  const normalized = normalizeEmail(email);
  const result = await sql<InviteRow>`
    SELECT id, workspace_id, kind, email, role, token, expires_at, revoked_at, created_by, created_at
    FROM workspace_invites
    WHERE kind = ${"email"}
      AND email IS NOT NULL
      AND lower(email) = ${normalized}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  const workspaceIds: string[] = [];
  for (const row of result.rows) {
    const invite = rowToInvite(row);
    await addMemberInPostgres({
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role,
    });
    if (!workspaceIds.includes(invite.workspaceId)) {
      workspaceIds.push(invite.workspaceId);
    }
  }
  return workspaceIds;
}

async function placeAppInPostgres(
  workspaceId: string,
  appId: string,
  placedByUserId: string
): Promise<void> {
  await ensurePostgresStore();
  const workspace = await getWorkspaceInPostgres(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }
  const existing = await sql<PlacementRow>`
    SELECT workspace_id, app_id, placed_by, placed_at
    FROM workspace_placements
    WHERE workspace_id = ${workspaceId} AND app_id = ${appId}
    LIMIT 1
  `;
  if (existing.rows[0]) {
    return;
  }
  const placedAt = new Date().toISOString();
  await sql`
    INSERT INTO workspace_placements (workspace_id, app_id, placed_by, placed_at)
    VALUES (${workspaceId}, ${appId}, ${placedByUserId}, ${placedAt})
  `;
}

async function removePlacementInPostgres(
  workspaceId: string,
  appId: string
): Promise<void> {
  await ensurePostgresStore();
  await sql`
    DELETE FROM workspace_placements
    WHERE workspace_id = ${workspaceId} AND app_id = ${appId}
  `;
}

async function listPlacementsInPostgres(
  workspaceId: string
): Promise<WorkspacePlacement[]> {
  await ensurePostgresStore();
  const result = await sql<PlacementRow>`
    SELECT workspace_id, app_id, placed_by, placed_at
    FROM workspace_placements
    WHERE workspace_id = ${workspaceId}
  `;
  return result.rows.map(rowToPlacement);
}

// --- Public façade ---

export async function createWorkspace(input: {
  name: string;
  ownerUserId: string;
}): Promise<Workspace> {
  if (shouldUsePostgres()) {
    return createWorkspaceInPostgres(input);
  }
  return createWorkspaceInFile(input);
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  if (shouldUsePostgres()) {
    return listWorkspacesForUserInPostgres(userId);
  }
  return listWorkspacesForUserInFile(userId);
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  if (shouldUsePostgres()) {
    return getWorkspaceInPostgres(workspaceId);
  }
  return getWorkspaceInFile(workspaceId);
}

export async function updateWorkspace(
  workspaceId: string,
  patch: Partial<Pick<Workspace, "name" | "buildingPermissions">>
): Promise<Workspace> {
  if (shouldUsePostgres()) {
    return updateWorkspaceInPostgres(workspaceId, patch);
  }
  return updateWorkspaceInFile(workspaceId, patch);
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (shouldUsePostgres()) {
    return deleteWorkspaceInPostgres(workspaceId);
  }
  return deleteWorkspaceInFile(workspaceId);
}

export async function listMembers(
  workspaceId: string,
  query?: string
): Promise<WorkspaceMembership[]> {
  if (shouldUsePostgres()) {
    return listMembersInPostgres(workspaceId, query);
  }
  return listMembersInFile(workspaceId, query);
}

/** Low-level membership insert for invite acceptance (task 1.4) and tests. */
export async function addMember(input: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<WorkspaceMembership> {
  if (shouldUsePostgres()) {
    return addMemberInPostgres(input);
  }
  return addMemberInFile(input);
}

export async function setMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  if (shouldUsePostgres()) {
    return setMemberRoleInPostgres(workspaceId, userId, role);
  }
  return setMemberRoleInFile(workspaceId, userId, role);
}

export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return removeMemberInPostgres(workspaceId, userId);
  }
  return removeMemberInFile(workspaceId, userId);
}

export async function transferOwnership(
  workspaceId: string,
  toUserId: string,
  demoteTo: "facilitator" | "participant"
): Promise<void> {
  if (shouldUsePostgres()) {
    return transferOwnershipInPostgres(workspaceId, toUserId, demoteTo);
  }
  return transferOwnershipInFile(workspaceId, toUserId, demoteTo);
}

export async function createInvite(
  input: CreateInviteInput
): Promise<WorkspaceInvite> {
  if (shouldUsePostgres()) {
    return createInviteInPostgres(input);
  }
  return createInviteInFile(input);
}

export async function listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  if (shouldUsePostgres()) {
    return listInvitesInPostgres(workspaceId);
  }
  return listInvitesInFile(workspaceId);
}

export async function getInvite(
  workspaceId: string,
  inviteId: string
): Promise<WorkspaceInvite | null> {
  if (shouldUsePostgres()) {
    return getInviteInPostgres(workspaceId, inviteId);
  }
  return getInviteInFile(workspaceId, inviteId);
}

export async function revokeInvite(
  workspaceId: string,
  inviteId: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return revokeInviteInPostgres(workspaceId, inviteId);
  }
  return revokeInviteInFile(workspaceId, inviteId);
}

export async function acceptInviteByToken(
  token: string,
  userId: string
): Promise<{ workspaceId: string }> {
  if (shouldUsePostgres()) {
    return acceptInviteByTokenInPostgres(token, userId);
  }
  return acceptInviteByTokenInFile(token, userId);
}

export async function acceptPendingEmailInvitesForUser(
  userId: string,
  email: string
): Promise<string[]> {
  if (shouldUsePostgres()) {
    return acceptPendingEmailInvitesForUserInPostgres(userId, email);
  }
  return acceptPendingEmailInvitesForUserInFile(userId, email);
}

export async function placeApp(
  workspaceId: string,
  appId: string,
  placedByUserId: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return placeAppInPostgres(workspaceId, appId, placedByUserId);
  }
  return placeAppInFile(workspaceId, appId, placedByUserId);
}

export async function removePlacement(
  workspaceId: string,
  appId: string
): Promise<void> {
  if (shouldUsePostgres()) {
    return removePlacementInPostgres(workspaceId, appId);
  }
  return removePlacementInFile(workspaceId, appId);
}

export async function listPlacements(
  workspaceId: string
): Promise<WorkspacePlacement[]> {
  if (shouldUsePostgres()) {
    return listPlacementsInPostgres(workspaceId);
  }
  return listPlacementsInFile(workspaceId);
}
