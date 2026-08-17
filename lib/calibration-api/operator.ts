/**
 * Operator dashboard, read-only team inspect, and manual match (Task 4.5).
 * Viewing never evaluates the engine or reveals scores to members (14.6, 14.7).
 * Manual match reuses executeFormation — the same path as quorum (2.6).
 *
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { getAppById } from "@/lib/app-store/store";
import { resolveUserLabels } from "@/lib/auth/resolve-labels";
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
  updateOfferingFacilitatorKey,
} from "@/lib/calibration-store/store";
import type {
  AbsenceRecord,
  AddendumRecord,
  CheckIn,
  DocSnapshot,
  Offering,
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
  stuck: boolean;
};

export type TeamProgress = {
  teamId: string;
  phase: TeamPhase;
  members: string[];
  lastActivityAt: string;
  autoFinalized: boolean;
};

export type OfferingSetupView = {
  title: string;
  sampleAppId: string;
  sampleBotName: string;
  sampleRubric: string;
  deploymentBrief: string;
  transcriptExcerpt: string;
  aiProvider: string;
  aiModel: string;
  facilitatorKeySource: "bot" | "custom";
};

export type OperatorDashboard = {
  offeringId: string;
  queueCount: number;
  waiters: StuckWaiter[];
  stuckWaiters: StuckWaiter[];
  teams: TeamProgress[];
  labels: Record<string, string>;
  setup: OfferingSetupView;
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
  labels: Record<string, string>;
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

async function offeringSetup(offering: Offering): Promise<OfferingSetupView> {
  let sampleBotName = offering.sampleAppId;
  try {
    const app = await getAppById(offering.sampleAppId, offering.operatorUserId);
    if (app?.name?.trim()) sampleBotName = app.name.trim();
  } catch {
    // Progress still loads if the sample bot is missing.
  }
  return {
    title: offering.title,
    sampleAppId: offering.sampleAppId,
    sampleBotName,
    sampleRubric: offering.sampleRubric,
    deploymentBrief: offering.deploymentBrief,
    transcriptExcerpt: offering.transcriptExcerpt,
    aiProvider: offering.aiProvider,
    aiModel: offering.aiModel,
    facilitatorKeySource: offering.facilitatorApiKey?.trim()
      ? "custom"
      : "bot",
  };
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
 * Offering dashboard: every queued learner (wait duration + 10-day stuck
 * flag), plus every formed team (phase, members, last activity,
 * auto-finalized). Read-only.
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
  const waiters: StuckWaiter[] = queued
    .slice()
    .sort(compareCheckIns)
    .map((checkIn) => ({
      checkInId: checkIn.id,
      userId: checkIn.userId,
      offeringId: checkIn.offeringId,
      waitedMs: nowMs - Date.parse(checkIn.checkedInAt),
      checkedInAt: checkIn.checkedInAt,
      stuck: isStuckWaiter(checkIn, nowMs),
    }));
  const stuckWaiters = waiters.filter((waiter) => waiter.stuck);

  const teams = (await listTeams(offeringId)).map((team) => ({
    teamId: team.id,
    phase: team.state.phase,
    members: team.members.map((member) => member.userId),
    lastActivityAt: team.lastActivityAt,
    autoFinalized: team.autoFinalized,
  }));
  const labels = await resolveUserLabels([
    ...waiters.map((waiter) => waiter.userId),
    ...teams.flatMap((team) => team.members),
  ]);

  return {
    ok: true,
    status: 200,
    body: {
      offeringId,
      queueCount: queued.length,
      waiters,
      stuckWaiters,
      teams,
      labels,
      setup: await offeringSetup(caller.offering),
    },
  };
}

function readFacilitatorKeyPatch(
  body: unknown
): { source: "bot" } | { source: "custom"; apiKey: string } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Facilitator key update requires a source" };
  }
  const record = body as Record<string, unknown>;
  if (record.facilitatorKeySource === "bot") {
    return { source: "bot" };
  }
  if (record.facilitatorKeySource === "custom") {
    if (
      typeof record.facilitatorApiKey !== "string" ||
      !record.facilitatorApiKey.trim()
    ) {
      return { error: "A new API key is required to replace the saved key" };
    }
    return { source: "custom", apiKey: record.facilitatorApiKey.trim() };
  }
  return { error: "Facilitator key update requires a source" };
}

/**
 * Operator-only facilitator key change. Never returns the stored key.
 * `bot` clears the override; `custom` replaces it.
 */
export async function patchOperatorFacilitatorKey(
  userId: string | null,
  offeringId: string,
  body: unknown,
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
  const parsed = readFacilitatorKeyPatch(body);
  if ("error" in parsed) {
    return badRequest(parsed.error);
  }
  await updateOfferingFacilitatorKey(
    offeringId,
    parsed.source === "bot" ? null : parsed.apiKey
  );
  return getOperatorDashboard(userId, offeringId, deps);
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
  const scoreMembers = scores ?? {
    members: [],
    revealedAt: caller.team.scoresRevealedAt,
  };
  const labels = await resolveUserLabels([
    ...caller.team.members.map((member) => member.userId),
    ...scoreMembers.members.map((row) => row.userId),
    ...absences.map((row) => row.userId),
    ...addenda.map((row) => row.userId),
    ...spaceResult.body.messages
      .map((message) => message.authorUserId)
      .filter((id): id is string => typeof id === "string"),
  ]);

  return {
    ok: true,
    status: 200,
    body: {
      role: "operator",
      space: spaceResult.body,
      scores: scoreMembers,
      absences,
      docs: view?.docs ?? [],
      finalDeliverable: {
        finalRubric: caller.team.finalRubric,
        autoFinalized: caller.team.autoFinalized,
        finalizedAt: caller.team.finalizedAt,
        addenda,
      },
      labels,
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
