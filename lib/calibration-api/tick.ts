/**
 * Cron tick: walk queued check-ins and unfinalized teams (Task 4.6).
 * Authenticated via CRON_SECRET bearer header. Reuses evaluateQueue +
 * executeEffects / executeFormation. Presentation failures never roll back
 * committed queue/team state.
 */
import { evaluateQueue, evaluateTeam } from "@/lib/calibration-engine/engine";
import { createFacilitatorService } from "@/lib/calibration-facilitator/facilitator";
import {
  createNoticeService,
  type NoticeSendResult,
  type NoticeService,
} from "@/lib/calibration-notices/notices";
import {
  expireCheckIn,
  listQueuedCheckIns,
  listTeams,
  recordQueuePing,
} from "@/lib/calibration-store/store";
import type { CheckIn, QueueEffect, Team } from "@/lib/calibration-store/types";
import type { ApiResult } from "./offerings";
import {
  executeEffects,
  executeFormation,
  offeringIdFromCheckIns,
  type ExecuteEffectsDeps,
} from "./space";

export type TickDeps = ExecuteEffectsDeps & {
  now?: Date;
};

export type TickNoticeSummary = {
  sent: number;
  deduped: number;
  failed: number;
};

export type TickSummary = {
  evaluatedTeams: number;
  evaluatedQueues: number;
  effects: number;
  notices: TickNoticeSummary;
};

export type TickResult = ApiResult<TickSummary>;

const defaultFacilitator = createFacilitatorService();
const defaultNotices = createNoticeService();

function unauthorized(): TickResult {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function clock(deps?: TickDeps): Date {
  return deps?.now ?? new Date();
}

function readAuthorization(
  headers: { get(name: string): string | null }
): string | null {
  return headers.get("authorization");
}

function isCronAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) {
    return false;
  }
  return authorization === `Bearer ${secret}`;
}

function isUnfinalized(team: Team): boolean {
  return team.finalizedAt === null && team.state.phase !== "finalized";
}

function tallyNotice(
  summary: TickNoticeSummary,
  result: NoticeSendResult
): void {
  if (result.deduped) {
    summary.deduped += 1;
    return;
  }
  if (result.sent) {
    summary.sent += 1;
    return;
  }
  summary.failed += 1;
}

function countingNotices(
  inner: NoticeService,
  summary: TickNoticeSummary
): NoticeService {
  return {
    async send(spec) {
      try {
        const result = await inner.send(spec);
        tallyNotice(summary, result);
        return result;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[calibration-tick] notice failed (${reason})`);
        const failed: NoticeSendResult = {
          sent: false,
          deduped: false,
          channel: "console",
        };
        tallyNotice(summary, failed);
        return failed;
      }
    },
  };
}

async function executeQueueEffects(
  queued: CheckIn[],
  effects: QueueEffect[],
  now: Date,
  deps: ExecuteEffectsDeps,
  notices: NoticeService
): Promise<number> {
  let executed = 0;
  for (const effect of effects) {
    executed += 1;
    if (effect.kind === "formTeam") {
      const offeringId = offeringIdFromCheckIns(queued, effect.memberUserIds);
      await executeFormation(
        effect.memberUserIds,
        now,
        deps,
        offeringId ?? undefined
      );
      continue;
    }
    if (effect.kind === "expireCheckIn") {
      await expireCheckIn(effect.checkInId);
      continue;
    }
    if (effect.kind === "sendNotice") {
      if (effect.notice.kind === "queue_ping") {
        const row = queued.find(
          (checkIn) =>
            checkIn.userId === effect.notice.userId &&
            checkIn.offeringId === effect.notice.offeringId
        );
        if (row) {
          await recordQueuePing(row.id, now);
        }
      }
      await notices.send(effect.notice);
    }
  }
  return executed;
}

/**
 * Daily (and on-demand) clock evaluation. Missing or wrong CRON_SECRET → 401.
 * Two ticks at the same `now` send no duplicate notices and mark no new absences.
 */
export async function postTick(
  headers: { get(name: string): string | null },
  deps: TickDeps = {}
): Promise<TickResult> {
  if (!isCronAuthorized(readAuthorization(headers))) {
    return unauthorized();
  }

  const now = clock(deps);
  const noticesTally: TickNoticeSummary = { sent: 0, deduped: 0, failed: 0 };
  const notices = countingNotices(deps.notices ?? defaultNotices, noticesTally);
  const executorDeps: ExecuteEffectsDeps = {
    facilitator: deps.facilitator ?? defaultFacilitator,
    notices,
  };

  const queued = await listQueuedCheckIns();
  const queueEffects = evaluateQueue(queued, now);
  const evaluatedQueues = new Set(queued.map((row) => row.offeringId)).size;
  const queueExecuted = await executeQueueEffects(
    queued,
    queueEffects,
    now,
    executorDeps,
    notices
  );

  const teams = (await listTeams()).filter(isUnfinalized);
  let teamEffects = 0;
  for (const team of teams) {
    const evaluated = evaluateTeam(team.state, now);
    teamEffects += evaluated.effects.length;
    if (evaluated.effects.length === 0 && evaluated.state === team.state) {
      continue;
    }
    await executeEffects(
      team.id,
      evaluated.state,
      evaluated.effects,
      now,
      executorDeps
    );
  }

  const body: TickSummary = {
    evaluatedTeams: teams.length,
    evaluatedQueues,
    effects: queueExecuted + teamEffects,
    notices: noticesTally,
  };
  console.log("[calibration-tick]", JSON.stringify(body));
  return { ok: true, status: 200, body };
}
