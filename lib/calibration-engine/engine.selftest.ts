/**
 * Runtime self-test for calibration-engine queue (Task 2.1) and
 * critique rotation (Task 2.2). Pure evaluation only.
 *
 * Run: npx tsx lib/calibration-engine/engine.selftest.ts
 */
import type {
  CheckIn,
  EngineEffect,
  EngineResult,
  QueueEffect,
  TeamStateRecord,
} from "../calibration-store/types";
import {
  CRITIQUE_DEADLINE_MS,
  GROUP_SILENCE_MS,
  MS_PER_DAY,
  MS_PER_HOUR,
  OPERATOR_STUCK_LISTING_MS,
  QUEUE_EXPIRY_MISSED_PINGS,
  QUEUE_PING_MS,
} from "../calibration-store/types";
import {
  applyLearnerEvent,
  evaluateQueue,
  evaluateTeam,
  getCritiqueRoles,
  markAbsent,
  startTeam,
} from "./engine";

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

function ofEngineKind<K extends EngineEffect["kind"]>(
  effects: EngineEffect[],
  kind: K
): Extract<EngineEffect, { kind: K }>[] {
  return effects.filter((effect): effect is Extract<EngineEffect, { kind: K }> => {
    return effect.kind === kind;
  });
}

function facilitatorKeys(effects: EngineEffect[]): string[] {
  return ofEngineKind(effects, "postFacilitator").map((effect) => effect.message.key);
}

function noticeKinds(effects: EngineEffect[]): string[] {
  return ofEngineKind(effects, "sendNotice").map((effect) => effect.notice.kind);
}

const TEAM_MEMBERS: [string, string, string] = ["u-alice", "u-bob", "u-cara"];

function deadlineOf(
  state: TeamStateRecord,
  userId: string
): string | undefined {
  return state.perPersonDeadlines.find((deadline) => deadline.userId === userId)
    ?.deadlineAt;
}

