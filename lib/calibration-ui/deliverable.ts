/**
 * Client-safe final-deliverable helpers (Task 5.5).
 * Locked rubric, unresolved labels, and personal addenda.
 * Does not import the calibration engine, store, or API modules.
 */
import { labelForUserId } from "@/lib/auth/user-label";

export const BEFORE_LOCK_ADDENDUM_MESSAGE =
  "addendum is only allowed after the group artifact is locked";

export type DeliverableRole = "member" | "operator";

export type DeliverableAddendum = {
  id: string;
  teamId: string;
  userId: string;
  body: string;
  createdAt: string;
};

export type DeliverableSnapshot = {
  autoFinalized: boolean;
  rubricText: string;
  flaggedCriteria: string[];
  addenda: DeliverableAddendum[];
};

export type DeliverableView = {
  visible: boolean;
  rubricText: string;
  unresolvedLabels: string[];
  autoFinalized: boolean;
  addenda: DeliverableAddendum[];
  showComposer: boolean;
  canPostAddendum: boolean;
  canEditGroupRubric: boolean;
  offersRollback: boolean;
};

export function addendaApiHref(teamId: string): string {
  return `/api/calibration/teams/${teamId}/addenda`;
}

export function addendumPostBody(text: string): { body: string } {
  return { body: text.trim() };
}

export function oneAddendumPerUser(
  addenda: DeliverableAddendum[]
): DeliverableAddendum[] {
  const latest = new Map<string, DeliverableAddendum>();
  for (const row of addenda) {
    const current = latest.get(row.userId);
    if (!current || row.createdAt >= current.createdAt) {
      latest.set(row.userId, row);
    }
  }
  return [...latest.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

export function ownAddendum(
  addenda: DeliverableAddendum[],
  viewerUserId: string
): DeliverableAddendum | null {
  return (
    oneAddendumPerUser(addenda).find((row) => row.userId === viewerUserId) ??
    null
  );
}

export function addendumAuthorLabel(
  row: Pick<DeliverableAddendum, "userId">,
  viewerUserId: string,
  labels: Record<string, string> = {}
): string {
  if (row.userId === viewerUserId) return "You";
  return labelForUserId(row.userId, labels);
}

export function canPostAddendum(input: {
  locked: boolean;
  role: DeliverableRole;
}): boolean {
  return input.locked && input.role === "member";
}

export function unresolvedLabels(flaggedCriteria: string[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const raw of flaggedCriteria) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/** Visible group artifact: finalRubric ?? rubric snapshot. */
export function visibleRubricText(
  finalRubric: string | null | undefined,
  snapshotText: string
): string {
  return finalRubric ?? snapshotText;
}

export function isDeliverableLocked(space: {
  locked: boolean;
  phase: string;
}): boolean {
  return space.locked || space.phase === "finalized";
}

export const OPEN_FINAL_LABEL = "Open Final";

export function shouldOfferDeliverable(message: {
  authorKind?: string;
  body: string;
}): boolean {
  if (message.authorKind !== "facilitator") return false;
  return (
    /open final/i.test(message.body) ||
    /locked the final rubric/i.test(message.body) ||
    /this activity is auto-finalized/i.test(message.body)
  );
}

export function beforeLockAddendumRejected(
  status: number,
  body: unknown
): boolean {
  if (status !== 409) return false;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error.includes(BEFORE_LOCK_ADDENDUM_MESSAGE);
}

export function buildDeliverableView(input: {
  locked: boolean;
  autoFinalized: boolean;
  rubricText: string;
  flaggedCriteria: string[];
  addenda: DeliverableAddendum[];
  role?: DeliverableRole;
}): DeliverableView {
  const role = input.role ?? "member";
  const canPost = canPostAddendum({ locked: input.locked, role });
  if (!input.locked) {
    return {
      visible: false,
      rubricText: input.rubricText,
      unresolvedLabels: [],
      autoFinalized: input.autoFinalized,
      addenda: [],
      showComposer: false,
      canPostAddendum: false,
      canEditGroupRubric: false,
      offersRollback: false,
    };
  }
  return {
    visible: true,
    rubricText: input.rubricText,
    unresolvedLabels: input.autoFinalized
      ? unresolvedLabels(input.flaggedCriteria)
      : [],
    autoFinalized: input.autoFinalized,
    addenda: oneAddendumPerUser(input.addenda).map((row) => ({ ...row })),
    showComposer: canPost,
    canPostAddendum: canPost,
    canEditGroupRubric: false,
    offersRollback: false,
  };
}

/** Insert or replace that member's addendum without mutating the locked rubric. */
export function upsertPostedAddendum(
  current: DeliverableView,
  posted: DeliverableAddendum
): DeliverableView {
  return {
    ...current,
    rubricText: current.rubricText,
    unresolvedLabels: [...current.unresolvedLabels],
    autoFinalized: current.autoFinalized,
    addenda: oneAddendumPerUser(
      current.addenda
        .filter((row) => row.userId !== posted.userId)
        .concat({ ...posted })
    ),
  };
}

export function parseAddendumPostResponse(
  status: number,
  body: unknown
):
  | { ok: true; addendum: DeliverableAddendum }
  | { ok: false; error: string } {
  if (status !== 200) {
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      const trimmed = ((body as { error: string }).error || "").trim();
      if (trimmed) return { ok: false, error: trimmed };
    }
    return { ok: false, error: "Failed to post addendum" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid addendum response" };
  }
  const record = body as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.teamId !== "string" ||
    typeof record.userId !== "string" ||
    typeof record.body !== "string" ||
    typeof record.createdAt !== "string"
  ) {
    return { ok: false, error: "Invalid addendum response" };
  }
  return {
    ok: true,
    addendum: {
      id: record.id,
      teamId: record.teamId,
      userId: record.userId,
      body: record.body,
      createdAt: record.createdAt,
    },
  };
}
