/**
 * Check-in + queue evaluation that executes team formation (Task 4.3).
 * Session is resolved by route wrappers; these accept userId for testability.
 *
 * formTeam effects have no offeringId — recover it from the check-in set
 * passed to evaluateQueue, then run executeFormation.
 */
import { evaluateQueue } from "@/lib/calibration-engine/engine";
import {
  checkIn,
  getCheckIn,
  getOffering,
  listQueuedCheckIns,
} from "@/lib/calibration-store/store";
import type { CheckInStatus } from "@/lib/calibration-store/types";
import type { ApiError } from "./offerings";
import {
  executeFormation,
  offeringIdFromCheckIns,
  type ExecuteEffectsDeps,
} from "./space";

export type QueueDeps = ExecuteEffectsDeps & {
  now?: Date;
};

export type CheckInView = {
  status: CheckInStatus;
  queueCount: number;
  of: 3;
  teamId: string | null;
};

export type CheckInResult =
  | { ok: true; status: 200; body: CheckInView }
  | { ok: false; status: 409; body: CheckInView & { error: string } }
  | { ok: false; status: number; body: ApiError };

const QUEUE_OF = 3 as const;

function unauthorized(): CheckInResult {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function notFound(message: string): CheckInResult {
  return { ok: false, status: 404, body: { error: message } };
}

function clock(deps?: QueueDeps): Date {
  return deps?.now ?? new Date();
}

export async function queueStatusFor(
  offeringId: string,
  userId: string
): Promise<{
  checkedIn: boolean;
  queueCount: number;
  teamId: string | null;
}> {
  const [mine, queued] = await Promise.all([
    getCheckIn(offeringId, userId),
    listQueuedCheckIns(offeringId),
  ]);
  return {
    checkedIn: mine !== null,
    queueCount: queued.length,
    teamId: mine?.teamId ?? null,
  };
}

async function currentCheckInView(
  offeringId: string,
  userId: string
): Promise<CheckInView> {
  const mine = await getCheckIn(offeringId, userId);
  const queued = await listQueuedCheckIns(offeringId);
  return {
    status: mine?.status ?? "queued",
    queueCount: queued.length,
    of: QUEUE_OF,
    teamId: mine?.teamId ?? null,
  };
}

async function executeQueueFormation(
  offeringId: string,
  now: Date,
  deps?: QueueDeps
): Promise<void> {
  const queued = await listQueuedCheckIns(offeringId);
  const effects = evaluateQueue(queued, now);
  for (const effect of effects) {
    if (effect.kind !== "formTeam") {
      continue;
    }
    const recovered = offeringIdFromCheckIns(queued, effect.memberUserIds);
    await executeFormation(
      effect.memberUserIds,
      now,
      deps,
      recovered ?? offeringId
    );
  }
}

/**
 * Record a learner check-in, evaluate the offering queue, and execute
 * formation effects (team, recap, team_formed notices) when quorum is met.
 * Duplicate active check-ins return 409 with the current queue status.
 */
export async function postCheckIn(
  userId: string | null,
  offeringId: string,
  deps?: QueueDeps
): Promise<CheckInResult> {
  if (!userId) return unauthorized();
  const offering = await getOffering(offeringId);
  if (!offering) {
    return notFound("Offering not found");
  }

  const existing = await getCheckIn(offeringId, userId);
  if (existing) {
    const current = await currentCheckInView(offeringId, userId);
    return {
      ok: false,
      status: 409,
      body: { ...current, error: "Already checked in" },
    };
  }

  const now = clock(deps);
  await checkIn(offeringId, userId, now);
  await executeQueueFormation(offeringId, now, deps);
  return { ok: true, status: 200, body: await currentCheckInView(offeringId, userId) };
}
