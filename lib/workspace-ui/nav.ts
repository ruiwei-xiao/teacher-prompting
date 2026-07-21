/**
 * Client-safe Workspace navigation helpers for WorkspaceSidebar / create dialog.
 */
import type { Workspace } from "@/lib/workspace-store/types";

export const MY_BOTS_HREF = "/";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const w = value as Record<string, unknown>;
  return typeof w.id === "string" && typeof w.name === "string";
}

function errorFromBody(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    const trimmed = ((body as { error: string }).error || "").trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/** Parse GET /api/workspaces JSON. */
export function parseWorkspacesListResponse(
  status: number,
  body: unknown
): ParseResult<{ workspaces: Workspace[] }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load workspaces"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid workspaces response" };
  }
  const workspaces = (body as { workspaces?: unknown }).workspaces;
  if (!Array.isArray(workspaces) || !workspaces.every(isWorkspace)) {
    return { ok: false, error: "Invalid workspaces response" };
  }
  return { ok: true, workspaces };
}

/** Build POST /api/workspaces body; null when name is blank after trim. */
export function buildCreateWorkspaceBody(
  name: string
): { name: string } | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return { name: trimmed };
}

/** Parse POST /api/workspaces JSON. */
export function parseCreateWorkspaceResponse(
  status: number,
  body: unknown
): ParseResult<{ workspace: Workspace }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to create workspace"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid create workspace response" };
  }
  const workspace = (body as { workspace?: unknown }).workspace;
  if (!isWorkspace(workspace)) {
    return { ok: false, error: "Invalid create workspace response" };
  }
  return { ok: true, workspace };
}

export function workspaceHubHref(workspaceId: string): string {
  return `/workspace/${workspaceId}`;
}
