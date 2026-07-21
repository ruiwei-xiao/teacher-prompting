/**
 * Client-safe parser for GET /api/stars (Task 3.1).
 * Keeps StarredBotGrid free of ad-hoc response shape checks.
 */

export type StarOpenTarget =
  | { kind: "editor"; href: string }
  | { kind: "peer"; href: string; workspaceId: string };

export type EligibleStarSummary = {
  appId: string;
  title: string;
  description?: string;
  owned: boolean;
  open: StarOpenTarget;
  starredAt: string;
};

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

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

function isStarOpenTarget(value: unknown): value is StarOpenTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const open = value as Record<string, unknown>;
  if (typeof open.href !== "string" || !open.href.trim()) return false;
  if (open.kind === "editor") return true;
  if (open.kind === "peer") {
    return typeof open.workspaceId === "string" && Boolean(open.workspaceId.trim());
  }
  return false;
}

function isEligibleStarSummary(value: unknown): value is EligibleStarSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const star = value as Record<string, unknown>;
  if (typeof star.appId !== "string" || !star.appId.trim()) return false;
  if (typeof star.title !== "string") return false;
  if (typeof star.owned !== "boolean") return false;
  if (typeof star.starredAt !== "string" || !star.starredAt.trim()) return false;
  if (!isStarOpenTarget(star.open)) return false;
  if (
    star.description !== undefined &&
    typeof star.description !== "string"
  ) {
    return false;
  }
  return true;
}

/** Parse GET /api/stars JSON into eligible star summaries. */
export function parseStarsListResponse(
  status: number,
  body: unknown
): ParseResult<{ stars: EligibleStarSummary[] }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load starred bots"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid stars response" };
  }
  const stars = (body as { stars?: unknown }).stars;
  if (!Array.isArray(stars) || !stars.every(isEligibleStarSummary)) {
    return { ok: false, error: "Invalid stars response" };
  }
  return { ok: true, stars };
}
