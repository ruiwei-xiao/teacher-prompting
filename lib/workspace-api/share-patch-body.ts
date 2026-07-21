/**
 * Client-safe educator share PATCH body for ShareDialog callers.
 * Optional workspaceId enables AppsAPIGates permission (c); omit for My bots / editor.
 */

export type EducatorSharePatchSettings = {
  projectShareVisibility: "private" | "public";
  shareAuthorName: boolean;
  communitySubject: string;
  communityTagsInput: string;
  /** When set (e.g. Workspace hub), permission (c) applies for that Workspace. */
  workspaceId?: string | null;
};

export type EducatorSharePatchBody = {
  shareProject: true;
  projectShareVisibility: "private" | "public";
  shareAuthorName: boolean;
  communitySubject: string;
  communityTags: string[];
  workspaceId?: string;
};

export const EDUCATOR_SHARE_FORBIDDEN_FALLBACK =
  "Educator sharing is blocked by Workspace policy (members may not share outside)";

/**
 * Build PATCH JSON for `/api/apps/[appId]` educator outward share.
 * Includes `workspaceId` only when non-empty so (c) stays Playlab-scoped.
 */
export function buildEducatorSharePatchBody(
  settings: EducatorSharePatchSettings
): EducatorSharePatchBody {
  const body: EducatorSharePatchBody = {
    shareProject: true,
    projectShareVisibility: settings.projectShareVisibility,
    shareAuthorName: settings.shareAuthorName,
    communitySubject: settings.communitySubject,
    communityTags: settings.communityTagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };

  const workspaceId =
    typeof settings.workspaceId === "string" ? settings.workspaceId.trim() : "";
  if (workspaceId) {
    body.workspaceId = workspaceId;
  }

  return body;
}

/** Map share PATCH HTTP failure to UI copy; 403 always mentions Workspace policy. */
export function educatorSharePatchErrorMessage(
  status: number,
  apiError?: string | null
): string {
  const trimmed = typeof apiError === "string" ? apiError.trim() : "";
  if (status === 403) {
    return trimmed || EDUCATOR_SHARE_FORBIDDEN_FALLBACK;
  }
  return trimmed || "Failed to prepare share links.";
}
