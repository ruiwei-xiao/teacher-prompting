/**
 * Runtime self-test for StarStore persistence (Task 1.1).
 * Forces JSON file mode (no Postgres) for reliable local runs.
 *
 * Run: npx tsx lib/star-store/store.selftest.ts
 */
import fs from "fs/promises";
import path from "path";

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

async function main(): Promise<void> {
  // Force JSON fallback before loading the store module.
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(process.cwd(), ".data", "star-store-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  const dataFile = path.join(tempDir, "stars.json");
  process.env.STARS_DATA_FILE = dataFile;

  const { listStarsForUser, listStarredAppIds, starApp, unstarApp } =
    await import("./store");

  try {
    const userA = "user_a";
    const userB = "user_b";
    const bot1 = "bot_one";
    const bot2 = "bot_two";
    const bot3 = "bot_three";

    // --- empty list ---
    assertEqual(await listStarsForUser(userA), [], "empty list for new user");
    assertEqual(
      [...(await listStarredAppIds(userA))],
      [],
      "empty starred app ids for new user"
    );

    // --- star then list returns that bot first ---
    const t1 = new Date("2026-07-21T10:00:00.000Z");
    const star1 = await starApp(userA, bot1, t1);
    assertEqual(star1.userId, userA, "starApp sets userId");
    assertEqual(star1.appId, bot1, "starApp sets appId");
    assertEqual(star1.starredAt, t1.toISOString(), "starApp sets starredAt");

    const afterFirst = await listStarsForUser(userA);
    assertEqual(afterFirst.length, 1, "list after one star has one row");
    assertEqual(afterFirst[0]?.appId, bot1, "starred bot is first (only) in list");
    assertEqual(
      afterFirst[0]?.starredAt,
      t1.toISOString(),
      "list returns starredAt"
    );

    // --- second star becomes most recently starred (first in list) ---
    const t2 = new Date("2026-07-21T11:00:00.000Z");
    await starApp(userA, bot2, t2);
    const afterSecond = await listStarsForUser(userA);
    assertEqual(
      afterSecond.map((s) => s.appId),
      [bot2, bot1],
      "list ordered by most recently starred first"
    );

    // --- third star ---
    const t3 = new Date("2026-07-21T12:00:00.000Z");
    await starApp(userA, bot3, t3);
    assertEqual(
      (await listStarsForUser(userA)).map((s) => s.appId),
      [bot3, bot2, bot1],
      "newest star is first"
    );

    // --- re-star refreshes starredAt and unique (user, bot) ---
    const t4 = new Date("2026-07-21T13:00:00.000Z");
    const refreshed = await starApp(userA, bot1, t4);
    assertEqual(refreshed.starredAt, t4.toISOString(), "re-star refreshes starredAt");
    const afterRefresh = await listStarsForUser(userA);
    assertEqual(afterRefresh.length, 3, "re-star does not duplicate rows");
    assertEqual(
      afterRefresh.map((s) => s.appId),
      [bot1, bot3, bot2],
      "re-starred bot moves to front"
    );
    assertEqual(
      afterRefresh[0]?.starredAt,
      t4.toISOString(),
      "front row has refreshed starredAt"
    );

    // --- listStarredAppIds helper ---
    const ids = await listStarredAppIds(userA);
    assert(ids instanceof Set, "listStarredAppIds returns a Set");
    assertEqual(
      [...ids].sort(),
      [bot1, bot2, bot3].sort(),
      "listStarredAppIds contains all starred apps"
    );

    // --- account isolation (Req 4.3) ---
    await starApp(userB, bot1, new Date("2026-07-21T14:00:00.000Z"));
    assertEqual(
      (await listStarsForUser(userB)).map((s) => s.appId),
      [bot1],
      "user B sees only their own stars"
    );
    assertEqual(
      (await listStarsForUser(userA)).length,
      3,
      "user A stars unchanged by user B"
    );

    // --- unstar removes from list ---
    await unstarApp(userA, bot3);
    assertEqual(
      (await listStarsForUser(userA)).map((s) => s.appId),
      [bot1, bot2],
      "unstar removes bot from list"
    );
    assert(
      !(await listStarredAppIds(userA)).has(bot3),
      "unstarred app id gone from helper set"
    );

    // --- unstar is idempotent ---
    await unstarApp(userA, bot3);
    await unstarApp(userA, "never_starred");
    assertEqual(
      (await listStarsForUser(userA)).map((s) => s.appId),
      [bot1, bot2],
      "idempotent unstar leaves remaining stars intact"
    );

    // --- default starApp uses current time when at omitted ---
    const before = Date.now();
    const live = await starApp(userA, "bot_live");
    const after = Date.now();
    const liveMs = new Date(live.starredAt).getTime();
    assert(
      liveMs >= before - 1000 && liveMs <= after + 1000,
      "starApp without at uses near-current time"
    );
    assertEqual(
      (await listStarsForUser(userA))[0]?.appId,
      "bot_live",
      "live-starred bot is first"
    );

    // --- JSON file shape (STARS_DATA_FILE / .data/stars.json) ---
    const raw = await fs.readFile(dataFile, "utf-8");
    const parsed = JSON.parse(raw) as { stars?: unknown[] };
    assert(Array.isArray(parsed.stars), "JSON store has stars array");
    assert(
      (parsed.stars ?? []).some(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          (s as { userId?: string; appId?: string }).userId === userA &&
          (s as { appId?: string }).appId === bot1
      ),
      "starred preference persisted in JSON file"
    );
    assert(
      !(parsed.stars ?? []).some(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          (s as { userId?: string; appId?: string }).userId === userA &&
          (s as { appId?: string }).appId === bot3
      ),
      "unstarred preference absent from JSON file"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nstore.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("store.selftest: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
