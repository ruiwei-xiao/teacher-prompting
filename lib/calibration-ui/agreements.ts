/**
 * Client-safe Ready / agreement helpers (merge + consensus).
 * Does not import the calibration engine, store, or API modules.
 */
export type AgreementSubject = "merge_complete" | "final_consensus";

export function agreementsApiHref(teamId: string): string {
  return `/api/calibration/teams/${teamId}/agreements`;
}

export function agreementPostBody(
  subject: AgreementSubject
): { subject: AgreementSubject } {
  return { subject };
}

export function readySubjectForPhase(phase: string): AgreementSubject | null {
  if (phase === "merge") return "merge_complete";
  if (phase === "consensus") return "final_consensus";
  return null;
}

export function isReadyPhase(phase: string): boolean {
  return readySubjectForPhase(phase) !== null;
}

export function hasMarkedReady(
  space: { readyUserIds: string[] },
  userId: string
): boolean {
  return space.readyUserIds.includes(userId);
}

export function canMarkReady(
  space: {
    role: string;
    phase: string;
    locked: boolean;
    readyUserIds: string[];
  },
  userId: string
): boolean {
  return (
    space.role === "member" &&
    !space.locked &&
    readySubjectForPhase(space.phase) !== null &&
    !hasMarkedReady(space, userId)
  );
}

export function canWithdrawReady(
  space: {
    role: string;
    phase: string;
    locked: boolean;
    readyUserIds: string[];
  },
  userId: string
): boolean {
  return (
    space.role === "member" &&
    !space.locked &&
    readySubjectForPhase(space.phase) !== null &&
    hasMarkedReady(space, userId)
  );
}

export function readyHint(phase: string, role: string): string {
  if (phase === "merge") {
    return role === "operator"
      ? "Members press Ready when they agree the shared rubric is done. This view is read-only."
      : "When the shared rubric looks right, press Ready. You can undo Ready until scoring starts. Editing the rubric clears Ready marks.";
  }
  if (phase === "consensus") {
    return role === "operator"
      ? "Members press Ready when they agree the final rubric is done. This view is read-only."
      : "When the final rubric looks right, press Ready. You can undo Ready until the rubric locks. Editing the rubric clears Ready marks.";
  }
  return "";
}

export function readyButtonLabel(already: boolean, busy: boolean): string {
  if (busy) return "Saving…";
  if (already) return "You marked Ready";
  return "Ready";
}

export function undoReadyLabel(busy: boolean): string {
  return busy ? "Saving…" : "Undo Ready";
}
