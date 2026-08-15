/**
 * Runtime self-test for calibration-engine queue rules (Task 2.1).
 * Pure evaluation: synthetic CheckIn[] + clock times → exact QueueEffect[].
 *
 * Run: npx tsx lib/calibration-engine/engine.selftest.ts
 */
import type { CheckIn, QueueEffect } from "../calibration-store/types";
import {
  MS_PER_DAY,
  OPERATOR_STUCK_LISTING_MS,
  QUEUE_EXPIRY_MISSED_PINGS,
  QUEUE_PING_MS,
} from "../calibration-store/types";
import { evaluateQueue } from "./engine";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

const NOW = new Date("2026-08-15T12:00:00.000Z");

function isoMsAgo(ms: number, from: Date = NOW): string {
  return new Date(from.getTime() - ms).toISOString();
}

function checkIn(
  overrides: Partial<CheckIn> & Pick<CheckIn, "id" | "userId">
): CheckIn {
  return {
    offeringId: "off-1",
    status: "queued",
    checkedInAt: NOW.toISOString(),
    lastPingAt: null,
    missedPings: 0,
    teamId: null,
    ...overrides,
  };
}

function ofKind<K extends QueueEffect["kind"]>(
  effects: QueueEffect[],
  kind: K
): Extract<QueueEffect, { kind: K }>[] {
  return effects.filter((effect): effect is Extract<QueueEffect, { kind: K }> => {
    return effect.kind === kind;
  });
}

function formTeamUserIdSets(effects: QueueEffect[]): string[][] {
  return ofKind(effects, "formTeam").map((effect) => [...effect.memberUserIds]);
}

