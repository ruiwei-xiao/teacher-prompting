import { shouldBlockPublishForTestCases } from "@/lib/assisted-authoring/publish-gate";
import type { TestCaseStatus } from "@/lib/assisted-authoring/publish-gate";

export const UNPUBLISHED_CHANGES_NOTICE = "You have unpublished changes.";
export const PUBLISHED_STATUS_LABEL = "Published";

export type EditorPublishActionLabel = "Publish" | "Republish";

export type EditorPublishChrome = {
  actionLabel: EditorPublishActionLabel | null;
  notice: string | null;
  statusLabel: string | null;
};

export type EditorVersionPointers = {
  latestVersionId: string | null;
  publishedVersionId: string | null;
};

export type EditorDraftSnapshot = EditorVersionPointers & {
  storedPrompt: string;
  dirty: boolean;
  error: string | null;
};

export type EditorPublishPlan =
  | { blocked: true; error: string }
  | { blocked: false; body: { systemPrompt: string; publish: true } };

export type OwnerAppView = EditorVersionPointers & {
  publishedAt: string | null;
  publicSlug: string | null;
};

export type OwnerPatchSettlement =
  | { ok: true; latestVersionId: string | null; publishedVersionId: string | null }
  | { ok: false; error: string };

function versionId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Header state comes from the server version ids.
 * A missing published id is a bot that has never been published.
 */
export function deriveEditorPublishChrome(
  pointers: EditorVersionPointers
): EditorPublishChrome {
  const publishedVersionId = versionId(pointers.publishedVersionId);
  const latestVersionId = versionId(pointers.latestVersionId);
  if (!publishedVersionId) {
    return { actionLabel: "Publish", notice: null, statusLabel: null };
  }
  if (latestVersionId !== publishedVersionId) {
    return {
      actionLabel: "Republish",
      notice: UNPUBLISHED_CHANGES_NOTICE,
      statusLabel: null,
    };
  }
  return {
    actionLabel: null,
    notice: null,
    statusLabel: PUBLISHED_STATUS_LABEL,
  };
}

export function readOwnerVersionPointers(app: {
  latestVersionId?: unknown;
  publishedVersionId?: unknown;
}): EditorVersionPointers {
  return {
    latestVersionId: versionId(app.latestVersionId),
    publishedVersionId: versionId(app.publishedVersionId),
  };
}

/** Owner payload fields the editor may keep. API keys are dropped. */
export function readOwnerAppRecord(body: unknown): OwnerAppView | null {
  if (!body || typeof body !== "object" || !("app" in body)) return null;
  const app = (body as { app: unknown }).app;
  if (!app || typeof app !== "object") return null;
  const record = app as Record<string, unknown>;
  return {
    latestVersionId: versionId(record.latestVersionId),
    publishedVersionId: versionId(record.publishedVersionId),
    publishedAt: textOrNull(record.publishedAt),
    publicSlug: textOrNull(record.publicSlug),
  };
}

export function readResponseError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) return fallback;
  const error = (body as { error: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

/** Copy server ids and leave the editor error, prompt, and dirty flag alone. */
export function adoptOwnerVersionPointers(
  state: EditorDraftSnapshot,
  app: {
    latestVersionId?: unknown;
    publishedVersionId?: unknown;
    apiKey?: unknown;
    publishedApiKey?: unknown;
  }
): EditorDraftSnapshot {
  const pointers = readOwnerVersionPointers(app);
  return {
    ...state,
    latestVersionId: pointers.latestVersionId,
    publishedVersionId: pointers.publishedVersionId,
  };
}

export function applySuccessfulOwnerPatch(
  state: EditorDraftSnapshot,
  app: {
    latestVersionId?: unknown;
    publishedVersionId?: unknown;
    publishedAt?: unknown;
    apiKey?: unknown;
    publishedApiKey?: unknown;
  }
): EditorDraftSnapshot {
  const pointers = readOwnerVersionPointers(app);
  return {
    ...state,
    latestVersionId: pointers.latestVersionId,
    publishedVersionId: pointers.publishedVersionId,
    error: null,
  };
}

export function applyFailedOwnerPatch(
  state: EditorDraftSnapshot,
  error: string
): EditorDraftSnapshot {
  return {
    ...state,
    error,
  };
}

export function settleOwnerPatch(
  state: EditorDraftSnapshot,
  result: OwnerPatchSettlement
): EditorDraftSnapshot {
  if (result.ok) return applySuccessfulOwnerPatch(state, result);
  return applyFailedOwnerPatch(state, result.error);
}

export function planEditorPublishAttempt(input: {
  assistedAuthoringMode: boolean;
  testCaseStatus: TestCaseStatus;
  systemPrompt: string;
}): EditorPublishPlan {
  const gate = shouldBlockPublishForTestCases(
    input.assistedAuthoringMode,
    input.testCaseStatus
  );
  if (gate.shouldBlock) {
    return {
      blocked: true,
      error: gate.reason || "Cannot publish at this time.",
    };
  }
  return {
    blocked: false,
    body: { systemPrompt: input.systemPrompt, publish: true },
  };
}
