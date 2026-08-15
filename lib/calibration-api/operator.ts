/**
 * Operator dashboard, read-only team inspect, and manual match (Task 4.5).
 * Viewing never evaluates the engine or reveals scores to members (14.6, 14.7).
 * Manual match reuses executeFormation — the same path as quorum (2.6).
 *
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { resolveCaller } from "./access";
import type { ApiResult } from "./offerings";
import {
  executeFormation,
  getSpace,
  type SpaceDeps,
  type SpaceState,
} from "./space";
import {
  getScoresForOperator,
  getTeam,
  getTeamForMember,
  listAbsences,
  listAddenda,
  listQueuedCheckIns,
  listTeams,
} from "@/lib/calibration-store/store";
import type {
  AbsenceRecord,
  AddendumRecord,
  CheckIn,
  DocSnapshot,
  OperatorScoreView,
  Team,
  TeamPhase,
} from "@/lib/calibration-store/types";
import { OPERATOR_STUCK_LISTING_MS } from "@/lib/calibration-store/types";

export type OperatorDeps = SpaceDeps;

export type StuckWaiter = {
  checkInId: string;
  userId: string;
  offeringId: string;
  waitedMs: number;
  checkedInAt: string;
};

export type TeamProgress = {
  teamId: string;
  phase: TeamPhase;
  members: string[];
  lastActivityAt: string;
  autoFinalized: boolean;
};

export type OperatorDashboard = {
  offeringId: string;
  stuckWaiters: StuckWaiter[];
  teams: TeamProgress[];
};

export type FinalDeliverableView = {
  finalRubric: string | null;
  autoFinalized: boolean;
  finalizedAt: string | null;
  addenda: AddendumRecord[];
};

export type OperatorTeamInspect = {
  role: "operator";
  space: SpaceState;
  scores: OperatorScoreView;
  absences: AbsenceRecord[];
  docs: DocSnapshot[];
  finalDeliverable: FinalDeliverableView;
};

export type ManualMatchView = {
  team: Team;
};

function unauthorized<T = never>(): ApiResult<T> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function forbidden(): ApiResult<never> {
  return { ok: false, status: 403, body: { error: "Forbidden" } };
}

function notFound(message: string): ApiResult<never> {
  return { ok: false, status: 404, body: { error: message } };
}

function badRequest(message: string): ApiResult<never> {
  return { ok: false, status: 400, body: { error: message } };
}

function clock(deps?: OperatorDeps): Date {
  return deps?.now ?? new Date();
}

function compareCheckIns(left: CheckIn, right: CheckIn): number {
  if (left.checkedInAt !== right.checkedInAt) {
    return left.checkedInAt < right.checkedInAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : 1;
}

function isStuckWaiter(checkIn: CheckIn, nowMs: number): boolean {
  return nowMs - Date.parse(checkIn.checkedInAt) >= OPERATOR_STUCK_LISTING_MS;
}

function readMatchUserIds(body: unknown): [string, string, string] | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Manual match requires exactly three distinct queued learners" };
  }
  const raw = (body as Record<string, unknown>).userIds;
  if (!Array.isArray(raw) || raw.length !== 3) {
    return { error: "Manual match requires exactly three distinct queued learners" };
  }
  const userIds: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || value.trim() === "") {
      return { error: "Manual match requires exactly three distinct queued learners" };
    }
    userIds.push(value.trim());
  }
  if (new Set(userIds).size !== 3) {
    return { error: "Manual match requires exactly three distinct queued learners" };
  }
  return [userIds[0]!, userIds[1]!, userIds[2]!];
}

/**
 * Offering dashboard: 10-day stuck waiters with wait duration, plus every
 * formed team (phase, members, last activity, auto-finalized). Read-only.
 */
