/**
 * Self-test: Stars API orchestration (Task 2).
 * Uses JSON stores + handler functions (auth injected as userId).
 *
 * Run: npx tsx lib/star-api/stars.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { AppConfig } from "@/lib/app-store/types";

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

function stubApp(
  id: string,
  ownerId: string,
  extras: Partial<AppConfig> = {}
): AppConfig {
  const now = new Date().toISOString();
  return {
    id,
    ownerId,
    name: `App ${id}`,
    description: `Description for ${id}`,
    provider: "openai",
    model: "gpt-4o",
    apiKey: "secret-key-must-not-leak",
    systemPrompt: `System prompt for ${id}`,
    builderState: {
      learningObjective: "Learn",
      learningObjectivePrompt: "",
      uploadedExerciseName: "",
      uploadedExerciseText: "",
      exercisePrompt: "",
      gradeLevel: "9",
      language: "en",
      learnerNotes: "",
      learnerProfilePrompt: "",
      selectedTemplate: "",
      templatePrompt: "",
    },
    createdAt: now,
    updatedAt: now,
    ...extras,
  };
}

async function withTempApps(
  apps: AppConfig[],
  fn: () => Promise<void>
): Promise<void> {
  const appsFile = path.join(process.cwd(), ".data", "apps.json");
  await fs.mkdir(path.dirname(appsFile), { recursive: true });
  let previous: string | null = null;
  try {
    previous = await fs.readFile(appsFile, "utf-8");
  } catch {
    previous = null;
  }
  await fs.writeFile(appsFile, JSON.stringify(apps, null, 2), "utf-8");
  try {
    await fn();
  } finally {
    if (previous === null) {
      await fs.rm(appsFile, { force: true });
    } else {
      await fs.writeFile(appsFile, previous, "utf-8");
    }
  }
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const tempDir = path.join(process.cwd(), ".data", "stars-api-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");
  process.env.STARS_DATA_FILE = path.join(tempDir, "stars.json");

  const { listStars, starBot, unstarBot } = await import("./stars");
  const {
    addMember,
    createWorkspace,
    placeApp,
    updateWorkspace,
  } = await import("../workspace-store/store");
  const { starApp } = await import("../star-store/store");
  const { peerBotPreviewHref } = await import("../workspace-ui/peer-preview");

  const ownerId = "owner_1";
  const partId = "part_1";
  const ownerBot = "bot_owner";
  const partBot = "bot_part";
  const deletedBot = "bot_deleted";

  await withTempApps(
    [stubApp(ownerBot, ownerId), stubApp(partBot, partId)],
    async () => {
      try {
        // --- Unauthorized ---
        assertEqual(
          (await listStars(null)).status,
          401,
          "GET list without auth → 401"
        );
        assertEqual(
          (await starBot(null, ownerBot)).status,
          401,
          "PUT without auth → 401"
        );
        assertEqual(
          (await unstarBot(null, ownerBot)).status,
          401,
          "DELETE without auth → 401"
        );

        // --- Owner stars owned bot ---
        const starred = await starBot(ownerId, ownerBot);
        assertEqual(starred.status, 200, "owner star owned bot → 200");
        assert(
          starred.ok === true &&
            "starred" in starred.body &&
            starred.body.starred === true,
          "owner star returns starred: true"
        );
        assert(
          starred.ok === true &&
            "starredAt" in starred.body &&
            typeof starred.body.starredAt === "string",
          "owner star returns starredAt"
        );

        // --- GET includes owned bot with summary + editor open target ---
        const listed = await listStars(ownerId);
        assertEqual(listed.status, 200, "owner GET → 200");
        assert(listed.ok === true, "owner GET ok");
        if (listed.ok) {
          assertEqual(listed.body.stars.length, 1, "owner GET has one star");
          const entry = listed.body.stars[0];
          assertEqual(entry.appId, ownerBot, "listed appId");
          assertEqual(entry.title, `App ${ownerBot}`, "listed title");
          assertEqual(
            entry.description,
            `Description for ${ownerBot}`,
            "listed description"
          );
          assertEqual(entry.owned, true, "listed owned");
          assertEqual(
            entry.open,
            { kind: "editor", href: `/app/${ownerBot}/editor` },
            "listed open target is editor"
          );
        }

        // --- Order by most recently starred (peer + owned) ---
        const olderAt = new Date("2026-07-20T10:00:00.000Z");
        const newerAt = new Date("2026-07-21T15:00:00.000Z");
        const ws = await createWorkspace({
          name: "Stars Lab",
          ownerUserId: ownerId,
        });
        await addMember({
          workspaceId: ws.id,
          userId: partId,
          role: "participant",
        });
        await placeApp(ws.id, ownerBot, ownerId);
        await placeApp(ws.id, partBot, partId);
        await updateWorkspace(ws.id, {
          buildingPermissions: {
            canCreateBots: false,
            canSeeOthersBots: true,
            canShareOutside: false,
            canManageOwnBots: false,
          },
        });

        // Store-level star with known times (eligibility applied on GET)
        await starApp(ownerId, partBot, olderAt);
        await starApp(ownerId, ownerBot, newerAt);

        const ordered = await listStars(ownerId);
        assertEqual(ordered.status, 200, "ordered GET → 200");
        if (ordered.ok) {
          assertEqual(
            ordered.body.stars.map((s) => s.appId),
            [ownerBot, partBot],
            "GET ordered by most recently starred"
          );
          assertEqual(
            ordered.body.stars[1].open,
            {
              kind: "peer",
              href: peerBotPreviewHref(ws.id, partBot),
              workspaceId: ws.id,
            },
            "peer star open target is peer preview"
          );
        }

        // --- Participant cannot star hidden peer bot ---
        await updateWorkspace(ws.id, {
          buildingPermissions: {
            canCreateBots: false,
            canSeeOthersBots: false,
            canShareOutside: false,
            canManageOwnBots: false,
          },
        });
        const hiddenPut = await starBot(partId, ownerBot);
        assertEqual(
          hiddenPut.status,
          403,
          "Participant star hidden peer → 403"
        );

        // --- Missing bot → 404 ---
        assertEqual(
          (await starBot(ownerId, deletedBot)).status,
          404,
          "star missing bot → 404"
        );

        // --- Deleted bots omitted from GET (store row remains) ---
        await starApp(ownerId, deletedBot, new Date("2026-07-21T16:00:00.000Z"));
        const withDeleted = await listStars(ownerId);
        assertEqual(withDeleted.status, 200, "GET with deleted store row → 200");
        if (withDeleted.ok) {
          assert(
            !withDeleted.body.stars.some((s) => s.appId === deletedBot),
            "deleted bot omitted from GET"
          );
          assert(
            withDeleted.body.stars.every((s) => s.appId === ownerBot || s.appId === partBot),
            "GET only eligible remaining stars"
          );
        }

        // --- DELETE unstars idempotently ---
        const unstarred = await unstarBot(ownerId, ownerBot);
        assertEqual(unstarred.status, 200, "DELETE → 200");
        assert(
          unstarred.ok === true &&
            "starred" in unstarred.body &&
            unstarred.body.starred === false,
          "DELETE returns starred: false"
        );

        const afterUnstar = await listStars(ownerId);
        if (afterUnstar.ok) {
          assert(
            !afterUnstar.body.stars.some((s) => s.appId === ownerBot),
            "unstarred bot absent from GET"
          );
        }

        const unstarAgain = await unstarBot(ownerId, ownerBot);
        assertEqual(unstarAgain.status, 200, "idempotent DELETE → 200");
        assert(
          unstarAgain.ok === true &&
            "starred" in unstarAgain.body &&
            unstarAgain.body.starred === false,
          "idempotent DELETE returns starred: false"
        );
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  );

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("OK: star-api stars selftest passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
