/**
 * Runtime self-test for calibration-engine queue (Task 2.1),
 * critique rotation (Task 2.2), dual clocks (Task 2.3),
 * merge / blind-scoring (Task 2.4), discussion / consensus /
 * lock (Task 2.5), and the Task 2.6 coverage matrix.
 * Pure evaluation only.
 *
 * Run: npx tsx lib/calibration-engine/engine.selftest.ts
 *
 * Coverage index — requirement ID → case name (Requirements 2, 4, 6–10):
 *   2.1  "1 queued → no formTeam" / "2 queued → no formTeam"
 *   2.2  "3 queued → exactly one formTeam"
 *   2.3  "6 days since check-in → one queue_ping"
 *   2.4  "2 missed pings → expireCheckIn"
 *   2.5  "10-day unmatched waiter → listForOperator"
 *   2.6  "manual trio uses the same startTeam path as automatic quorum"
 *   2.7  "2 queued invents no pair team" / "5 queued leftover pair is not a team"
 *   4.1  "perPersonDeadlines is its own field (4.1)"
 *   4.2  "bob critic deadlineAt is T+40h+48h, not T0+48h (4.2)"
 *   4.3  "member A message does not reset member B's per-person clock (4.3)"
 *   4.4  "48h silence marks only the non-responder absent for this round (6.6)"
 *   4.5  "14-day group silence auto-finalizes merge" / discussion / consensus
 *        + "expired group clock does not auto-finalize critique/scoring"
 *   4.6  "returner can act at the team's current point (4.6, 6.7)"
 *        + "return during merge stays in merge (4.6)"
 *   6.1  "exactly three critique rounds ran (6.1)"
 *   6.2  "formation announces the Presenter (6.2)"
 *   6.3  "after presenter share, critics are prompted (6.3)"
 *   6.4  "round completion emits one revoice (6.4)"
 *   6.5  "each member was Presenter once (6.5)"
 *   6.6  "48h silence marks only the non-responder absent for this round (6.6)"
 *   6.7  "return joins the current round, not a replay of round 1"
 *   7.1  "third critique round opens merge (7.1)"
 *   7.2  engine N/A (Liveblocks cursors — task 6.2)
 *   7.3  engine N/A (live doc updates — task 6.2)
 *   7.4  "notes docSnapshot resets only the editor's per-person clock (7.4, 4.3)"
 *   7.5  engine N/A (no cursors on artifacts/chat — task 5.2 / 6.2)
 *   7.6  "3-day silence nudges only non-contributors (7.6)"
 *   7.7  "14-day group silence auto-finalizes merge into scoring (7.7)"
 *   8.1  "all present merge_complete agreements open scoring (8.1)"
 *   8.2  engine N/A (store score privacy — task 1.3)
 *   8.3  "score ack context contains no numeric score values (8.3)"
 *   8.4  "every present member submitted → revealScores (8.4)"
 *        + "two present submitters reveal without waiting for an absent member (8.4)"
 *   8.5  "7-day scoring silence marks the non-submitter absent (8.5)"
 *   8.6  "exactly two submitters are sufficient to reveal after timeout (8.6)"
 *   8.7  engine N/A (store integer 1–5 CHECK — task 1.3)
 *   9.1  "3-scorer clarity spread is max−min (9.1)"
 *   9.2  "3-scorer clarity spread ≥2 is flagged (9.2)"
 *   9.3  "targeted prompt names a scorer (the extreme / min scorer) (9.3)"
 *   9.4  "a discussion message may emit revoice or follow-up (9.4, 10.1)"
 *   9.5  "7-day silence marks alice absent for the clarity exchange (9.5)"
 *   9.6  "14-day discussion silence finalizes (9.6)"
 *   9.7  "no ≥2 flags skip discussion and go to consensus (9.7)"
 *   10.1 "discussion end posts a rewrite prompt (10.1)"
 *   10.2 "all present final_consensus locks (10.2)"
 *        + "two present agreements lock when the third is absent (10.2)"
 *   10.3 "14-day consensus silence finalizes (10.3)"
 *   10.4 "post-lock docSnapshot is rejected (no state change)"
 *   10.5 "return keeps the current discussion phase (10.5)"
 *   10.6 "post-lock return leaves the locked artifact unchanged (10.6)"
 *   11.5 "double-evaluateTeam at the same clock yields no new effects"
 *        + "double-evaluateQueue after applying effects yields no new effects"
 */
import type {
  CheckIn,
  EngineEffect,
  EngineResult,
  QueueEffect,
  RevealedScores,
  TeamStateRecord,
} from "../calibration-store/types";
import {
  CRITIQUE_DEADLINE_MS,
  DISCUSSION_DEADLINE_MS,
  GROUP_SILENCE_MS,
  MERGE_NUDGE_MS,
  MS_PER_DAY,
  MS_PER_HOUR,
  OPERATOR_STUCK_LISTING_MS,
  QUEUE_EXPIRY_MISSED_PINGS,
  QUEUE_PING_MS,
  SCORING_DEADLINE_MS,
} from "../calibration-store/types";
import {
  applyLearnerEvent,
  applySpread,
  computeSpread,
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

function deadlineOfStep(
  state: TeamStateRecord,
  userId: string,
  stepKey: string
): string | undefined {
  return state.perPersonDeadlines.find(
    (deadline) => deadline.userId === userId && deadline.stepKey === stepKey
  )?.deadlineAt;
}

function completeAllCritiqueRounds(now: Date): EngineResult {
  let result = startTeam(TEAM_MEMBERS, now);
  for (let round = 1; round <= 3; round += 1) {
    const roles = getCritiqueRoles(result.state);
    result = completeRound(result.state, roles.presenterUserId, roles.criticUserIds, now);
  }
  return result;
}

function enterScoringViaAgreements(now: Date): EngineResult {
  let result = completeAllCritiqueRounds(now);
  for (const userId of TEAM_MEMBERS) {
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId, subject: "merge_complete" },
      now
    );
  }
  return result;
}

function submitScores(
  state: TeamStateRecord,
  userId: string,
  now: Date
): EngineResult {
  return applyLearnerEvent(state, { kind: "scoresSubmitted", userId }, now);
}

function revealedFrom(
  members: Array<{ userId: string; values: Record<string, number> }>,
  revealedAt: string = NOW.toISOString()
): RevealedScores {
  return {
    members: members.map((member) => ({
      userId: member.userId,
      scores: Object.entries(member.values).map(([criterionKey, value]) => ({
        criterionKey,
        value,
      })),
    })),
    revealedAt,
  };
}

function enterDiscussionWithFlags(now: Date): EngineResult {
  let result = enterScoringViaAgreements(now);
  result = submitScores(result.state, "u-alice", now);
  result = submitScores(result.state, "u-bob", now);
  result = submitScores(result.state, "u-cara", now);
  return applySpread(
    result.state,
    revealedFrom([
      { userId: "u-alice", values: { clarity: 2, evidence: 4 } },
      { userId: "u-bob", values: { clarity: 3, evidence: 4 } },
      { userId: "u-cara", values: { clarity: 5, evidence: 4 } },
    ])
  );
}

