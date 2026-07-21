/**
 * Client-safe create-flow helpers: optional place-into-Workspace (Task 7.1).
 * Personal My bots create omits workspaceId; placement uses POST /api/apps (4.2).
 */
import type {
  BuildingPermissions,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import { canPlaceIntoWorkspace } from "./hub";

/** Empty select value = personal My bots create (no Workspace required). */
export const PERSONAL_CREATE_TARGET_VALUE = "";

export type CreateIntoWorkspaceTarget = {
  id: string;
  name: string;
  role: WorkspaceRole;
  buildingPermissions: BuildingPermissions;
};

/**
 * Memberships the actor may create a bot into (permission a × role).
 * Owners/Facilitators always; Participants need canCreateBots.
 */
export function listAllowedCreateIntoWorkspaceTargets(
  candidates: CreateIntoWorkspaceTarget[]
): CreateIntoWorkspaceTarget[] {
  return candidates.filter((c) =>
    canPlaceIntoWorkspace({
      role: c.role,
      permissions: c.buildingPermissions,
    })
  );
}

/**
 * Build POST /api/apps body. Omits workspaceId for personal create so the bot
 * stays under My bots only; when set, apps create API places into that Workspace.
 */
export function buildCreateAppRequestBody(input: {
  name: string;
  description: string;
  genaiModel: string;
  genaiApiKey: string;
  workspaceId?: string | null;
}): {
  name: string;
  description: string;
  genaiModel: string;
  genaiApiKey: string;
  workspaceId?: string;
} {
  const body: {
    name: string;
    description: string;
    genaiModel: string;
    genaiApiKey: string;
    workspaceId?: string;
  } = {
    name: input.name,
    description: input.description,
    genaiModel: input.genaiModel,
    genaiApiKey: input.genaiApiKey,
  };

  const workspaceId =
    typeof input.workspaceId === "string" ? input.workspaceId.trim() : "";
  if (workspaceId) {
    body.workspaceId = workspaceId;
  }
  return body;
}

/**
 * Optional ?workspaceId= preselect on /create when the target is allowed.
 * Falls back to personal create — never forces a Workspace.
 */
export function resolveInitialCreateWorkspaceId(input: {
  queryWorkspaceId?: string | null;
  allowedTargets: CreateIntoWorkspaceTarget[];
}): string {
  const query =
    typeof input.queryWorkspaceId === "string"
      ? input.queryWorkspaceId.trim()
      : "";
  if (!query) return PERSONAL_CREATE_TARGET_VALUE;
  if (input.allowedTargets.some((t) => t.id === query)) {
    return query;
  }
  return PERSONAL_CREATE_TARGET_VALUE;
}

/** Create page href; optional Workspace preselect for hub “create into” entry. */
export function createHrefWithWorkspace(workspaceId?: string | null): string {
  const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
  if (!id) return "/create";
  return `/create?workspaceId=${encodeURIComponent(id)}`;
}
