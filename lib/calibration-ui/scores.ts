/**
 * Client-safe score-sheet helpers (Task 5.4).
 * Private 1–5 entry, submission checkmarks, revealed-matrix flags.
 * Does not import the calibration engine, store, or API modules.
 */
import { SCORE_MAX, SCORE_MIN } from "@/lib/calibration-store/types";

export { SCORE_MAX, SCORE_MIN };

export type ScoreEntry = {
  criterionKey: string;
  value: number;
};

export type ScoreMatrixRow = {
  userId: string;
  scores: ScoreEntry[];
};

export type ScoreSpace = {
  role: "member" | "operator";
  phase: string;
  locked: boolean;
  ownScores: ScoreEntry[];
  submittedBy: string[];
  revealedAt: string | null;
  matrix: ScoreMatrixRow[];
};

export type ScoreSheetMode =
  | "hidden"
  | "readonly"
  | "entry"
  | "submitted"
  | "matrix";

export type ScoreSheetView = {
  mode: ScoreSheetMode;
  criterionKeys: string[];
  ownScores: ScoreEntry[];
  submittedUserIds: string[];
  matrix: ScoreMatrixRow[];
  flaggedKeys: string[];
  canSubmit: boolean;
  canEnter: boolean;
};

export function scoresApiHref(teamId: string): string {
  return `/api/calibration/teams/${teamId}/scores`;
}

export function isValidScoreValue(value: number): boolean {
  return Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX;
}

export function scorePostBody(entries: ScoreEntry[]): { scores: ScoreEntry[] } {
  const scores: ScoreEntry[] = [];
  for (const entry of entries) {
    if (typeof entry.criterionKey !== "string" || !entry.criterionKey.trim()) {
      throw new Error("Missing criterionKey");
    }
    if (!isValidScoreValue(entry.value)) {
      throw new Error(
        `Score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}.`
      );
    }
    scores.push({
      criterionKey: entry.criterionKey.trim(),
      value: entry.value,
    });
  }
  return { scores };
}

export function isRevealed(space: Pick<ScoreSpace, "revealedAt">): boolean {
  return typeof space.revealedAt === "string" && space.revealedAt.length > 0;
}

export function visibleOwnScores(
  space: Pick<ScoreSpace, "ownScores">
): ScoreEntry[] {
  return space.ownScores.map((row) => ({
    criterionKey: row.criterionKey,
    value: row.value,
  }));
}

/** User ids of members who submitted. Never includes numeric values. */
export function submittedCheckmarks(
  space: Pick<ScoreSpace, "submittedBy">
): string[] {
  return space.submittedBy.filter((id) => typeof id === "string" && id.length > 0);
}

export function flaggedCriterionKeys(matrix: ScoreMatrixRow[]): string[] {
  const byKey = new Map<string, number[]>();
  for (const row of matrix) {
    for (const score of row.scores) {
      const list = byKey.get(score.criterionKey) ?? [];
      list.push(score.value);
      byKey.set(score.criterionKey, list);
    }
  }
  const flagged: string[] = [];
  for (const [key, values] of byKey) {
    if (values.length === 0) continue;
    const spread = Math.max(...values) - Math.min(...values);
    if (spread >= 2) flagged.push(key);
  }
  return flagged;
}

export function resolveCriterionKeys(
  space: Pick<ScoreSpace, "ownScores" | "matrix">,
  fallbackKeys: string[]
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (key: string) => {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push(trimmed);
  };
  for (const row of space.ownScores) add(row.criterionKey);
  for (const member of space.matrix) {
    for (const row of member.scores) add(row.criterionKey);
  }
  for (const key of fallbackKeys) add(key);
  return keys;
}

/**
 * Member pre-reveal: never expose teammate numeric rows.
 * Revealed members and operators may see the matrix that is present.
 */
