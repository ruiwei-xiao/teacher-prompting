/**
 * Star eligibility + open-target resolution (Task 1.2).
 *
 * Owned bots → editor. Workspace-visible peer bots → peer non-edit inspect.
 * Reuses existing Workspace visibility (permission b / bots.inspectPeer) via
 * getWorkspaceBotSnapshot — does not redefine building permissions.
 *
 * When multiple Workspaces expose the same peer bot, pick the lexicographically
 * smallest workspaceId for a stable open target.
 */
import { getAppById } from "@/lib/app-store/store";
import { getWorkspaceBotSnapshot } from "@/lib/workspace-api/workspaces-bots";
import { listWorkspacesForUser } from "@/lib/workspace-store/store";
import { peerBotPreviewHref } from "@/lib/workspace-ui/peer-preview";

export type StarOpenTarget =
  | { kind: "editor"; href: string }
  | { kind: "peer"; href: string; workspaceId: string };

export type EligibleStar = {
  appId: string;
  title: string;
  description?: string;
  owned: boolean;
  open: StarOpenTarget;
  starredAt: string;
};

export type AssertCanStarResult =
  | { ok: true; owned: boolean }
  | { ok: false; reason: "not_found" | "forbidden" };

function editorHref(appId: string): string {
  return `/app/${appId}/editor`;
}

/**
 * First Workspace (stable lex order) where the user can inspect the placed bot
 * under existing peer visibility rules.
 */
async function findVisiblePeerWorkspaceId(
  userId: string,
  appId: string
): Promise<string | null> {
  const workspaces = await listWorkspacesForUser(userId);
  const sorted = [...workspaces].sort((a, b) => a.id.localeCompare(b.id));

  for (const workspace of sorted) {
    const snap = await getWorkspaceBotSnapshot(userId, workspace.id, appId);
    if (snap.ok) {
      return workspace.id;
    }
  }

  return null;
}

export async function assertCanStar(
  userId: string,
  appId: string
): Promise<AssertCanStarResult> {
  const owned = await getAppById(appId, userId);
  if (owned) {
    return { ok: true, owned: true };
  }

  const exists = await getAppById(appId);
  if (!exists) {
    return { ok: false, reason: "not_found" };
  }

  const peerWorkspaceId = await findVisiblePeerWorkspaceId(userId, appId);
  if (peerWorkspaceId) {
    return { ok: true, owned: false };
  }

  return { ok: false, reason: "forbidden" };
}

export async function resolveEligibleStar(
  userId: string,
  appId: string,
  starredAt: string
): Promise<EligibleStar | null> {
  const owned = await getAppById(appId, userId);
  if (owned) {
    return {
      appId,
      title: owned.name,
      description: owned.description,
      owned: true,
      open: { kind: "editor", href: editorHref(appId) },
      starredAt,
    };
  }

  const exists = await getAppById(appId);
  if (!exists) {
    return null;
  }

  const peerWorkspaceId = await findVisiblePeerWorkspaceId(userId, appId);
  if (!peerWorkspaceId) {
    return null;
  }

  return {
    appId,
    title: exists.name,
    description: exists.description,
    owned: false,
    open: {
      kind: "peer",
      href: peerBotPreviewHref(peerWorkspaceId, appId),
      workspaceId: peerWorkspaceId,
    },
    starredAt,
  };
}