function completeRound(
  state: TeamStateRecord,
  presenterUserId: string,
  criticUserIds: string[],
  now: Date
): EngineResult {
  let result = applyLearnerEvent(
    state,
    { kind: "message", userId: presenterUserId, body: `${presenterUserId} critique` },
    now
  );
  for (const criticUserId of criticUserIds) {
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: criticUserId, body: `${criticUserId} response` },
      now
    );
  }
  return result;
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

  // ========================================================================
  // Task 2.2 — kickoff + rotating critique rounds (5.2, 5.3, 6.1–6.5, 15.2)
  // ========================================================================

  const expectedDeadline = new Date(NOW.getTime() + CRITIQUE_DEADLINE_MS).toISOString();

  // --- 5.2 / 5.3 / 6.2: startTeam opens critique round 1 immediately ---
  {
    const { state, effects } = startTeam(TEAM_MEMBERS, NOW);
    assertEqual(state.phase, "critique", "startTeam phase is critique (no kickoff phase)");
    assertEqual(state.round, 1, "startTeam opens round 1");
    assertEqual(state.presenterIndex, 0, "startTeam presenterIndex is 0");
    assertEqual(state.groupDeadline, null, "critique does not start a group clock");

    const roles = getCritiqueRoles(state);
    assertEqual(roles.presenterUserId, "u-alice", "round 1 presenter is first member");
    assertEqual(
      roles.criticUserIds,
      ["u-bob", "u-cara"],
      "round 1 critics are the other two members"
    );
    assertEqual(roles.criticUserIds.length, 2, "exactly two Critics (15.2)");
    assert(
      !("facilitator" in roles) && !("moderator" in roles) && !("scribe" in roles),
      "no invented learner roles beyond Presenter and Critic (15.2)"
    );

    const keys = facilitatorKeys(effects);
    assert(keys.includes("kickoff_recap"), "formation posts a recap (5.2)");
    assert(keys.includes("presenter_announcement"), "formation announces the Presenter (6.2)");
    assert(keys.includes("presenter_prompt"), "formation prompts the Presenter to share (6.2)");

    const formed = ofEngineKind(effects, "sendNotice").filter(
      (effect) => effect.notice.kind === "team_formed"
    );
    assertEqual(formed.length, 3, "formation sends team_formed to all three members");
    assertEqual(
      formed.map((effect) => effect.notice.userId),
      TEAM_MEMBERS,
      "team_formed notices follow member order"
    );
    assert(
      new Set(formed.map((effect) => effect.notice.dedupeKey)).size === 3,
      "each team_formed notice has a unique dedupeKey"
    );

    assertEqual(
      state.perPersonDeadlines.length,
      3,
      "round 1 sets a per-person clock for every member"
    );
    assert(
      state.perPersonDeadlines.every(
        (deadline) =>
          deadline.stepKey === "critique:1" && deadline.deadlineAt === expectedDeadline
      ),
      "kickoff non-response falls to the 48h critique-round clock (5.3)"
    );
    assertEqual(
      state.perPersonDeadlines.map((deadline) => deadline.userId),
      TEAM_MEMBERS,
      "per-person deadlines keep member order"
    );
  }

  // --- 6.3 / 6.4: presenter share then two critic responses → revoice + rotate ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    const firstPresenter = getCritiqueRoles(result.state).presenterUserId;

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice individual critique" },
      NOW
    );
    assertEqual(result.state.round, 1, "presenter share stays on round 1");
    assertEqual(result.state.presenterIndex, 0, "presenter share does not rotate yet");
    assert(
      facilitatorKeys(result.effects).includes("critic_prompt"),
      "after presenter share, critics are prompted (6.3)"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "bob agrees with reasoning" },
      NOW
    );
    assertEqual(result.state.round, 1, "one critic response does not complete the round");

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-cara", body: "cara disagrees with reasoning" },
      NOW
    );
    assertEqual(result.state.round, 2, "two critic responses rotate to round 2");
    assert(
      result.state.presenterIndex !== 0,
      "round 2 has a different presenterIndex than round 1"
    );

    const revoices = ofEngineKind(result.effects, "postFacilitator").filter(
      (effect) => effect.message.key === "revoice"
    );
    assertEqual(revoices.length, 1, "round completion emits one revoice (6.4)");
    assert(
      revoices[0]?.message.source === "llm" || revoices[0]?.message.source === "scripted",
      "revoice is postFacilitator with source llm or scripted"
    );

    const nextRoles = getCritiqueRoles(result.state);
    assert(nextRoles.presenterUserId !== firstPresenter, "round 2 presenter is a different member");
    assertEqual(nextRoles.presenterUserId, "u-bob", "rotation advances to the next unused member");
    assertEqual(
      nextRoles.criticUserIds,
      ["u-alice", "u-cara"],
      "round 2 critics are the other two members"
    );
    assert(
      facilitatorKeys(result.effects).includes("presenter_announcement"),
      "rotation announces the next Presenter"
    );
    assert(
      facilitatorKeys(result.effects).includes("presenter_prompt"),
      "rotation prompts the next Presenter"
    );
    assert(
      result.state.perPersonDeadlines.every(
        (deadline) =>
          deadline.stepKey === "critique:2" && deadline.deadlineAt === expectedDeadline
      ),
      "round 2 resets per-person clocks to critique:2 + 48h"
    );
  }

  // --- 6.1 / 6.5: after 3 complete rounds, each member was Presenter once ---
  {
    const presenters: string[] = [];
    const criticCounts: Record<string, number> = {
      "u-alice": 0,
      "u-bob": 0,
      "u-cara": 0,
    };

    let result = startTeam(TEAM_MEMBERS, NOW);
    for (let round = 1; round <= 3; round += 1) {
      const roles = getCritiqueRoles(result.state);
      presenters.push(roles.presenterUserId);
      for (const criticUserId of roles.criticUserIds) {
        criticCounts[criticUserId] = (criticCounts[criticUserId] ?? 0) + 1;
      }
      assertEqual(result.state.round, round, `before completing, engine is on round ${round}`);
      assertEqual(roles.criticUserIds.length, 2, `round ${round} has exactly two Critics`);
      result = completeRound(result.state, roles.presenterUserId, roles.criticUserIds, NOW);
    }

    assertEqual(presenters.length, 3, "exactly three critique rounds ran (6.1)");
    assertEqual(
      [...presenters].sort(),
      [...TEAM_MEMBERS].sort(),
      "each member was Presenter once (6.5)"
    );
    assertEqual(new Set(presenters).size, 3, "no member presented twice");
    assertEqual(criticCounts["u-alice"], 2, "alice was Critic twice");
    assertEqual(criticCounts["u-bob"], 2, "bob was Critic twice");
    assertEqual(criticCounts["u-cara"], 2, "cara was Critic twice");
    assertEqual(result.state.phase, "merge", "rotation complete opens merge (no 4th critique round)");
    assertEqual(result.state.round, 3, "completed rotation stays on round 3");
  }

  // --- 6.5: skipped presenter counts as absent; next presenter is unused, not a replay ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    assertEqual(
      getCritiqueRoles(result.state).presenterUserId,
      "u-alice",
      "skip case starts with alice as presenter"
    );

    result = markAbsent(result.state, "u-alice", NOW);
    assert(
      result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-alice" && entry.stepKey === "critique:1"
      ),
      "skipped presenter is recorded absent for this round only"
    );
    assertEqual(
      ofEngineKind(result.effects, "markAbsent"),
      [{ kind: "markAbsent", userId: "u-alice", stepKey: "critique:1" }],
      "skip emits markAbsent for the presenter and current step"
    );
    assertEqual(result.state.round, 1, "presenter skip does not replay or jump the round");
    assert(
      facilitatorKeys(result.effects).includes("critic_prompt"),
      "after presenter skip, remaining members are prompted as critics"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "bob continues without alice" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-cara", body: "cara continues without alice" },
      NOW
    );

    assertEqual(result.state.round, 2, "round 1 completes with the remaining two members");
    assert(
      facilitatorKeys(result.effects).includes("revoice"),
      "skipped-presenter round still revoices when remaining responses are in"
    );
    const nextRoles = getCritiqueRoles(result.state);
    assertEqual(
      nextRoles.presenterUserId,
      "u-bob",
      "next presenter is the next unused member, not a replay of alice"
    );
    assert(
      nextRoles.presenterUserId !== "u-alice",
      "skipped presenter is not reassigned a past round (6.5)"
    );
    assertEqual(
      nextRoles.criticUserIds,
      ["u-alice", "u-cara"],
      "round 2 critics are the other two, including the previously absent presenter"
    );
  }

  // --- out-of-turn and duplicate messages do not advance rotation ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "critic speaks before presenter" },
      NOW
    );
    assertEqual(result.state.round, 1, "out-of-turn critic message does not advance");
    assertEqual(result.state.presenterIndex, 0, "out-of-turn message does not rotate presenter");
    assertEqual(
      facilitatorKeys(result.effects).includes("critic_prompt"),
      false,
      "out-of-turn message does not prompt critics"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice share" },
      NOW
    );
    const afterShare = result.state;
    result = applyLearnerEvent(
      afterShare,
      { kind: "message", userId: "u-bob", body: "bob first" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "bob duplicate" },
      NOW
    );
    assertEqual(result.state.round, 1, "duplicate critic message does not complete the round");
  }

  // --- persistence: JSON-round-tripped TeamStateRecord still rotates, incl. skip ---
  {
    const started = startTeam(TEAM_MEMBERS, NOW);
    const reloaded = JSON.parse(JSON.stringify(started.state)) as TeamStateRecord;
    assertEqual(
      reloaded.memberUserIds,
      TEAM_MEMBERS,
      "JSON round-trip keeps official memberUserIds"
    );
    assertEqual(
      reloaded.respondedUserIds,
      [],
      "JSON round-trip keeps official respondedUserIds"
    );
    assertEqual(
      reloaded.critiqueStage,
      "presenter_share",
      "JSON round-trip keeps official critiqueStage"
    );

    let result = markAbsent(reloaded, "u-alice", NOW);
    assertEqual(result.state.round, 1, "round-tripped skip stays on round 1");
    assertEqual(
      result.state.critiqueStage,
      "critic_response",
      "round-tripped presenter skip advances official critiqueStage"
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "bob after reload" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-cara", body: "cara after reload" },
      NOW
    );
    assertEqual(result.state.round, 2, "round-tripped skipped-turn still rotates");
    assertEqual(
      getCritiqueRoles(result.state).presenterUserId,
      "u-bob",
      "round-tripped skip assigns the next unused presenter"
    );
    assertEqual(
      result.state.critiqueStage,
      "presenter_share",
      "round-tripped rotation resets official critiqueStage"
    );
    assertEqual(
      result.state.respondedUserIds,
      [],
      "round-tripped rotation clears official respondedUserIds"
    );
  }

  // ========================================================================
  // Task 2.3 — dual clocks, absence, rejoin (4.1–4.4, 4.6, 6.6, 6.7)
  // ========================================================================

  // --- 4.1: per-person and group clocks stay independent fields ---
  {
    const { state } = startTeam(TEAM_MEMBERS, NOW);
    assert(
      Array.isArray(state.perPersonDeadlines),
      "perPersonDeadlines is its own field (4.1)"
    );
    assert(
      state.groupDeadline === null || typeof state.groupDeadline === "string",
      "groupDeadline is its own field, never merged into perPersonDeadlines (4.1)"
    );
    assert(
      !("deadline" in state) && !("timeoutAt" in state) && !("clock" in state),
      "TeamStateRecord has no merged clock field (4.1)"
    );
  }

  // --- 4.2 + 4.3: presenter share at T+40h starts the critic wait clocks
  //     at T+40h+48h (not T0+48h); one critic post does not move the other ---
  {
    const t0Deadline = new Date(NOW.getTime() + CRITIQUE_DEADLINE_MS).toISOString();
    const shareAt = new Date(NOW.getTime() + 40 * MS_PER_HOUR);
    const expectedCriticDeadline = new Date(
      shareAt.getTime() + CRITIQUE_DEADLINE_MS
    ).toISOString();

    let result = startTeam(TEAM_MEMBERS, NOW);
    assertEqual(
      deadlineOf(result.state, "u-bob"),
      t0Deadline,
      "precondition: critic clock starts at T0+48h"
    );
    assertEqual(
      deadlineOf(result.state, "u-cara"),
      t0Deadline,
      "precondition: second critic clock starts at T0+48h"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice shares at T+40h" },
      shareAt
    );

    assertEqual(
      result.state.critiqueStage,
      "critic_response",
      "presenter share opens critic_response"
    );
    assertEqual(
      deadlineOf(result.state, "u-bob"),
      expectedCriticDeadline,
      "bob critic deadlineAt is T+40h+48h, not T0+48h (4.2)"
    );
    assertEqual(
      deadlineOf(result.state, "u-cara"),
      expectedCriticDeadline,
      "cara critic deadlineAt is T+40h+48h, not T0+48h (4.2)"
    );
    assert(
      deadlineOf(result.state, "u-bob") !== t0Deadline,
      "critic clock is not left at the kickoff T0+48h"
    );

    const bobAfterShare = deadlineOf(result.state, "u-bob");
    const later = new Date(shareAt.getTime() + MS_PER_HOUR);

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-cara", body: "cara critic response" },
      later
    );

    assertEqual(
      deadlineOf(result.state, "u-bob"),
      bobAfterShare,
      "one critic post does not move the other critic's clock (4.3)"
    );
    assertEqual(
      deadlineOf(result.state, "u-cara"),
      new Date(later.getTime() + CRITIQUE_DEADLINE_MS).toISOString(),
      "posting critic's own clock is reset (4.3)"
    );
  }

  // --- 6.6 / 4.4: after 48h silence, evaluateTeam marks that person absent
  //     for this round only and continues with remaining members ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice shares on time" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "bob responds on time" },
      NOW
    );
    const bobDeadlineBefore = deadlineOf(result.state, "u-bob");
    const aliceDeadlineBefore = deadlineOf(result.state, "u-alice");
    assertEqual(result.state.round, 1, "48h case still on round 1 before expiry");

    const expiry = new Date(NOW.getTime() + CRITIQUE_DEADLINE_MS);
    result = evaluateTeam(result.state, expiry);

    assertEqual(
      ofEngineKind(result.effects, "markAbsent"),
      [{ kind: "markAbsent", userId: "u-cara", stepKey: "critique:1" }],
      "48h silence marks only the non-responder absent for this round (6.6)"
    );
    assert(
      result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-cara" && entry.stepKey === "critique:1"
      ),
      "cara is absent for critique:1 only"
    );
    assert(
      !result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-cara" && entry.stepKey !== "critique:1"
      ),
      "cara is not marked absent for any other step"
    );
    assert(
      !result.state.absenceStepKeys.some((entry) => entry.userId === "u-alice"),
      "on-time presenter is not marked absent"
    );
    assert(
      !result.state.absenceStepKeys.some((entry) => entry.userId === "u-bob"),
      "on-time critic is not marked absent"
    );
    assertEqual(
      result.state.round,
      2,
      "round continues with remaining members after the 48h absence (6.6)"
    );
    assertEqual(result.state.phase, "critique", "48h absence stays in critique");
    assert(
      facilitatorKeys(result.effects).includes("revoice"),
      "continuing after critic absence still revoices the completed round"
    );
    assert(
      !result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-cara" && entry.stepKey === "critique:2"
      ),
      "absence does not carry into the next round"
    );

    const replayed = evaluateTeam(result.state, expiry);
    assertEqual(
      replayed.effects,
      [],
      "evaluateTeam is idempotent at the same clock (no new effects)"
    );

    assertEqual(
      aliceDeadlineBefore !== undefined && bobDeadlineBefore !== undefined,
      true,
      "on-time members still had per-person clocks before expiry evaluation"
    );
  }

  // --- 4.4: expired critic does not reset the other waiting critic's clock ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice shares" },
      NOW
    );
    const bobDeadlineBefore = deadlineOf(result.state, "u-bob");
    const withCaraExpired: TeamStateRecord = {
      ...result.state,
      perPersonDeadlines: result.state.perPersonDeadlines.map((deadline) =>
        deadline.userId === "u-cara"
          ? { ...deadline, deadlineAt: NOW.toISOString() }
          : deadline
      ),
    };

    result = evaluateTeam(withCaraExpired, NOW);
    assertEqual(
      ofEngineKind(result.effects, "markAbsent"),
      [{ kind: "markAbsent", userId: "u-cara", stepKey: "critique:1" }],
      "only the expired critic is marked absent"
    );
    assertEqual(result.state.round, 1, "remaining critic keeps the round open");
    assertEqual(
      deadlineOf(result.state, "u-bob"),
      bobDeadlineBefore,
      "evaluateTeam does not reset the other member's per-person clock"
    );
    assertEqual(
      result.state.perPersonDeadlines.filter((deadline) => deadline.userId === "u-bob")
        .length,
      1,
      "bob still has exactly one per-person deadline field entry"
    );
  }

  // --- 4.3: member A message does not reset member B's clock; does reset groupDeadline ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice shares" },
      NOW
    );
    const staleGroupDeadline = new Date(NOW.getTime() + GROUP_SILENCE_MS).toISOString();
    const withGroup: TeamStateRecord = {
      ...result.state,
      groupDeadline: staleGroupDeadline,
    };
    const bobDeadlineBefore = deadlineOf(withGroup, "u-bob");
    const later = new Date(NOW.getTime() + 60 * 60 * 1000);

    result = applyLearnerEvent(
      withGroup,
      { kind: "message", userId: "u-cara", body: "cara critic response" },
      later
    );

    assertEqual(
      deadlineOf(result.state, "u-bob"),
      bobDeadlineBefore,
      "member A message does not reset member B's per-person clock (4.3)"
    );
    assertEqual(
      deadlineOf(result.state, "u-cara"),
      new Date(later.getTime() + CRITIQUE_DEADLINE_MS).toISOString(),
      "actor's own per-person clock is reset for the current step (4.3)"
    );
    assertEqual(
      result.state.groupDeadline,
      new Date(later.getTime() + GROUP_SILENCE_MS).toISOString(),
      "member A message resets groupDeadline (4.3)"
    );
    assertEqual(result.state.round, 1, "one critic message does not complete the round");
    assert(
      result.state.perPersonDeadlines !== undefined &&
        result.state.groupDeadline !== undefined,
      "clocks remain two independent fields after a reset (4.1)"
    );
  }

  // --- 4.3: docSnapshot also resets group + actor clock only ---
  {
    const started = startTeam(TEAM_MEMBERS, NOW);
    const staleGroupDeadline = new Date(
      NOW.getTime() + 2 * GROUP_SILENCE_MS
    ).toISOString();
    const withGroup: TeamStateRecord = {
      ...started.state,
      groupDeadline: staleGroupDeadline,
    };
    const bobDeadlineBefore = deadlineOf(withGroup, "u-bob");
    const caraDeadlineBefore = deadlineOf(withGroup, "u-cara");
    const later = new Date(NOW.getTime() + 30 * 60 * 1000);

    const result = applyLearnerEvent(
      withGroup,
      { kind: "docSnapshot", userId: "u-alice", docKind: "rubric" },
      later
    );

    assertEqual(
      deadlineOf(result.state, "u-alice"),
      new Date(later.getTime() + CRITIQUE_DEADLINE_MS).toISOString(),
      "docSnapshot resets only the editor's per-person clock (4.3)"
    );
    assertEqual(
      deadlineOf(result.state, "u-bob"),
      bobDeadlineBefore,
      "docSnapshot does not reset bob's per-person clock"
    );
    assertEqual(
      deadlineOf(result.state, "u-cara"),
      caraDeadlineBefore,
      "docSnapshot does not reset cara's per-person clock"
    );
    assertEqual(
      result.state.groupDeadline,
      new Date(later.getTime() + GROUP_SILENCE_MS).toISOString(),
      "docSnapshot resets groupDeadline (4.3)"
    );
    assertEqual(
      result.state.round,
      1,
      "docSnapshot does not advance critique rotation"
    );
    assertEqual(result.state.critiqueStage, "presenter_share", "docSnapshot is not a share");
    assertEqual(result.effects, [], "docSnapshot clock reset emits no extra effects");
  }

  // --- 4.6 / 6.7: returning absent member joins current round/phase, no replay ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    result = markAbsent(result.state, "u-alice", NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "bob continues" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-cara", body: "cara continues" },
      NOW
    );
    assertEqual(result.state.round, 2, "precondition: team is on round 2");
    assertEqual(
      getCritiqueRoles(result.state).presenterUserId,
      "u-bob",
      "precondition: bob is the current presenter"
    );
    assert(
      result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-alice" && entry.stepKey === "critique:1"
      ),
      "precondition: alice remains absent for the completed round"
    );

    const beforeReturn = result.state;
    result = applyLearnerEvent(
      beforeReturn,
      { kind: "memberReturned", userId: "u-alice" },
      NOW
    );

    assertEqual(result.state.phase, beforeReturn.phase, "return keeps the current phase (6.7)");
    assertEqual(result.state.round, 2, "return joins the current round, not a replay of round 1");
    assertEqual(
      result.state.presenterIndex,
      beforeReturn.presenterIndex,
      "return does not undo the presenter rotation"
    );
    assert(
      result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-alice" && entry.stepKey === "critique:1"
      ),
      "completed-round absence is not undone (no replay)"
    );
    assert(
      !result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-alice" && entry.stepKey === "critique:2"
      ),
      "returner is not absent for the current round"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "bob presents in round 2" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice critiques from the current point" },
      NOW
    );
    assertEqual(result.state.round, 2, "returner participates in the current round");
    assert(
      result.state.respondedUserIds.includes("u-alice"),
      "returner can act at the team's current point (4.6, 6.7)"
    );
    assertEqual(
      result.state.phase,
      "critique",
      "returner activity does not roll the team back to a prior phase"
    );
  }

  // --- 6.7: memberReturned mid-round clears only the current-step absence ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "alice shares" },
      NOW
    );
    result = markAbsent(result.state, "u-cara", NOW);
    assertEqual(result.state.round, 1, "precondition: still on the absent step");

    result = applyLearnerEvent(
      result.state,
      { kind: "memberReturned", userId: "u-cara" },
      NOW
    );
    assertEqual(result.state.round, 1, "mid-round return stays on the current round");
    assertEqual(result.state.phase, "critique", "mid-round return stays on the current phase");
    assert(
      !result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-cara" && entry.stepKey === "critique:1"
      ),
      "returner can rejoin the still-open current step"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-cara", body: "cara rejoins this step" },
      NOW
    );
    assert(
      result.state.respondedUserIds.includes("u-cara"),
      "rejoined member can respond in the current step"
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("engine.selftest: all assertions passed");
}

main();