function enterDiscussionWithTwoFlags(now: Date): EngineResult {
  let result = enterScoringViaAgreements(now);
  result = submitScores(result.state, "u-alice", now);
  result = submitScores(result.state, "u-bob", now);
  result = submitScores(result.state, "u-cara", now);
  return applySpread(
    result.state,
    revealedFrom([
      { userId: "u-alice", values: { clarity: 2, evidence: 4 } },
      { userId: "u-bob", values: { clarity: 3, evidence: 1 } },
      { userId: "u-cara", values: { clarity: 5, evidence: 4 } },
    ])
  );
}

function enterConsensusNoFlags(now: Date): EngineResult {
  let result = enterScoringViaAgreements(now);
  result = submitScores(result.state, "u-alice", now);
  result = submitScores(result.state, "u-bob", now);
  result = submitScores(result.state, "u-cara", now);
  return applySpread(
    result.state,
    revealedFrom([
      { userId: "u-alice", values: { clarity: 3, evidence: 4 } },
      { userId: "u-bob", values: { clarity: 4, evidence: 4 } },
      { userId: "u-cara", values: { clarity: 4, evidence: 4 } },
    ])
  );
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

/** Apply queue effects to a check-in set so a same-clock re-eval can be a no-op. */
function applyQueueEffects(
  checkIns: CheckIn[],
  effects: QueueEffect[],
  now: Date
): CheckIn[] {
  const formed = new Set(
    ofKind(effects, "formTeam").flatMap((effect) => effect.memberUserIds)
  );
  const expiredIds = new Set(
    ofKind(effects, "expireCheckIn").map((effect) => effect.checkInId)
  );
  const pingedUsers = new Set(
    ofKind(effects, "sendNotice")
      .filter((effect) => effect.notice.kind === "queue_ping")
      .map((effect) => effect.notice.userId)
  );
  return checkIns.map((row) => {
    if (expiredIds.has(row.id)) {
      return { ...row, status: "expired" };
    }
    if (formed.has(row.userId)) {
      return { ...row, status: "matched", teamId: "team-applied" };
    }
    if (pingedUsers.has(row.userId)) {
      return {
        ...row,
        lastPingAt: now.toISOString(),
        missedPings: row.missedPings + 1,
      };
    }
    return row;
  });
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

  // ========================================================================
  // Task 2.4 — merge + blind scoring (4.5, 7.1, 7.6, 7.7, 8.1, 8.3–8.6, 9.1–9.2, 9.7)
  // ========================================================================

  const expectedMergeNudge = new Date(NOW.getTime() + MERGE_NUDGE_MS).toISOString();
  const expectedGroupSilence = new Date(NOW.getTime() + GROUP_SILENCE_MS).toISOString();

  // --- 7.1: third critique round opens merge with rubric prompt + dual clocks ---
  {
    const result = completeAllCritiqueRounds(NOW);
    assertEqual(result.state.phase, "merge", "third critique round opens merge (7.1)");
    assert(
      facilitatorKeys(result.effects).includes("open_rubric"),
      "merge posts an open-rubric prompt (7.1)"
    );
    assertEqual(
      result.state.groupDeadline,
      expectedGroupSilence,
      "merge starts the 14-day group silence clock (7.7)"
    );
    assert(
      TEAM_MEMBERS.every(
        (userId) => deadlineOfStep(result.state, userId, "merge") === expectedMergeNudge
      ),
      "merge starts a 3-day per-person contribution clock for every member (7.6)"
    );
    assert(
      result.state.perPersonDeadlines.every((deadline) => deadline.stepKey === "merge"),
      "merge per-person clocks use the merge step key"
    );
    assertEqual(
      result.state.respondedUserIds,
      [],
      "merge starts with no contributions recorded"
    );
  }

  // --- 7.6: 3-day no-contribution → nudge that member; contributors are skipped ---
  {
    let result = completeAllCritiqueRounds(NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "docSnapshot", userId: "u-alice", docKind: "rubric" },
      NOW
    );
    assert(
      result.state.respondedUserIds.includes("u-alice"),
      "a rubric snapshot counts as a merge contribution"
    );

    const justUnder = new Date(NOW.getTime() + MERGE_NUDGE_MS - 1);
    const early = evaluateTeam(result.state, justUnder);
    assertEqual(
      noticeKinds(early.effects).includes("nudge"),
      false,
      "just under 3 days → no merge nudge"
    );

    const due = new Date(NOW.getTime() + MERGE_NUDGE_MS);
    result = evaluateTeam(result.state, due);
    const nudges = ofEngineKind(result.effects, "sendNotice").filter(
      (effect) => effect.notice.kind === "nudge"
    );
    assertEqual(nudges.length, 2, "3-day silence nudges only non-contributors (7.6)");
    assertEqual(
      nudges.map((effect) => effect.notice.userId).sort(),
      ["u-bob", "u-cara"],
      "nudge targets bob and cara, not contributing alice"
    );
    assert(
      nudges.every((effect) => effect.notice.dedupeKey.includes("nudge")),
      "merge nudge notices carry a nudge dedupeKey"
    );
    assertEqual(result.state.phase, "merge", "a nudge does not leave merge");
    assert(
      !result.state.absenceStepKeys.some((entry) => entry.stepKey === "merge"),
      "a merge nudge does not mark the member absent"
    );

    const replayed = evaluateTeam(result.state, due);
    assertEqual(
      noticeKinds(replayed.effects).includes("nudge"),
      false,
      "merge nudge is idempotent at the same clock"
    );
  }

  // --- 4.3 in merge: one member's edit resets group + own nudge clock only ---
  {
    const started = completeAllCritiqueRounds(NOW);
    const bobBefore = deadlineOfStep(started.state, "u-bob", "merge");
    const later = new Date(NOW.getTime() + MS_PER_DAY);
    const result = applyLearnerEvent(
      started.state,
      { kind: "message", userId: "u-alice", body: "alice drafts a criterion" },
      later
    );
    assertEqual(
      deadlineOfStep(result.state, "u-bob", "merge"),
      bobBefore,
      "alice's merge message does not reset bob's nudge clock (4.3)"
    );
    assertEqual(
      deadlineOfStep(result.state, "u-alice", "merge"),
      new Date(later.getTime() + MERGE_NUDGE_MS).toISOString(),
      "alice's own merge nudge clock is reset (4.3)"
    );
    assertEqual(
      result.state.groupDeadline,
      new Date(later.getTime() + GROUP_SILENCE_MS).toISOString(),
      "alice's merge message resets the group clock (4.3)"
    );
    assertEqual(result.state.phase, "merge", "a merge message does not advance the phase");
  }

  // --- 4.5 / 7.7: 14-day group silence auto-finalizes rubric incomplete → scoring ---
  {
    const started = completeAllCritiqueRounds(NOW);
    const justUnder = evaluateTeam(
      started.state,
      new Date(NOW.getTime() + GROUP_SILENCE_MS - 1)
    );
    assertEqual(justUnder.state.phase, "merge", "just under 14 days stays in merge");

    const silenceAt = new Date(NOW.getTime() + GROUP_SILENCE_MS);
    const result = evaluateTeam(started.state, silenceAt);
    assertEqual(
      result.state.phase,
      "scoring",
      "14-day group silence auto-finalizes merge into scoring (7.7)"
    );
    assert(
      ofEngineKind(result.effects, "postFacilitator").some(
        (effect) =>
          effect.message.key === "merge_auto_finalize" &&
          effect.message.context.incomplete === true
      ),
      "auto-finalize labels the rubric incomplete (4.5, 7.7)"
    );
    assert(
      facilitatorKeys(result.effects).includes("score_prompt"),
      "auto-finalize asks present members to score (8.1)"
    );
    const scoringDeadlineAtSilence = new Date(
      silenceAt.getTime() + SCORING_DEADLINE_MS
    ).toISOString();
    assert(
      TEAM_MEMBERS.every(
        (userId) =>
          deadlineOfStep(result.state, userId, "scoring") === scoringDeadlineAtSilence
      ),
      "scoring starts a 7-day per-person clock for every present member (8.5)"
    );
    assertEqual(
      result.state.groupDeadline,
      null,
      "scoring does not run a group silence clock"
    );

    const replayed = evaluateTeam(result.state, new Date(NOW.getTime() + GROUP_SILENCE_MS));
    assert(
      !facilitatorKeys(replayed.effects).includes("merge_auto_finalize"),
      "merge auto-finalize is idempotent after the phase has advanced"
    );
  }

  // --- 8.1: all present merge_complete agreements advance to scoring ---
  {
    let result = completeAllCritiqueRounds(NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-alice", subject: "merge_complete" },
      NOW
    );
    assertEqual(result.state.phase, "merge", "one merge_complete agreement stays in merge");
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-bob", subject: "merge_complete" },
      NOW
    );
    assertEqual(result.state.phase, "merge", "two merge_complete agreements stay in merge");
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-alice", subject: "merge_complete", withdrawn: true },
      NOW
    );
    assertEqual(result.state.phase, "merge", "withdrawing Ready stays in merge");
    assertEqual(
      result.state.agreementSets.merge_complete.includes("u-alice"),
      false,
      "withdrawn Ready is removed before scoring starts"
    );
    assertEqual(
      result.state.agreementSets.merge_complete.includes("u-bob"),
      true,
      "withdrawing one Ready leaves the others"
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-alice", subject: "merge_complete" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "docSnapshot", userId: "u-bob", docKind: "notes", revised: true },
      NOW
    );
    assertEqual(
      result.state.agreementSets.merge_complete.slice().sort(),
      ["u-alice", "u-bob"],
      "notes edits do not clear Ready marks"
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "docSnapshot", userId: "u-bob", docKind: "rubric" },
      NOW
    );
    assertEqual(
      result.state.agreementSets.merge_complete.slice().sort(),
      ["u-alice", "u-bob"],
      "an unchanged rubric snapshot does not clear Ready marks"
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "docSnapshot", userId: "u-bob", docKind: "rubric", revised: true },
      NOW
    );
    assertEqual(
      result.state.agreementSets.merge_complete,
      [],
      "a revised rubric snapshot clears Ready marks"
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-alice", subject: "merge_complete" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-bob", subject: "merge_complete" },
      NOW
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-cara", subject: "merge_complete" },
      NOW
    );
    assertEqual(
      result.state.phase,
      "scoring",
      "all present merge_complete agreements open scoring (8.1)"
    );
    assert(
      facilitatorKeys(result.effects).includes("score_prompt"),
      "agreement-driven scoring posts a score prompt (8.1)"
    );
    assert(
      !facilitatorKeys(result.effects).includes("merge_auto_finalize"),
      "explicit agreement does not flag the rubric incomplete"
    );
    assertEqual(
      result.state.agreementSets.merge_complete.slice().sort(),
      [...TEAM_MEMBERS].sort(),
      "all three merge_complete agreements are recorded"
    );
    const tooLate = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-alice", subject: "merge_complete", withdrawn: true },
      NOW
    );
    assertEqual(tooLate.state.phase, "scoring", "withdraw after scoring does not roll back");
    assertEqual(
      tooLate.state.agreementSets.merge_complete.slice().sort(),
      [...TEAM_MEMBERS].sort(),
      "Ready cannot be withdrawn after scoring starts"
    );
  }

  // --- 8.3 / 8.4: three present submitters → ack without values, then reveal ---
  {
    let result = enterScoringViaAgreements(NOW);
    result = submitScores(result.state, "u-alice", NOW);
    assert(
      ofEngineKind(result.effects, "postFacilitator").some(
        (effect) => effect.message.key === "score_ack"
      ),
      "first submission is acknowledged (8.3)"
    );
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [],
      "one submission does not reveal"
    );
    const ack = ofEngineKind(result.effects, "postFacilitator").find(
      (effect) => effect.message.key === "score_ack"
    );
    assertEqual(
      ack?.message.context.userId,
      "u-alice",
      "score ack names the submitter"
    );
    assert(
      !JSON.stringify(ack?.message.context ?? {}).match(/"[1-5]"|: [1-5][,}]/),
      "score ack context contains no numeric score values (8.3)"
    );

    result = submitScores(result.state, "u-bob", NOW);
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [],
      "two of three present submissions do not reveal"
    );

    result = submitScores(result.state, "u-cara", NOW);
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [{ kind: "revealScores" }],
      "every present member submitted → revealScores (8.4)"
    );
    assert(
      ofEngineKind(result.effects, "postFacilitator").some(
        (effect) => effect.message.key === "score_ack"
      ),
      "the last submission is still acknowledged without values (8.3)"
    );
    assertEqual(result.state.phase, "scoring", "reveal stays in scoring until spread is applied");

    const replayed = evaluateTeam(result.state, NOW);
    assertEqual(
      ofEngineKind(replayed.effects, "revealScores"),
      [],
      "evaluateTeam does not re-reveal after all present already submitted"
    );

    const flaggedRevealed = revealedFrom([
      { userId: "u-alice", values: { clarity: 2, evidence: 4 } },
      { userId: "u-bob", values: { clarity: 3, evidence: 4 } },
      { userId: "u-cara", values: { clarity: 5, evidence: 4 } },
    ]);
    const spreads = computeSpread(flaggedRevealed);
    const clarity = spreads.find((row) => row.criterionKey === "clarity");
    const evidence = spreads.find((row) => row.criterionKey === "evidence");
    assertEqual(clarity?.min, 2, "3-scorer clarity min is 2 (9.1)");
    assertEqual(clarity?.max, 5, "3-scorer clarity max is 5 (9.1)");
    assertEqual(clarity?.spread, 3, "3-scorer clarity spread is max−min (9.1)");
    assertEqual(clarity?.flagged, true, "3-scorer clarity spread ≥2 is flagged (9.2)");
    assertEqual(evidence?.spread, 0, "3-scorer evidence spread is 0");
    assertEqual(evidence?.flagged, false, "3-scorer evidence spread <2 is not flagged");

    const advanced = applySpread(result.state, flaggedRevealed);
    assertEqual(
      advanced.state.phase,
      "discussion",
      "3 scorers with a ≥2 flag enter discussion (9.1, 9.2)"
    );
    assertEqual(
      advanced.state.flaggedCriteria,
      ["clarity"],
      "only criteria with spread ≥2 are flagged"
    );
  }

  // --- 8.5 / 8.6 / 9.7: 7-day absence with exactly two submitters reveals; no flags skip discussion ---
  {
    let result = enterScoringViaAgreements(NOW);
    result = submitScores(result.state, "u-alice", NOW);
    result = submitScores(result.state, "u-bob", NOW);
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [],
      "two of three present submissions wait for the third or a timeout"
    );

    const justUnder = evaluateTeam(
      result.state,
      new Date(NOW.getTime() + SCORING_DEADLINE_MS - 1)
    );
    assertEqual(
      ofEngineKind(justUnder.effects, "markAbsent"),
      [],
      "just under 7 days marks nobody absent"
    );
    assertEqual(
      ofEngineKind(justUnder.effects, "revealScores"),
      [],
      "just under 7 days does not reveal"
    );

    result = evaluateTeam(
      result.state,
      new Date(NOW.getTime() + SCORING_DEADLINE_MS)
    );
    assertEqual(
      ofEngineKind(result.effects, "markAbsent"),
      [{ kind: "markAbsent", userId: "u-cara", stepKey: "scoring" }],
      "7-day scoring silence marks the non-submitter absent (8.5)"
    );
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [{ kind: "revealScores" }],
      "exactly two submitters are sufficient to reveal after timeout (8.6)"
    );
    assert(
      result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-cara" && entry.stepKey === "scoring"
      ),
      "cara is absent for scoring only"
    );

    const replayed = evaluateTeam(
      result.state,
      new Date(NOW.getTime() + SCORING_DEADLINE_MS)
    );
    assertEqual(
      ofEngineKind(replayed.effects, "revealScores"),
      [],
      "timeout reveal is idempotent at the same clock"
    );

    const tightRevealed = revealedFrom([
      { userId: "u-alice", values: { clarity: 3, evidence: 4 } },
      { userId: "u-bob", values: { clarity: 4, evidence: 4 } },
    ]);
    const spreads = computeSpread(tightRevealed);
    assert(
      spreads.every((row) => row.flagged === false),
      "2-scorer spreads of 0 and 1 are not flagged"
    );
    assertEqual(
      spreads.find((row) => row.criterionKey === "clarity")?.spread,
      1,
      "2-scorer clarity spread is max−min"
    );

    const advanced = applySpread(result.state, tightRevealed);
    assertEqual(
      advanced.state.phase,
      "consensus",
      "no ≥2 flags skip discussion and go to consensus (9.7)"
    );
    assertEqual(advanced.state.flaggedCriteria, [], "no-flag reveal stores no flagged criteria");
  }

  // --- 8.5: 7-day absence with one submission still reveals; leftover waiter does not ---
  {
    let result = enterScoringViaAgreements(NOW);
    result = submitScores(result.state, "u-alice", NOW);
    const onlyCaraExpired: TeamStateRecord = {
      ...result.state,
      perPersonDeadlines: result.state.perPersonDeadlines.map((deadline) =>
        deadline.userId === "u-cara" && deadline.stepKey === "scoring"
          ? { ...deadline, deadlineAt: NOW.toISOString() }
          : deadline
      ),
    };
    result = evaluateTeam(onlyCaraExpired, NOW);
    assertEqual(
      ofEngineKind(result.effects, "markAbsent"),
      [{ kind: "markAbsent", userId: "u-cara", stepKey: "scoring" }],
      "only the expired non-submitter is marked absent"
    );
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [],
      "a still-waiting present member blocks reveal"
    );

    result = evaluateTeam(
      result.state,
      new Date(NOW.getTime() + SCORING_DEADLINE_MS)
    );
    assertEqual(
      ofEngineKind(result.effects, "markAbsent"),
      [{ kind: "markAbsent", userId: "u-bob", stepKey: "scoring" }],
      "the remaining non-submitter is marked absent at 7 days"
    );
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [{ kind: "revealScores" }],
      "≥1 submission plus remaining present having submitted reveals (8.5)"
    );
  }

  // --- timeout spread case: two revealed scores with a ≥2 flag enter discussion ---
  {
    let result = enterScoringViaAgreements(NOW);
    result = submitScores(result.state, "u-alice", NOW);
    result = submitScores(result.state, "u-bob", NOW);
    result = evaluateTeam(
      result.state,
      new Date(NOW.getTime() + SCORING_DEADLINE_MS)
    );
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [{ kind: "revealScores" }],
      "timeout path emits revealScores before spread"
    );

    const timeoutRevealed = revealedFrom([
      { userId: "u-alice", values: { clarity: 1 } },
      { userId: "u-bob", values: { clarity: 5 } },
    ]);
    const spreads = computeSpread(timeoutRevealed);
    assertEqual(spreads[0]?.spread, 4, "timeout 2-scorer spread is max−min");
    assertEqual(spreads[0]?.flagged, true, "timeout 2-scorer spread ≥2 is flagged");
    const advanced = applySpread(result.state, timeoutRevealed);
    assertEqual(
      advanced.state.phase,
      "discussion",
      "timeout reveal with a ≥2 flag enters discussion (9.2)"
    );
    assertEqual(advanced.state.flaggedCriteria, ["clarity"], "timeout flags the wide criterion");
  }

  // ========================================================================
  // Task 2.5 — discussion, consensus, lock (9.3, 9.5, 9.6, 10.1–10.3, 10.5, 11.5)
  // ========================================================================

  const expectedDiscussionDeadline = new Date(
    NOW.getTime() + DISCUSSION_DEADLINE_MS
  ).toISOString();

  // --- 9.3: entering discussion posts a targeted prompt naming a scorer + criterion ---
  {
    const result = enterDiscussionWithFlags(NOW);
    assertEqual(result.state.phase, "discussion", "flagged spread enters discussion (9.3)");
    assertEqual(result.state.flaggedCriteria, ["clarity"], "clarity is the flagged criterion");

    assertEqual(
      facilitatorKeys(result.effects)[0],
      "reveal_announcement",
      "spread posts reveal_announcement before discussion prompts"
    );

    const targeted = ofEngineKind(result.effects, "postFacilitator").filter(
      (effect) => effect.message.key === "targeted_prompt"
    );
    assertEqual(targeted.length, 1, "one flagged criterion → one targeted prompt (9.3)");
    assertEqual(
      targeted[0]?.message.context.criterionKey,
      "clarity",
      "targeted prompt names the flagged criterion (9.3)"
    );
    assertEqual(
      targeted[0]?.message.context.scorerUserId,
      "u-alice",
      "targeted prompt names a scorer (the extreme / min scorer) (9.3)"
    );
    assertEqual(
      deadlineOfStep(result.state, "u-alice", "discussion:clarity"),
      expectedDiscussionDeadline,
      "named scorer gets a 7-day per-person clock for that exchange (9.5)"
    );
    assertEqual(
      result.state.groupDeadline,
      expectedGroupSilence,
      "discussion starts the 14-day group silence clock (9.6)"
    );
    assert(
      result.state.perPersonDeadlines !== undefined &&
        result.state.groupDeadline !== undefined,
      "discussion keeps per-person and group clocks as independent fields (4.1)"
    );
  }

  // --- 9.3: one targeted prompt per flagged criterion, each naming a scorer ---
  {
    const result = enterDiscussionWithTwoFlags(NOW);
    assertEqual(
      result.state.flaggedCriteria.slice().sort(),
      ["clarity", "evidence"],
      "two ≥2 spreads flag both criteria"
    );
    const targeted = ofEngineKind(result.effects, "postFacilitator").filter(
      (effect) => effect.message.key === "targeted_prompt"
    );
    assertEqual(targeted.length, 2, "each flagged criterion gets a targeted prompt (9.3)");
    const byCriterion = Object.fromEntries(
      targeted.map((effect) => [
        String(effect.message.context.criterionKey),
        String(effect.message.context.scorerUserId),
      ])
    );
    assertEqual(byCriterion.clarity, "u-alice", "clarity prompt names alice (min 2)");
    assertEqual(byCriterion.evidence, "u-bob", "evidence prompt names bob (min 1)");
    assertEqual(
      deadlineOfStep(result.state, "u-alice", "discussion:clarity"),
      expectedDiscussionDeadline,
      "clarity exchange has a 7-day clock on alice"
    );
    assertEqual(
      deadlineOfStep(result.state, "u-bob", "discussion:evidence"),
      expectedDiscussionDeadline,
      "evidence exchange has a 7-day clock on bob"
    );
  }

  // --- 9.5: 7-day no response marks the named scorer absent for that exchange ---
  {
    const started = enterDiscussionWithTwoFlags(NOW);
    const justUnder = evaluateTeam(
      started.state,
      new Date(NOW.getTime() + DISCUSSION_DEADLINE_MS - 1)
    );
    assertEqual(
      ofEngineKind(justUnder.effects, "markAbsent"),
      [],
      "just under 7 days marks nobody absent"
    );
    assertEqual(justUnder.state.phase, "discussion", "just under 7 days stays in discussion");

    const result = evaluateTeam(
      started.state,
      new Date(NOW.getTime() + DISCUSSION_DEADLINE_MS)
    );
    const absences = ofEngineKind(result.effects, "markAbsent");
    assert(
      absences.some(
        (effect) =>
          effect.userId === "u-alice" && effect.stepKey === "discussion:clarity"
      ),
      "7-day silence marks alice absent for the clarity exchange (9.5)"
    );
    assert(
      absences.some(
        (effect) => effect.userId === "u-bob" && effect.stepKey === "discussion:evidence"
      ),
      "7-day silence marks bob absent for the evidence exchange (9.5)"
    );
    assert(
      result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-alice" && entry.stepKey === "discussion:clarity"
      ),
      "alice absence is recorded for discussion:clarity only"
    );
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "per-person expiry does not lock; remaining present continue (9.5)"
    );

    const replayed = evaluateTeam(
      result.state,
      new Date(NOW.getTime() + DISCUSSION_DEADLINE_MS)
    );
    assertEqual(
      replayed.effects,
      [],
      "double-evaluateTeam at the same 7d clock yields no new effects (11.5)"
    );
  }

  // --- 9.6 / 10.3: 14-day group silence auto-finalizes with unresolved labels ---
  {
    const started = enterDiscussionWithFlags(NOW);
    const justUnder = evaluateTeam(
      started.state,
      new Date(NOW.getTime() + GROUP_SILENCE_MS - 1)
    );
    assertEqual(justUnder.state.phase, "discussion", "just under 14 days stays in discussion");
    assertEqual(
      ofEngineKind(justUnder.effects, "lockDeliverable"),
      [],
      "just under 14 days does not lock"
    );

    const silenceAt = new Date(NOW.getTime() + GROUP_SILENCE_MS);
    const result = evaluateTeam(started.state, silenceAt);
    assertEqual(result.state.phase, "finalized", "14-day discussion silence finalizes (9.6)");
    const locks = ofEngineKind(result.effects, "lockDeliverable");
    assertEqual(locks.length, 1, "14-day discussion silence emits one lockDeliverable");
    assertEqual(locks[0]?.auto, true, "group-timeout lock is auto (9.6, 10.3)");
    assert(
      facilitatorKeys(result.effects).includes("finalize"),
      "auto-lock posts a finalize notice"
    );
    assertEqual(
      locks[0]?.unresolved,
      ["clarity"],
      "auto-finalize labels unresolved flagged criteria (9.6, 10.3)"
    );
    assertEqual(
      result.state.flaggedCriteria,
      ["clarity"],
      "auto-lock persists only the unresolved criteria on state"
    );

    const replayed = evaluateTeam(result.state, silenceAt);
    assertEqual(
      replayed.effects,
      [],
      "double-evaluateTeam after discussion lock yields no new effects (11.5)"
    );
    assertEqual(replayed.state.phase, "finalized", "replayed lock stays finalized");
  }

  // --- 10.1: answering the flagged exchange moves to consensus with a rewrite prompt ---
  {
    const started = enterDiscussionWithFlags(NOW);
    const result = applyLearnerEvent(
      started.state,
      { kind: "message", userId: "u-alice", body: "I scored 2 because the artifact never names a goal" },
      NOW
    );
    assertEqual(
      result.state.phase,
      "consensus",
      "answering the only flagged exchange opens consensus (10.1)"
    );
    assert(
      facilitatorKeys(result.effects).includes("rewrite_prompt"),
      "discussion end posts a rewrite prompt (10.1)"
    );
    assertEqual(
      result.state.groupDeadline,
      expectedGroupSilence,
      "consensus starts a 14-day group silence clock (10.3)"
    );
    assert(
      facilitatorKeys(result.effects).includes("revoice") ||
        facilitatorKeys(result.effects).includes("follow_up"),
      "a discussion message may emit revoice or follow-up (9.4, 10.1)"
    );
  }

  // --- 10.1: two flags — one answer stays in discussion; both answers open consensus ---
  {
    const started = enterDiscussionWithTwoFlags(NOW);
    let result = applyLearnerEvent(
      started.state,
      { kind: "message", userId: "u-alice", body: "clarity: the prompt never states a goal" },
      NOW
    );
    assertEqual(
      result.state.phase,
      "discussion",
      "one of two flagged exchanges answered stays in discussion"
    );
    assert(
      facilitatorKeys(result.effects).includes("revoice") ||
        facilitatorKeys(result.effects).includes("follow_up"),
      "partial discussion answer emits revoice or follow-up (9.4)"
    );
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "a discussion message does not lock"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-bob", body: "evidence: the transcript has no student work" },
      NOW
    );
    assertEqual(
      result.state.phase,
      "consensus",
      "all flagged exchanges answered → consensus (10.1)"
    );
    assert(
      facilitatorKeys(result.effects).includes("rewrite_prompt"),
      "last answered exchange posts a rewrite prompt (10.1)"
    );
  }

  // --- 10.1: no-flag reveal still posts the rewrite prompt on entering consensus ---
  {
    const result = enterConsensusNoFlags(NOW);
    assertEqual(result.state.phase, "consensus", "no flags skip discussion (9.7, 10.1)");
    assertEqual(
      facilitatorKeys(result.effects)[0],
      "reveal_announcement",
      "no-flag spread still posts reveal_announcement before rewrite"
    );
    assert(
      facilitatorKeys(result.effects).includes("rewrite_prompt"),
      "skip-discussion consensus still posts a rewrite prompt (10.1)"
    );
    assertEqual(
      result.state.groupDeadline,
      expectedGroupSilence,
      "skip-discussion consensus starts the 14-day group clock (10.3)"
    );
  }

  // --- 10.2: lock fires only when every present member agrees final_consensus ---
  {
    let result = enterConsensusNoFlags(NOW);
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-alice", subject: "final_consensus" },
      NOW
    );
    assertEqual(result.state.phase, "consensus", "one final_consensus stays in consensus");
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "one agreement does not lock (10.2)"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-bob", subject: "final_consensus" },
      NOW
    );
    assertEqual(result.state.phase, "consensus", "two final_consensus agreements stay in consensus");
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "partial present agreement does not lock (10.2)"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-cara", subject: "final_consensus" },
      NOW
    );
    assertEqual(result.state.phase, "finalized", "all present final_consensus locks (10.2)");
    const locks = ofEngineKind(result.effects, "lockDeliverable");
    assertEqual(locks.length, 1, "explicit consensus emits one lockDeliverable");
    assertEqual(locks[0]?.auto, false, "explicit agreement lock is not auto (10.2)");
    assertEqual(locks[0]?.unresolved, [], "explicit agreement has no unresolved labels");
    assert(
      facilitatorKeys(result.effects).includes("finalize"),
      "explicit lock posts a finalize notice"
    );
    assertEqual(
      result.state.flaggedCriteria,
      [],
      "explicit lock clears scoring flags so they are not shown as unresolved"
    );
  }

  // --- 10.2: explicit lock after a flagged discussion also drops unresolved chips ---
  {
    const discussed = enterDiscussionWithFlags(NOW);
    let result = applyLearnerEvent(
      discussed.state,
      { kind: "message", userId: "u-alice", body: "the prompt never states a goal" },
      NOW
    );
    assertEqual(result.state.phase, "consensus", "precondition: flagged discussion reached consensus");
    assertEqual(result.state.flaggedCriteria, ["clarity"], "scoring flags remain until lock");
    for (const userId of TEAM_MEMBERS) {
      result = applyLearnerEvent(
        result.state,
        { kind: "agreement", userId, subject: "final_consensus" },
        NOW
      );
    }
    assertEqual(result.state.phase, "finalized", "Ready after discussion still locks");
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable")[0]?.unresolved,
      [],
      "explicit lock after discussion has no unresolved labels"
    );
    assertEqual(
      result.state.flaggedCriteria,
      [],
      "explicit lock after discussion does not keep scoring flags"
    );
  }

  // --- 10.3: consensus 14-day silence auto-synthesizes and locks ---
  {
    const started = enterConsensusNoFlags(NOW);
    const justUnder = evaluateTeam(
      started.state,
      new Date(NOW.getTime() + GROUP_SILENCE_MS - 1)
    );
    assertEqual(justUnder.state.phase, "consensus", "just under 14 days stays in consensus");
    assertEqual(
      ofEngineKind(justUnder.effects, "lockDeliverable"),
      [],
      "just under 14 days does not lock consensus"
    );

    const silenceAt = new Date(NOW.getTime() + GROUP_SILENCE_MS);
    const result = evaluateTeam(started.state, silenceAt);
    assertEqual(result.state.phase, "finalized", "14-day consensus silence finalizes (10.3)");
    const locks = ofEngineKind(result.effects, "lockDeliverable");
    assertEqual(locks.length, 1, "consensus timeout emits one lockDeliverable");
    assertEqual(locks[0]?.auto, true, "consensus timeout lock is auto (10.3)");

    const replayed = evaluateTeam(result.state, silenceAt);
    assertEqual(
      replayed.effects,
      [],
      "double-evaluateTeam after consensus lock yields no new effects (11.5)"
    );
  }

  // --- 10.3: consensus timeout after flagged discussion labels unresolved criteria ---
  {
    const discussed = enterDiscussionWithFlags(NOW);
    const consensus = applyLearnerEvent(
      discussed.state,
      { kind: "message", userId: "u-alice", body: "here is my evidence" },
      NOW
    );
    assertEqual(consensus.state.phase, "consensus", "precondition: team reached consensus");
    const result = evaluateTeam(
      consensus.state,
      new Date(NOW.getTime() + GROUP_SILENCE_MS)
    );
    assertEqual(result.state.phase, "finalized", "flagged-path consensus timeout still locks");
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable")[0]?.unresolved,
      ["clarity"],
      "timeout after disagreement labels the unresolved criterion (10.3)"
    );
  }

  // --- 11.5: evaluateTeam / applyLearnerEvent after finalized produce no new effects ---
  {
    let result = enterConsensusNoFlags(NOW);
    for (const userId of TEAM_MEMBERS) {
      result = applyLearnerEvent(
        result.state,
        { kind: "agreement", userId, subject: "final_consensus" },
        NOW
      );
    }
    assertEqual(result.state.phase, "finalized", "precondition: team is locked");
    const locked = result.state;

    const evaluated = evaluateTeam(locked, NOW);
    assertEqual(evaluated.effects, [], "evaluateTeam after finalized emits nothing (11.5)");
    assertEqual(evaluated.state.phase, "finalized", "evaluateTeam after finalized stays locked");

    const replayed = evaluateTeam(evaluated.state, NOW);
    assertEqual(
      replayed.effects,
      [],
      "double-evaluateTeam on a finalized team yields no new effects (11.5)"
    );

    const messaged = applyLearnerEvent(
      locked,
      { kind: "message", userId: "u-alice", body: "trying to reopen" },
      NOW
    );
    assertEqual(messaged.effects, [], "message after lock emits no effects (11.5)");
    assertEqual(messaged.state.phase, "finalized", "message after lock does not reopen");

    const edited = applyLearnerEvent(
      locked,
      { kind: "docSnapshot", userId: "u-alice", docKind: "rubric" },
      NOW
    );
    assertEqual(edited.effects, [], "post-lock docSnapshot emits no effects (10.4, 11.5)");
    assertEqual(edited.state, locked, "post-lock docSnapshot is rejected (no state change)");
    assertEqual(edited.state.phase, "finalized", "post-lock snapshot leaves the team finalized");

    const agreed = applyLearnerEvent(
      locked,
      { kind: "agreement", userId: "u-alice", subject: "final_consensus" },
      NOW
    );
    assertEqual(agreed.effects, [], "repeat agreement after lock emits no effects (11.5)");
  }

  // --- 10.5: late return before lock joins the current phase; no rollback ---
  {
    const started = enterDiscussionWithTwoFlags(NOW);
    let result = evaluateTeam(
      started.state,
      new Date(NOW.getTime() + DISCUSSION_DEADLINE_MS)
    );
    assert(
      result.state.absenceStepKeys.some(
        (entry) => entry.userId === "u-alice" && entry.stepKey === "discussion:clarity"
      ),
      "precondition: alice is absent for the clarity exchange"
    );
    assertEqual(result.state.phase, "discussion", "precondition: still in discussion");

    const beforeReturn = result.state;
    result = applyLearnerEvent(
      beforeReturn,
      { kind: "memberReturned", userId: "u-alice" },
      NOW
    );
    assertEqual(result.state.phase, "discussion", "return keeps the current discussion phase (10.5)");
    assertEqual(
      result.state.phase === "scoring" || result.state.phase === "critique",
      false,
      "return does not roll the team back to a prior phase (10.5)"
    );
    assertEqual(
      result.state.flaggedCriteria,
      beforeReturn.flaggedCriteria,
      "return does not undo flagged criteria"
    );
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "a late return before lock does not lock"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "message", userId: "u-alice", body: "I am back; here is my clarity evidence" },
      NOW
    );
    assert(
      result.state.phase === "discussion" || result.state.phase === "consensus",
      "returner participates from the current point (10.5)"
    );
    assert(
      result.state.phase !== "scoring" && result.state.phase !== "critique",
      "returner activity does not replay scoring or critique"
    );
  }

  // --- 10.5: late return during consensus stays in consensus ---
  {
    const started = enterDiscussionWithFlags(NOW);
    let result = applyLearnerEvent(
      started.state,
      { kind: "message", userId: "u-alice", body: "alice answers the exchange" },
      NOW
    );
    assertEqual(result.state.phase, "consensus", "precondition: team is in consensus");

    result = applyLearnerEvent(
      result.state,
      { kind: "memberReturned", userId: "u-cara" },
      NOW
    );
    assertEqual(result.state.phase, "consensus", "return during consensus stays in consensus (10.5)");
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "return during consensus does not lock"
    );

    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-cara", subject: "final_consensus" },
      NOW
    );
    assertEqual(result.state.phase, "consensus", "one returner agreement does not lock alone");
  }

  // ========================================================================
  // Task 2.6 — coverage matrix gaps + double-evaluate idempotency
  // ========================================================================

  // --- 2.6: operator-selected trio uses the same startTeam path as automatic quorum ---
  {
    const leftoverTrio: [string, string, string] = ["u-d", "u-e", "u-f"];
    const autoEffects = evaluateQueue(
      [
        checkIn({ id: "c1", userId: "u1", checkedInAt: isoMsAgo(6 * MS_PER_DAY) }),
        checkIn({ id: "c2", userId: "u2", checkedInAt: isoMsAgo(5 * MS_PER_DAY) }),
        checkIn({ id: "c3", userId: "u3", checkedInAt: isoMsAgo(4 * MS_PER_DAY) }),
        checkIn({ id: "c-d", userId: "u-d", checkedInAt: isoMsAgo(3 * MS_PER_DAY) }),
        checkIn({ id: "c-e", userId: "u-e", checkedInAt: isoMsAgo(2 * MS_PER_DAY) }),
        checkIn({ id: "c-f", userId: "u-f", checkedInAt: isoMsAgo(1 * MS_PER_DAY) }),
      ],
      NOW
    );
    const autoSecond = ofKind(autoEffects, "formTeam")[1];
    assertEqual(
      autoSecond?.memberUserIds,
      leftoverTrio,
      "precondition: automatic quorum would form this later trio second"
    );
    const manual = startTeam(leftoverTrio, NOW);
    const automatic = startTeam(autoSecond?.memberUserIds ?? leftoverTrio, NOW);
    assertEqual(
      manual.state.phase,
      automatic.state.phase,
      "manual trio uses the same startTeam path as automatic quorum"
    );
    assertEqual(manual.state.round, 1, "manual match opens critique round 1 like automatic quorum");
    assert(
      facilitatorKeys(manual.effects).includes("kickoff_recap"),
      "manual match posts the same kickoff recap as automatic quorum (2.6)"
    );
    assertEqual(
      ofEngineKind(manual.effects, "sendNotice").filter(
        (effect) => effect.notice.kind === "team_formed"
      ).length,
      3,
      "manual trio still notifies all three members (2.6)"
    );
    assertEqual(
      manual.state,
      automatic.state,
      "startTeam state is identical for the same trio whether auto or manual (2.6)"
    );
  }

  // --- 4.5: group-clock auto-finalize is phase-gated (critique / scoring never lock) ---
  {
    const started = startTeam(TEAM_MEMBERS, NOW);
    const withExpiredGroup: TeamStateRecord = {
      ...started.state,
      groupDeadline: NOW.toISOString(),
    };
    const result = evaluateTeam(withExpiredGroup, NOW);
    assertEqual(
      result.state.phase,
      "critique",
      "expired group clock does not auto-finalize critique (4.5)"
    );
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "critique ignores an expired group clock (4.5)"
    );
  }
  {
    const started = enterScoringViaAgreements(NOW);
    const withExpiredGroup: TeamStateRecord = {
      ...started.state,
      groupDeadline: NOW.toISOString(),
    };
    const result = evaluateTeam(withExpiredGroup, NOW);
    assertEqual(
      result.state.phase,
      "scoring",
      "expired group clock does not auto-finalize scoring (4.5)"
    );
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "scoring ignores an expired group clock (4.5)"
    );
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [],
      "a planted group clock does not reveal scores"
    );
  }

  // --- 4.6: returning absent member during merge joins merge, no critique replay ---
  {
    let result = startTeam(TEAM_MEMBERS, NOW);
    result = markAbsent(result.state, "u-alice", NOW);
    result = completeRound(result.state, "u-alice", ["u-bob", "u-cara"], NOW);
    while (result.state.phase === "critique") {
      const roles = getCritiqueRoles(result.state);
      result = completeRound(result.state, roles.presenterUserId, roles.criticUserIds, NOW);
    }
    assertEqual(result.state.phase, "merge", "precondition: skipped-presenter team reached merge");
    const beforeReturn = result.state;
    result = applyLearnerEvent(
      beforeReturn,
      { kind: "memberReturned", userId: "u-alice" },
      NOW
    );
    assertEqual(result.state.phase, "merge", "return during merge stays in merge (4.6)");
    assertEqual(result.state.round, beforeReturn.round, "return during merge does not replay rounds");
    result = applyLearnerEvent(
      result.state,
      { kind: "docSnapshot", userId: "u-alice", docKind: "rubric" },
      NOW
    );
    assert(
      result.state.respondedUserIds.includes("u-alice"),
      "returner can contribute in merge from the current point (4.6)"
    );
  }

  // --- 7.4: notes docSnapshot resets group + actor clock only (same as rubric) ---
  {
    const started = completeAllCritiqueRounds(NOW);
    const bobBefore = deadlineOfStep(started.state, "u-bob", "merge");
    const caraBefore = deadlineOfStep(started.state, "u-cara", "merge");
    const later = new Date(NOW.getTime() + 30 * 60 * 1000);
    const result = applyLearnerEvent(
      started.state,
      { kind: "docSnapshot", userId: "u-alice", docKind: "notes" },
      later
    );
    assertEqual(
      deadlineOfStep(result.state, "u-alice", "merge"),
      new Date(later.getTime() + MERGE_NUDGE_MS).toISOString(),
      "notes docSnapshot resets only the editor's per-person clock (7.4, 4.3)"
    );
    assertEqual(
      deadlineOfStep(result.state, "u-bob", "merge"),
      bobBefore,
      "notes docSnapshot does not reset bob's per-person clock (7.4, 4.3)"
    );
    assertEqual(
      deadlineOfStep(result.state, "u-cara", "merge"),
      caraBefore,
      "notes docSnapshot does not reset cara's per-person clock"
    );
    assertEqual(
      result.state.groupDeadline,
      new Date(later.getTime() + GROUP_SILENCE_MS).toISOString(),
      "notes docSnapshot resets the group clock (7.4, 4.3)"
    );
    assertEqual(result.state.phase, "merge", "notes snapshot does not leave merge");
  }

  // --- 8.4: two present submitters reveal without waiting for an already-absent member ---
  {
    let result = enterScoringViaAgreements(NOW);
    const withCaraAbsent: TeamStateRecord = {
      ...result.state,
      absenceStepKeys: [
        ...result.state.absenceStepKeys,
        { userId: "u-cara", stepKey: "scoring" },
      ],
    };
    result = submitScores(withCaraAbsent, "u-alice", NOW);
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [],
      "one of two present submissions does not reveal"
    );
    result = submitScores(result.state, "u-bob", NOW);
    assertEqual(
      ofEngineKind(result.effects, "revealScores"),
      [{ kind: "revealScores" }],
      "two present submitters reveal without waiting for an absent member (8.4)"
    );
  }

  // --- 10.2: two present agreements lock when the third is absent for consensus ---
  {
    let result = enterConsensusNoFlags(NOW);
    const withCaraAbsent: TeamStateRecord = {
      ...result.state,
      absenceStepKeys: [
        ...result.state.absenceStepKeys,
        { userId: "u-cara", stepKey: "consensus" },
      ],
    };
    result = applyLearnerEvent(
      withCaraAbsent,
      { kind: "agreement", userId: "u-alice", subject: "final_consensus" },
      NOW
    );
    assertEqual(
      result.state.phase,
      "consensus",
      "one of two present agreements stays in consensus"
    );
    assertEqual(
      ofEngineKind(result.effects, "lockDeliverable"),
      [],
      "partial present agreement does not lock when one member is absent"
    );
    result = applyLearnerEvent(
      result.state,
      { kind: "agreement", userId: "u-bob", subject: "final_consensus" },
      NOW
    );
    assertEqual(
      result.state.phase,
      "finalized",
      "two present agreements lock when the third is absent (10.2)"
    );
    const locks = ofEngineKind(result.effects, "lockDeliverable");
    assertEqual(locks.length, 1, "two-present consensus emits one lockDeliverable");
    assertEqual(locks[0]?.auto, false, "two-present explicit lock is not auto (10.2)");
  }

  // --- 10.6: return after lock keeps the group artifact unchanged ---
  {
    let result = enterConsensusNoFlags(NOW);
    for (const userId of TEAM_MEMBERS) {
      result = applyLearnerEvent(
        result.state,
        { kind: "agreement", userId, subject: "final_consensus" },
        NOW
      );
    }
    assertEqual(result.state.phase, "finalized", "precondition: team is locked");
    const locked = result.state;
    const returned = applyLearnerEvent(
      locked,
      { kind: "memberReturned", userId: "u-alice" },
      NOW
    );
    assertEqual(returned.effects, [], "post-lock memberReturned emits no effects (10.6)");
    assertEqual(
      returned.state,
      locked,
      "post-lock return leaves the locked artifact unchanged (10.6)"
    );
    assertEqual(returned.state.phase, "finalized", "post-lock return stays finalized (10.6)");
  }

  // --- 11.5: double-evaluateQueue after applying first-pass effects is a no-op ---
  {
    const trio = [
      checkIn({ id: "q-a", userId: "u-a", checkedInAt: isoMsAgo(3 * MS_PER_DAY) }),
      checkIn({ id: "q-b", userId: "u-b", checkedInAt: isoMsAgo(2 * MS_PER_DAY) }),
      checkIn({ id: "q-c", userId: "u-c", checkedInAt: isoMsAgo(1 * MS_PER_DAY) }),
    ];
    const first = evaluateQueue(trio, NOW);
    assertEqual(ofKind(first, "formTeam").length, 1, "precondition: first pass forms a team");
    const second = evaluateQueue(applyQueueEffects(trio, first, NOW), NOW);
    assertEqual(
      second,
      [],
      "double-evaluateQueue after applying formTeam yields no new effects"
    );
  }
  {
    const waiter = [
      checkIn({
        id: "q-ping",
        userId: "u-ping-idemp",
        checkedInAt: isoMsAgo(QUEUE_PING_MS),
      }),
    ];
    const first = evaluateQueue(waiter, NOW);
    assertEqual(
      ofKind(first, "sendNotice").filter((effect) => effect.notice.kind === "queue_ping")
        .length,
      1,
      "precondition: first pass emits a queue_ping"
    );
    const second = evaluateQueue(applyQueueEffects(waiter, first, NOW), NOW);
    assertEqual(
      ofKind(second, "sendNotice"),
      [],
      "double-evaluateQueue after applying a ping yields no new effects"
    );
    assertEqual(ofKind(second, "expireCheckIn"), [], "applied ping does not expire at the same clock");
  }
  {
    const expiring = [
      checkIn({
        id: "q-exp-idemp",
        userId: "u-exp-idemp",
        checkedInAt: isoMsAgo(12 * MS_PER_DAY),
        lastPingAt: isoMsAgo(QUEUE_PING_MS),
        missedPings: QUEUE_EXPIRY_MISSED_PINGS,
      }),
    ];
    const first = evaluateQueue(expiring, NOW);
    assertEqual(ofKind(first, "expireCheckIn").length, 1, "precondition: first pass expires");
    const second = evaluateQueue(applyQueueEffects(expiring, first, NOW), NOW);
    assertEqual(
      second,
      [],
      "double-evaluateQueue after applying expireCheckIn yields no new effects"
    );
  }

  // --- 11.5: double-evaluateTeam at the same clock is a no-op in every phase ---
  {
    const phaseStates: Array<{ name: string; state: TeamStateRecord }> = [
      { name: "critique", state: startTeam(TEAM_MEMBERS, NOW).state },
      { name: "merge", state: completeAllCritiqueRounds(NOW).state },
      { name: "scoring", state: enterScoringViaAgreements(NOW).state },
      { name: "discussion", state: enterDiscussionWithFlags(NOW).state },
      { name: "consensus", state: enterConsensusNoFlags(NOW).state },
    ];
    for (const { name, state } of phaseStates) {
      const first = evaluateTeam(state, NOW);
      const second = evaluateTeam(first.state, NOW);
      assertEqual(
        second.effects,
        [],
        `double-evaluateTeam in ${name} at the same clock yields no new effects (11.5)`
      );
    }
    let locked = enterConsensusNoFlags(NOW);
    for (const userId of TEAM_MEMBERS) {
      locked = applyLearnerEvent(
        locked.state,
        { kind: "agreement", userId, subject: "final_consensus" },
        NOW
      );
    }
    const firstLocked = evaluateTeam(locked.state, NOW);
    const secondLocked = evaluateTeam(firstLocked.state, NOW);
    assertEqual(
      secondLocked.effects,
      [],
      "double-evaluateTeam in finalized at the same clock yields no new effects (11.5)"
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("engine.selftest: all assertions passed");
}

main();
