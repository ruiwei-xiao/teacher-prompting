/**
 * Self-test: cron tick endpoint (Task 4.6).
 * JSON store + handler functions; CRON_SECRET is injected via env + header.
 *
 * Run: npx tsx lib/calibration-api/tick.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  CRITIQUE_DEADLINE_MS,
  QUEUE_PING_MS,
} from "../calibration-store/types";

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

const offeringInput = {
  title: "Rubric Calibration Pilot",
  sampleAppId: "app_sample_bot",
  sampleRubric: "Criterion 1: clarity\nCriterion 2: evidence",
  deploymentBrief: "Deploy the tutor for week-3 lab.",
  transcriptExcerpt: "Student: ...\nTutor: ...",
  aiProvider: "openai",
  aiModel: "gpt-4o-mini",
};

const CRON_SECRET = "tick-selftest-secret";

function cronHeaders(secret?: string): Headers {
  const headers = new Headers();
  if (secret !== undefined) {
    headers.set("authorization", `Bearer ${secret}`);
  }
  return headers;
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;
  const previousCronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = CRON_SECRET;

  const tempDir = path.join(process.cwd(), ".data", "calibration-api-tick-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");
  process.env.CALIBRATION_NOTICES_LOG = path.join(tempDir, "notices.log");

  const { postTick } = await import("./tick");
  const { createOffering } = await import("./offerings");
  const { executeEffects } = await import("./space");
  const { startTeam } = await import("../calibration-engine/engine");
  const {
    checkIn,
    formTeam,
    hasNotice,
    listAbsences,
  } = await import("../calibration-store/store");

  try {
    const now = new Date("2026-08-15T12:00:00.000Z");
    const operatorId = "op_tick";

    const created = await createOffering(operatorId, offeringInput);
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");

    // --- missing / wrong secret → 401 ---
    const savedSecret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    assertEqual(
      (await postTick(cronHeaders("anything"), { now })).status,
      401,
      "unset CRON_SECRET → 401"
    );
    process.env.CRON_SECRET = savedSecret;

    assertEqual(
      (await postTick(cronHeaders(), { now })).status,
      401,
      "missing Authorization header → 401"
    );
    assertEqual(
      (await postTick(cronHeaders("wrong-secret"), { now })).status,
      401,
      "wrong CRON_SECRET → 401"
    );

    // --- 6d+ queued check-in emits queue_ping once ---
    const waiter = "user_queue_waiter";
    const sixDaysAgo = new Date(now.getTime() - QUEUE_PING_MS);
    await checkIn(offering!.id, waiter, sixDaysAgo);
    const pingKey = `${offering!.id}:${waiter}:queue_ping:1`;

    const firstPing = await postTick(cronHeaders(CRON_SECRET), { now });
    assertEqual(firstPing.status, 200, "authorized tick → 200");
    assert(firstPing.ok === true, "authorized tick ok");
    if (firstPing.ok) {
      assert(
        typeof firstPing.body.evaluatedTeams === "number",
        "summary includes evaluatedTeams"
      );
      assert(
        typeof firstPing.body.evaluatedQueues === "number",
        "summary includes evaluatedQueues"
      );
      assert(
        typeof firstPing.body.effects === "number",
        "summary includes effects"
      );
      assert(
        firstPing.body.evaluatedQueues >= 1,
        "first ping tick evaluated the queue"
      );
      assert(firstPing.body.effects >= 1, "first ping tick executed effects");
      assert(
        firstPing.body.notices.sent >= 1,
        "first ping tick sent at least one notice"
      );
    }
    assert(await hasNotice(pingKey), "6d+ queued check-in emits queue_ping once");

    const secondPing = await postTick(cronHeaders(CRON_SECRET), { now });
    assertEqual(secondPing.status, 200, "second ping tick → 200");
    assert(secondPing.ok === true, "second ping tick ok");
    if (secondPing.ok) {
      assertEqual(
        secondPing.body.notices.sent,
        0,
        "second tick same now → 0 new notices"
      );
    }

    // --- expired critique clock marks absence once ---
    const createdTeamOffering = await createOffering(operatorId, {
      ...offeringInput,
      title: "Tick absence offering",
    });
    const teamOffering =
      createdTeamOffering.ok && "offering" in createdTeamOffering.body
        ? createdTeamOffering.body.offering
        : null;
    assert(teamOffering !== null, "absence offering created");

    const presenter = "user_tick_a";
    const criticB = "user_tick_b";
    const criticC = "user_tick_c";
    const formedAt = now;
    const team = await formTeam(teamOffering!.id, [presenter, criticB, criticC]);
    const started = startTeam([presenter, criticB, criticC], formedAt);
    await executeEffects(team.id, started.state, started.effects, formedAt);

    const expiredClock = new Date(formedAt.getTime() + CRITIQUE_DEADLINE_MS);
    const firstAbsence = await postTick(cronHeaders(CRON_SECRET), {
      now: expiredClock,
    });
    assertEqual(firstAbsence.status, 200, "absence tick → 200");
    const absencesAfterFirst = await listAbsences(team.id);
    assert(
      absencesAfterFirst.length >= 1,
      "tick with expired critique clock marks absence once"
    );
    assert(
      absencesAfterFirst.some(
        (row) => row.userId === presenter && row.stepKey === "critique:1"
      ),
      "presenter is marked absent for critique round 1"
    );

    const secondAbsence = await postTick(cronHeaders(CRON_SECRET), {
      now: expiredClock,
    });
    assertEqual(secondAbsence.status, 200, "second absence tick → 200");
    const absencesAfterSecond = await listAbsences(team.id);
    assertEqual(
      absencesAfterSecond.length,
      absencesAfterFirst.length,
      "second tick same now → no new absences"
    );
    if (firstAbsence.ok) {
      assert(
        typeof firstAbsence.body.evaluatedTeams === "number" &&
          firstAbsence.body.evaluatedTeams >= 1,
        "absence tick summary includes evaluatedTeams"
      );
      assert(
        typeof firstAbsence.body.evaluatedQueues === "number",
        "absence tick summary includes evaluatedQueues"
      );
      assert(
        typeof firstAbsence.body.effects === "number",
        "absence tick summary includes effects"
      );
    }

    const vercelPath = path.join(process.cwd(), "vercel.json");
    const vercelRaw = await fs.readFile(vercelPath, "utf-8");
    const vercel = JSON.parse(vercelRaw) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    assert(
      vercel.crons?.some(
        (entry) =>
          entry.path === "/api/calibration/tick" && entry.schedule === "0 6 * * *"
      ) === true,
      "vercel.json daily cron points at /api/calibration/tick"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (previousCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousCronSecret;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api tick (CRON_SECRET, queue_ping idempotency, absence idempotency, summary, vercel cron)"
  );
}

void main();