export async function getOperatorDashboard(
  userId: string | null,
  offeringId: string,
  deps?: OperatorDeps
): Promise<ApiResult<OperatorDashboard>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { offeringId });
  if (caller.role === "not_found") {
    return notFound("Offering not found");
  }
  if (caller.role !== "operator") {
    return forbidden();
  }

  const now = clock(deps);
  const nowMs = now.getTime();
  const queued = await listQueuedCheckIns(offeringId);
  const stuckWaiters: StuckWaiter[] = queued
    .filter((checkIn) => isStuckWaiter(checkIn, nowMs))
    .sort(compareCheckIns)
    .map((checkIn) => ({
      checkInId: checkIn.id,
      userId: checkIn.userId,
      offeringId: checkIn.offeringId,
      waitedMs: nowMs - Date.parse(checkIn.checkedInAt),
      checkedInAt: checkIn.checkedInAt,
    }));

  const teams = (await listTeams(offeringId)).map((team) => ({
    teamId: team.id,
    phase: team.state.phase,
    members: team.members.map((member) => member.userId),
    lastActivityAt: team.lastActivityAt,
    autoFinalized: team.autoFinalized,
  }));

  return {
    ok: true,
    status: 200,
    body: {
      offeringId,
      stuckWaiters,
      teams,
    },
  };
}

/**
 * Full read-only team inspect. Uses getSpace as operator (serialize-only,
 * no evaluate) plus getScoresForOperator. Never mutates reveal or clocks.
 */
export async function inspectTeam(
  userId: string | null,
  teamId: string,
  deps?: OperatorDeps
): Promise<ApiResult<OperatorTeamInspect>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role !== "operator") {
    return forbidden();
  }
  if (!caller.team) {
    return notFound("Team not found");
  }

  const spaceResult = await getSpace(userId, teamId, deps);
  if (!spaceResult.ok) {
    return spaceResult;
  }

  const [scores, absences, addenda] = await Promise.all([
    getScoresForOperator(teamId),
    listAbsences(teamId),
    listAddenda(teamId),
  ]);
  const memberId = caller.team.members[0]?.userId;
  const view = memberId ? await getTeamForMember(teamId, memberId) : null;

  return {
    ok: true,
    status: 200,
    body: {
      role: "operator",
      space: spaceResult.body,
      scores: scores ?? { members: [], revealedAt: caller.team.scoresRevealedAt },
      absences,
      docs: view?.docs ?? [],
      finalDeliverable: {
        finalRubric: caller.team.finalRubric,
        autoFinalized: caller.team.autoFinalized,
        finalizedAt: caller.team.finalizedAt,
        addenda,
      },
    },
  };
}

/**
 * Operator manual match. Validates exactly three distinct queued learners of
 * this offering, then reuses executeFormation (same notices/recap as quorum).
 */
export async function postManualMatch(
  userId: string | null,
  offeringId: string,
  body: unknown,
  deps?: OperatorDeps
): Promise<ApiResult<ManualMatchView>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { offeringId });
  if (caller.role === "not_found") {
    return notFound("Offering not found");
  }
  if (caller.role !== "operator") {
    return forbidden();
  }

  const parsed = readMatchUserIds(body);
  if (!Array.isArray(parsed)) {
    return badRequest(parsed.error);
  }

  const queued = await listQueuedCheckIns(offeringId);
  const byUser = new Map(queued.map((checkIn) => [checkIn.userId, checkIn]));
  if (!parsed.every((id) => byUser.has(id))) {
    return badRequest(
      "Manual match requires exactly three distinct queued learners"
    );
  }

  const trio = parsed
    .map((id) => byUser.get(id)!)
    .sort(compareCheckIns);
  const memberUserIds: [string, string, string] = [
    trio[0]!.userId,
    trio[1]!.userId,
    trio[2]!.userId,
  ];

  const formed = await executeFormation(
    memberUserIds,
    clock(deps),
    deps,
    offeringId
  );
  const team = await getTeam(formed.teamId);
  if (!team) {
    return notFound("Team not found");
  }
  return { ok: true, status: 200, body: { team } };
}