function main(): void {
  assertEqual(QUEUE_PING_MS, 6 * MS_PER_DAY, "queue ping cadence is 6 days");
  assertEqual(QUEUE_EXPIRY_MISSED_PINGS, 2, "expiry is after 2 missed pings");
  assertEqual(
    OPERATOR_STUCK_LISTING_MS,
    10 * MS_PER_DAY,
    "operator stuck listing is 10 days"
  );

  // --- 2.1 / 2.7: 1 or 2 queued never form a team (no solo/pair path) ---
  {
    const one = evaluateQueue([checkIn({ id: "c1", userId: "u1" })], NOW);
    assertEqual(ofKind(one, "formTeam"), [], "1 queued → no formTeam");
    assert(
      one.every((effect) => effect.kind !== "formTeam"),
      "1 queued invents no team of any size"
    );
  }
  {
    const two = evaluateQueue(
      [
        checkIn({ id: "c1", userId: "u1", checkedInAt: isoMsAgo(MS_PER_DAY) }),
        checkIn({ id: "c2", userId: "u2" }),
      ],
      NOW
    );
    assertEqual(ofKind(two, "formTeam"), [], "2 queued → no formTeam");
    assert(
      two.every((effect) => effect.kind !== "formTeam"),
      "2 queued invents no pair team"
    );
  }

  // --- 2.2 / 1.4: 3 queued same offering → one formTeam of those three ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-a",
          userId: "u-a",
          checkedInAt: isoMsAgo(3 * MS_PER_DAY),
        }),
        checkIn({
          id: "c-c",
          userId: "u-c",
          checkedInAt: isoMsAgo(1 * MS_PER_DAY),
        }),
        checkIn({
          id: "c-b",
          userId: "u-b",
          checkedInAt: isoMsAgo(2 * MS_PER_DAY),
        }),
      ],
      NOW
    );
    const teams = ofKind(effects, "formTeam");
    assertEqual(teams.length, 1, "3 queued → exactly one formTeam");
    assertEqual(
      teams[0]?.memberUserIds,
      ["u-a", "u-b", "u-c"],
      "formTeam userIds are the three queued learners in checkedInAt order"
    );
    assertEqual(
      ofKind(effects, "sendNotice"),
      [],
      "fresh quorum of 3 emits no queue notices"
    );
    assertEqual(
      ofKind(effects, "expireCheckIn"),
      [],
      "fresh quorum of 3 expires nobody"
    );
    assertEqual(
      ofKind(effects, "listForOperator"),
      [],
      "fresh quorum of 3 lists nobody for the operator"
    );
  }

  // --- 2.2 / 2.7: 4 queued → first 3 by checkedInAt; leftover stays queued ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c4",
          userId: "u4",
          checkedInAt: isoMsAgo(1 * MS_PER_DAY),
        }),
        checkIn({
          id: "c1",
          userId: "u1",
          checkedInAt: isoMsAgo(4 * MS_PER_DAY),
        }),
        checkIn({
          id: "c2",
          userId: "u2",
          checkedInAt: isoMsAgo(3 * MS_PER_DAY),
        }),
        checkIn({
          id: "c3",
          userId: "u3",
          checkedInAt: isoMsAgo(2 * MS_PER_DAY),
        }),
      ],
      NOW
    );
    const teams = ofKind(effects, "formTeam");
    assertEqual(teams.length, 1, "4 queued → one team of 3");
    assertEqual(
      teams[0]?.memberUserIds,
      ["u1", "u2", "u3"],
      "4 queued → earliest three by checkedInAt; leftover u4 stays queued"
    );
  }

  // --- 2.2: 6 queued → two teams of 3 (groups of 3 by checkedInAt) ---
  {
    const effects = evaluateQueue(
      [
        checkIn({ id: "c1", userId: "u1", checkedInAt: isoMsAgo(6 * MS_PER_DAY) }),
        checkIn({ id: "c2", userId: "u2", checkedInAt: isoMsAgo(5 * MS_PER_DAY) }),
        checkIn({ id: "c3", userId: "u3", checkedInAt: isoMsAgo(4 * MS_PER_DAY) }),
        checkIn({ id: "c4", userId: "u4", checkedInAt: isoMsAgo(3 * MS_PER_DAY) }),
        checkIn({ id: "c5", userId: "u5", checkedInAt: isoMsAgo(2 * MS_PER_DAY) }),
        checkIn({ id: "c6", userId: "u6", checkedInAt: isoMsAgo(1 * MS_PER_DAY) }),
      ],
      NOW
    );
    assertEqual(formTeamUserIdSets(effects), [
      ["u1", "u2", "u3"],
      ["u4", "u5", "u6"],
    ], "6 queued → two formTeam groups of 3 in checkedInAt order");
  }

  // --- 2.7: 5 queued → one team of 3; leftover pair never forms ---
  {
    const effects = evaluateQueue(
      [
        checkIn({ id: "c1", userId: "u1", checkedInAt: isoMsAgo(5 * MS_PER_DAY) }),
        checkIn({ id: "c2", userId: "u2", checkedInAt: isoMsAgo(4 * MS_PER_DAY) }),
        checkIn({ id: "c3", userId: "u3", checkedInAt: isoMsAgo(3 * MS_PER_DAY) }),
        checkIn({ id: "c4", userId: "u4", checkedInAt: isoMsAgo(2 * MS_PER_DAY) }),
        checkIn({ id: "c5", userId: "u5", checkedInAt: isoMsAgo(1 * MS_PER_DAY) }),
      ],
      NOW
    );
    const teams = ofKind(effects, "formTeam");
    assertEqual(teams.length, 1, "5 queued → one formTeam only");
    assertEqual(
      teams[0]?.memberUserIds,
      ["u1", "u2", "u3"],
      "5 queued leftover pair is not a team"
    );
    assert(
      teams.every((team) => team.memberUserIds.length === 3),
      "every formTeam is exactly 3 members"
    );
  }

  // --- 1.4: matching is course-wide per offering; never across offerings ---
  {
    const mixed = evaluateQueue(
      [
        checkIn({ id: "a1", userId: "ua1", offeringId: "off-A" }),
        checkIn({ id: "a2", userId: "ua2", offeringId: "off-A" }),
        checkIn({ id: "b1", userId: "ub1", offeringId: "off-B" }),
        checkIn({ id: "b2", userId: "ub2", offeringId: "off-B" }),
      ],
      NOW
    );
    assertEqual(
      ofKind(mixed, "formTeam"),
      [],
      "2+2 across offerings → no formTeam (course-wide per offering only)"
    );
  }
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "a1",
          userId: "ua1",
          offeringId: "off-A",
          checkedInAt: isoMsAgo(3 * MS_PER_DAY),
        }),
        checkIn({
          id: "a2",
          userId: "ua2",
          offeringId: "off-A",
          checkedInAt: isoMsAgo(2 * MS_PER_DAY),
        }),
        checkIn({
          id: "a3",
          userId: "ua3",
          offeringId: "off-A",
          checkedInAt: isoMsAgo(1 * MS_PER_DAY),
        }),
        checkIn({ id: "b1", userId: "ub1", offeringId: "off-B" }),
        checkIn({ id: "b2", userId: "ub2", offeringId: "off-B" }),
      ],
      NOW
    );
    const teams = ofKind(effects, "formTeam");
    assertEqual(teams.length, 1, "3 in off-A + 2 in off-B → one team");
    assertEqual(
      teams[0]?.memberUserIds,
      ["ua1", "ua2", "ua3"],
      "team is the three same-offering learners; other offering is unused"
    );
  }

  // --- matched / expired do not count toward quorum ---
  {
    const effects = evaluateQueue(
      [
        checkIn({ id: "q1", userId: "uq1" }),
        checkIn({ id: "q2", userId: "uq2" }),
        checkIn({
          id: "m1",
          userId: "um1",
          status: "matched",
          teamId: "team-1",
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "formTeam"),
      [],
      "2 queued + 1 matched → no formTeam"
    );
  }

  // --- 2.3: ping due after 6 days since checkedInAt ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-ping",
          userId: "u-ping",
          checkedInAt: isoMsAgo(QUEUE_PING_MS),
        }),
      ],
      NOW
    );
    const notices = ofKind(effects, "sendNotice");
    assertEqual(notices.length, 1, "6 days since check-in → one queue_ping");
    assertEqual(notices[0]?.notice.kind, "queue_ping", "notice kind is queue_ping");
    assertEqual(notices[0]?.notice.userId, "u-ping", "ping targets the waiter");
    assertEqual(
      notices[0]?.notice.offeringId,
      "off-1",
      "ping notice carries offeringId"
    );
    assertEqual(
      notices[0]?.notice.dedupeKey,
      "off-1:u-ping:queue_ping:1",
      "ping dedupeKey is offering:user:queue_ping:pingIndex"
    );
    assertEqual(
      notices[0]?.notice.deepLink,
      "/activity/off-1",
      "ping deepLink is the offering queue status"
    );
    assertEqual(ofKind(effects, "formTeam"), [], "solo ping waiter forms no team");
    assertEqual(
      ofKind(effects, "expireCheckIn"),
      [],
      "first ping does not expire"
    );
    assertEqual(
      ofKind(effects, "listForOperator"),
      [],
      "6-day waiter is not yet operator-listed"
    );
  }

  // --- 2.3: ping due after 6 days since lastPingAt (checkedInAt older) ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-reping",
          userId: "u-reping",
          checkedInAt: isoMsAgo(8 * MS_PER_DAY),
          lastPingAt: isoMsAgo(QUEUE_PING_MS),
          missedPings: 1,
        }),
      ],
      NOW
    );
    const pings = ofKind(effects, "sendNotice").filter(
      (effect) => effect.notice.kind === "queue_ping"
    );
    assertEqual(pings.length, 1, "6 days since lastPingAt → second queue_ping");
    assertEqual(
      pings[0]?.notice.dedupeKey,
      "off-1:u-reping:queue_ping:2",
      "second ping uses pingIndex 2"
    );
    assertEqual(
      ofKind(effects, "expireCheckIn"),
      [],
      "missedPings 1 with a due ping does not expire yet"
    );
  }

  // --- 2.3: ping not due before 6 days ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-early",
          userId: "u-early",
          checkedInAt: isoMsAgo(QUEUE_PING_MS - 1),
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "sendNotice"),
      [],
      "just under 6 days → no queue_ping"
    );
  }

  // --- 2.3: recent lastPingAt suppresses ping even if checkedInAt is old ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-recent-ping",
          userId: "u-recent-ping",
          checkedInAt: isoMsAgo(8 * MS_PER_DAY),
          lastPingAt: isoMsAgo(MS_PER_DAY),
          missedPings: 1,
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "sendNotice").filter(
        (effect) => effect.notice.kind === "queue_ping"
      ),
      [],
      "lastPingAt within 6 days → no queue_ping"
    );
  }

  // --- 2.4: 2 missed pings → expireCheckIn + queue_expired ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-exp",
          userId: "u-exp",
          checkedInAt: isoMsAgo(12 * MS_PER_DAY),
          lastPingAt: isoMsAgo(QUEUE_PING_MS),
          missedPings: QUEUE_EXPIRY_MISSED_PINGS,
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "expireCheckIn"),
      [{ kind: "expireCheckIn", checkInId: "c-exp" }],
      "2 missed pings → expireCheckIn"
    );
    const expiredNotices = ofKind(effects, "sendNotice").filter(
      (effect) => effect.notice.kind === "queue_expired"
    );
    assertEqual(expiredNotices.length, 1, "2 missed pings → queue_expired notice");
    assertEqual(
      expiredNotices[0]?.notice.userId,
      "u-exp",
      "expiry notice targets the expired learner"
    );
    assertEqual(
      expiredNotices[0]?.notice.dedupeKey,
      "off-1:u-exp:queue_expired",
      "expiry dedupeKey is offering:user:queue_expired"
    );
    assertEqual(
      expiredNotices[0]?.notice.deepLink,
      "/activity/off-1",
      "expiry deepLink is the offering queue status"
    );
    assertEqual(
      expiredNotices[0]?.notice.offeringId,
      "off-1",
      "expiry notice carries offeringId"
    );
    assertEqual(
      ofKind(effects, "sendNotice").filter(
        (effect) => effect.notice.kind === "queue_ping"
      ),
      [],
      "expiring check-in does not also get a re-confirmation ping"
    );
    assertEqual(
      ofKind(effects, "listForOperator"),
      [],
      "expiring check-in is not listed as a stuck waiter"
    );
    assertEqual(ofKind(effects, "formTeam"), [], "expired solo forms no team");
  }

  // --- 2.4 + 2.7: expiring a third leaves a pair unmatched ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-keep-1",
          userId: "u-keep-1",
          checkedInAt: isoMsAgo(2 * MS_PER_DAY),
        }),
        checkIn({
          id: "c-keep-2",
          userId: "u-keep-2",
          checkedInAt: isoMsAgo(1 * MS_PER_DAY),
        }),
        checkIn({
          id: "c-drop",
          userId: "u-drop",
          checkedInAt: isoMsAgo(12 * MS_PER_DAY),
          missedPings: QUEUE_EXPIRY_MISSED_PINGS,
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "expireCheckIn").map((effect) => effect.checkInId),
      ["c-drop"],
      "only the 2-miss waiter expires"
    );
    assertEqual(
      ofKind(effects, "formTeam"),
      [],
      "remaining pair after expiry never forms a team"
    );
  }

  // --- 2.5: waited 10 days unmatched → listForOperator ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-stuck",
          userId: "u-stuck",
          checkedInAt: isoMsAgo(OPERATOR_STUCK_LISTING_MS),
          lastPingAt: isoMsAgo(MS_PER_DAY),
          missedPings: 1,
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "listForOperator"),
      [{ kind: "listForOperator", checkInId: "c-stuck" }],
      "10-day unmatched waiter → listForOperator"
    );
    assertEqual(
      ofKind(effects, "formTeam"),
      [],
      "solo 10-day waiter forms no team"
    );
    assertEqual(
      ofKind(effects, "expireCheckIn"),
      [],
      "10-day waiter with 1 missed ping is not expired"
    );
  }

  // --- 2.5: just under 10 days is not listed ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-not-stuck",
          userId: "u-not-stuck",
          checkedInAt: isoMsAgo(OPERATOR_STUCK_LISTING_MS - 1),
          lastPingAt: isoMsAgo(MS_PER_DAY),
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "listForOperator"),
      [],
      "just under 10 days → not listed for operator"
    );
  }

  // --- 2.5 + 2.3: 10-day waiter with no lastPingAt also gets a ping ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "c-both",
          userId: "u-both",
          checkedInAt: isoMsAgo(OPERATOR_STUCK_LISTING_MS),
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "listForOperator").map((effect) => effect.checkInId),
      ["c-both"],
      "10-day waiter is listed"
    );
    const pings = ofKind(effects, "sendNotice").filter(
      (effect) => effect.notice.kind === "queue_ping"
    );
    assertEqual(pings.length, 1, "10-day waiter with no lastPingAt also gets ping");
    assertEqual(
      pings[0]?.notice.dedupeKey,
      "off-1:u-both:queue_ping:1",
      "combined ping uses pingIndex 1"
    );
  }

  // --- forming a team suppresses ping / expiry / stuck listing for members ---
  {
    const effects = evaluateQueue(
      [
        checkIn({
          id: "old-1",
          userId: "old-1",
          checkedInAt: isoMsAgo(OPERATOR_STUCK_LISTING_MS),
        }),
        checkIn({
          id: "old-2",
          userId: "old-2",
          checkedInAt: isoMsAgo(OPERATOR_STUCK_LISTING_MS - MS_PER_DAY),
        }),
        checkIn({
          id: "old-3",
          userId: "old-3",
          checkedInAt: isoMsAgo(OPERATOR_STUCK_LISTING_MS - 2 * MS_PER_DAY),
        }),
        checkIn({
          id: "fresh",
          userId: "fresh",
          checkedInAt: NOW.toISOString(),
        }),
      ],
      NOW
    );
    assertEqual(
      ofKind(effects, "formTeam")[0]?.memberUserIds,
      ["old-1", "old-2", "old-3"],
      "oldest three form the team even if they waited 10 days"
    );
    assertEqual(
      ofKind(effects, "listForOperator"),
      [],
      "learners who form a team are not listed as stuck"
    );
    assertEqual(
      ofKind(effects, "sendNotice"),
      [],
      "learners who form a team do not get queue pings"
    );
    assertEqual(
      ofKind(effects, "expireCheckIn"),
      [],
      "learners who form a team are not expired"
    );
  }

  // --- purity: same inputs → same effects ---
  {
    const input = [
      checkIn({
        id: "c-pure",
        userId: "u-pure",
        checkedInAt: isoMsAgo(QUEUE_PING_MS),
      }),
    ];
    assertEqual(
      evaluateQueue(input, NOW),
      evaluateQueue(input, NOW),
      "evaluateQueue is deterministic for the same check-ins and clock"
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("engine.selftest: all assertions passed");
}

main();