export function visibleMatrix(
  space: ScoreSpace,
  _viewerUserId: string
): ScoreMatrixRow[] {
  if (!isRevealed(space) && space.role !== "operator") return [];
  return space.matrix.map((row) => ({
    userId: row.userId,
    scores: row.scores.map((score) => ({
      criterionKey: score.criterionKey,
      value: score.value,
    })),
  }));
}

export function buildScoreSheetView(
  space: ScoreSpace,
  viewerUserId: string,
  fallbackKeys: string[]
): ScoreSheetView {
  const criterionKeys = resolveCriterionKeys(space, fallbackKeys);
  const ownScores = visibleOwnScores(space);
  const submittedUserIds = submittedCheckmarks(space);
  const revealed = isRevealed(space);
  const matrix = visibleMatrix(space, viewerUserId);
  const flaggedKeys =
    revealed || space.role === "operator" ? flaggedCriterionKeys(matrix) : [];
  const alreadySubmitted = submittedUserIds.includes(viewerUserId);
  const scoring = space.phase === "scoring";
  const member = space.role === "member";

  if (revealed || (space.role === "operator" && matrix.length > 0)) {
    return {
      mode: "matrix",
      criterionKeys,
      ownScores,
      submittedUserIds,
      matrix,
      flaggedKeys,
      canSubmit: false,
      canEnter: false,
    };
  }

  if (space.role === "operator") {
    return {
      mode: "readonly",
      criterionKeys,
      ownScores: [],
      submittedUserIds,
      matrix: [],
      flaggedKeys: [],
      canSubmit: false,
      canEnter: false,
    };
  }

  if (scoring && !space.locked && member && !alreadySubmitted) {
    return {
      mode: "entry",
      criterionKeys,
      ownScores,
      submittedUserIds,
      matrix: [],
      flaggedKeys: [],
      canSubmit: true,
      canEnter: true,
    };
  }

  if (scoring && member && alreadySubmitted) {
    return {
      mode: "submitted",
      criterionKeys,
      ownScores,
      submittedUserIds,
      matrix: [],
      flaggedKeys: [],
      canSubmit: false,
      canEnter: false,
    };
  }

  return {
    mode: "readonly",
    criterionKeys,
    ownScores: scoring ? ownScores : [],
    submittedUserIds: scoring ? submittedUserIds : [],
    matrix: [],
    flaggedKeys: [],
    canSubmit: false,
    canEnter: false,
  };
}

/**
 * True when a member's pre-reveal view model would expose another member's
 * numeric scores. Must stay false even if the payload matrix leaked.
 */
export function preRevealLeaksTeammateValues(
  space: ScoreSpace,
  viewerUserId: string,
  fallbackKeys: string[] = []
): boolean {
  if (isRevealed(space)) return false;
  if (space.role === "operator") return false;
  const view = buildScoreSheetView(space, viewerUserId, fallbackKeys);
  for (const row of view.matrix) {
    if (row.userId !== viewerUserId && row.scores.length > 0) return true;
  }
  const teammateValues = new Set<number>();
  for (const row of space.matrix) {
    if (row.userId === viewerUserId) continue;
    for (const score of row.scores) teammateValues.add(score.value);
  }
  const ownValues = new Set(view.ownScores.map((score) => score.value));
  const blob = JSON.stringify({
    ownScores: view.ownScores,
    submittedUserIds: view.submittedUserIds,
    matrix: view.matrix,
  });
  for (const value of teammateValues) {
    if (ownValues.has(value)) continue;
    if (blob.includes(`"value":${value}`)) return true;
  }
  return false;
}

export function parseScorePostResponse(
  status: number,
  body: unknown
): { ok: true; submitted: true } | { ok: false; error: string } {
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
    return { ok: false, error: "Failed to submit scores" };
  }
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as { submitted?: unknown }).submitted === true
  ) {
    return { ok: true, submitted: true };
  }
  return { ok: false, error: "Invalid score response" };
}
