/**
 * Client-safe course-gate helpers (Task 5.1).
 * Queue copy, notice destinations, and check-in → next location.
 * Does not import the calibration engine or store.
 */

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type CheckInView = {
  status: string;
  queueCount: number;
  of: 3;
  teamId: string | null;
};

export type GateView = {
  offering: {
    id: string;
    title: string;
  };
  me: {
    checkedIn: boolean;
    queueCount: number;
    teamId: string | null;
    role: "operator" | "learner";
  };
};

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

/** Course-gate / queue-status path used by notices (13.3). */
export function offeringGatePath(offeringId: string): string {
  return `/activity/${offeringId}`;
}

/** Team-space path used by notices and matched check-in redirects (13.3). */
export function teamSpacePath(offeringId: string, teamId: string): string {
  return `/activity/${offeringId}/team/${teamId}`;
}

/**
 * Notice deep-link destination: current team space when matched,
 * otherwise the offering queue status (Requirement 13.3).
 */
export function noticeDestination(input: {
  offeringId: string;
  teamId?: string | null;
}): string {
  if (input.teamId) {
    return teamSpacePath(input.offeringId, input.teamId);
  }
  return offeringGatePath(input.offeringId);
}

export function gateApiHref(offeringId: string): string {
  return `/api/calibration/offerings/${offeringId}`;
}

export function checkInApiHref(offeringId: string): string {
  return `/api/calibration/offerings/${offeringId}/checkin`;
}

/** Pre-quorum copy. Denominator is the literal 3. */
export function queueStatusLabel(queueCount: number): string {
  return `${queueCount} of 3 checked in`;
}

/** After check-in: stay on the gate until teamId is set, then enter the team space. */
export function nextLocationAfterCheckIn(
  offeringId: string,
  view: { teamId: string | null }
): string {
  if (view.teamId) {
    return teamSpacePath(offeringId, view.teamId);
  }
  return offeringGatePath(offeringId);
}

/** Opening the gate when already matched lands in the team space (13.3). */
export function landingPathFromGate(
  offeringId: string,
  me: { teamId: string | null }
): string {
  return nextLocationAfterCheckIn(offeringId, me);
}

function readTeamId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function readCheckInView(body: unknown): CheckInView | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.status !== "string" || !record.status.trim()) return null;
  if (typeof record.queueCount !== "number" || !Number.isFinite(record.queueCount)) {
    return null;
  }
  if (record.of !== 3) return null;
  const teamId = readTeamId(record.teamId);
  if (teamId === undefined) return null;
  return {
    status: record.status.trim(),
    queueCount: record.queueCount,
    of: 3,
    teamId,
  };
}

/** Parse POST check-in JSON. 409 duplicate still carries the live queue view. */
export function parseCheckInResponse(
  status: number,
  body: unknown
): ParseResult<{ view: CheckInView }> {
  if (status !== 200 && status !== 409) {
    return { ok: false, error: errorFromBody(body, "Failed to check in") };
  }
  const view = readCheckInView(body);
  if (!view) {
    return { ok: false, error: errorFromBody(body, "Invalid check-in response") };
  }
  return { ok: true, view };
}

/** Parse GET offering gate JSON. Viewing never implies a check-in. */
export function parseGateResponse(
  status: number,
  body: unknown
): ParseResult<{ view: GateView }> {
  if (status !== 200) {
    return { ok: false, error: errorFromBody(body, "Failed to load offering") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid gate response" };
  }
  const offering = (body as { offering?: unknown }).offering;
  const me = (body as { me?: unknown }).me;
  if (!offering || typeof offering !== "object" || Array.isArray(offering)) {
    return { ok: false, error: "Invalid gate response" };
  }
  if (!me || typeof me !== "object" || Array.isArray(me)) {
    return { ok: false, error: "Invalid gate response" };
  }
  const offeringId = (offering as { id?: unknown }).id;
  const title = (offering as { title?: unknown }).title;
  const checkedIn = (me as { checkedIn?: unknown }).checkedIn;
  const queueCount = (me as { queueCount?: unknown }).queueCount;
  const role = (me as { role?: unknown }).role;
  const teamId = readTeamId((me as { teamId?: unknown }).teamId);
  if (typeof offeringId !== "string" || !offeringId.trim()) {
    return { ok: false, error: "Invalid gate response" };
  }
  if (typeof title !== "string") {
    return { ok: false, error: "Invalid gate response" };
  }
  if (typeof checkedIn !== "boolean") {
    return { ok: false, error: "Invalid gate response" };
  }
  if (typeof queueCount !== "number" || !Number.isFinite(queueCount)) {
    return { ok: false, error: "Invalid gate response" };
  }
  if (role !== "operator" && role !== "learner") {
    return { ok: false, error: "Invalid gate response" };
  }
  if (teamId === undefined) {
    return { ok: false, error: "Invalid gate response" };
  }
  return {
    ok: true,
    view: {
      offering: { id: offeringId.trim(), title },
      me: { checkedIn, queueCount, teamId, role },
    },
  };
}
