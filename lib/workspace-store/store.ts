/**
 * WorkspaceStore — dual persistence (Postgres + JSON fallback) for workspaces
 * and memberships. Mirrors lib/app-store/store.ts and lib/auth/user-store.ts.
 *
 * Task 1.3: workspace + membership methods only (invites/placements/activity later).
 */
import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import type {
  BuildingPermissions,
  Workspace,
  WorkspaceMembership,
  WorkspaceRole,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DEFAULT_WORKSPACES_FILE = path.join(DATA_DIR, "workspaces.json");

type WorkspaceFileData = {
  workspaces: Workspace[];
  members: WorkspaceMembership[];
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

function emptyFileData(): WorkspaceFileData {
  return { workspaces: [], members: [] };
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
