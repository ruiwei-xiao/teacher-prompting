/**
 * Pure calibration engine. Task 2.1: evaluateQueue only.
 * No I/O. Imports types/constants from calibration-store/types — never store.ts.
 */
import type { CheckIn, NoticeSpec, QueueEffect } from "../calibration-store/types";
import {
  OPERATOR_STUCK_LISTING_MS,
  QUEUE_EXPIRY_MISSED_PINGS,
  QUEUE_PING_MS,
} from "../calibration-store/types";

const QUEUE_STATUS_DEEP_LINK = (offeringId: string) =>
  `/activity/${offeringId}`;

function compareCheckIns(a: CheckIn, b: CheckIn): number {
  if (a.checkedInAt !== b.checkedInAt) {
    return a.checkedInAt < b.checkedInAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
}

function isQueued(checkIn: CheckIn): boolean {
  return checkIn.status === "queued";
}

function isExpiring(checkIn: CheckIn): boolean {
  return checkIn.missedPings >= QUEUE_EXPIRY_MISSED_PINGS;
}

function pingAnchorMs(checkIn: CheckIn): number {
  return Date.parse(checkIn.lastPingAt ?? checkIn.checkedInAt);
}

function isPingDue(checkIn: CheckIn, nowMs: number): boolean {
  return nowMs - pingAnchorMs(checkIn) >= QUEUE_PING_MS;
}

function isStuckWaiter(checkIn: CheckIn, nowMs: number): boolean {
  return nowMs - Date.parse(checkIn.checkedInAt) >= OPERATOR_STUCK_LISTING_MS;
}

function queueNotice(
  checkIn: CheckIn,
  kind: "queue_ping" | "queue_expired",
  pingIndex?: number
): QueueEffect {
  const dedupeKey =
    kind === "queue_ping"
      ? `${checkIn.offeringId}:${checkIn.userId}:queue_ping:${pingIndex}`
      : `${checkIn.offeringId}:${checkIn.userId}:queue_expired`;
  const notice: NoticeSpec = {
    kind,
    userId: checkIn.userId,
    dedupeKey,
    deepLink: QUEUE_STATUS_DEEP_LINK(checkIn.offeringId),
    offeringId: checkIn.offeringId,
  };
  return { kind: "sendNotice", notice };
}

function groupByOffering(checkIns: CheckIn[]): Map<string, CheckIn[]> {
  const groups = new Map<string, CheckIn[]>();
  for (const checkIn of checkIns) {
    const existing = groups.get(checkIn.offeringId);
    if (existing) {
      existing.push(checkIn);
    } else {
      groups.set(checkIn.offeringId, [checkIn]);
    }
  }
  return groups;
}

/**
 * Course-wide queue evaluation for an offering-scoped (or mixed) check-in set.
 * Forms teams of exactly 3, emits 6-day re-confirmation pings, expires after
 * 2 missed pings, and surfaces 10-day unmatched waiters. No solo/pair path.
 */
export function evaluateQueue(checkIns: CheckIn[], now: Date): QueueEffect[] {
  const nowMs = now.getTime();
  const queued = checkIns.filter(isQueued);
  const effects: QueueEffect[] = [];

  const expiring = queued.filter(isExpiring).sort(compareCheckIns);
  for (const checkIn of expiring) {
    effects.push({ kind: "expireCheckIn", checkInId: checkIn.id });
    effects.push(queueNotice(checkIn, "queue_expired"));
  }

  const active = queued.filter((checkIn) => !isExpiring(checkIn));
  const leftovers: CheckIn[] = [];
  const byOffering = groupByOffering(active);
  const offeringIds = [...byOffering.keys()].sort();

  for (const offeringId of offeringIds) {
    const members = (byOffering.get(offeringId) ?? []).sort(compareCheckIns);
    let index = 0;
    while (index + 3 <= members.length) {
      const trio = members.slice(index, index + 3);
      effects.push({
        kind: "formTeam",
        memberUserIds: [trio[0].userId, trio[1].userId, trio[2].userId],
      });
      index += 3;
    }
    leftovers.push(...members.slice(index));
  }

  leftovers.sort(compareCheckIns);
  for (const checkIn of leftovers) {
    if (isPingDue(checkIn, nowMs)) {
      effects.push(queueNotice(checkIn, "queue_ping", checkIn.missedPings + 1));
    }
    if (isStuckWaiter(checkIn, nowMs)) {
      effects.push({ kind: "listForOperator", checkInId: checkIn.id });
    }
  }

  return effects;
}
