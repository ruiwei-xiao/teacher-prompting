/**
 * Self-test: star eligibility + open targets (Task 1.2).
 * Uses JSON workspace/app stores (auth injected as userId).
 *
 * Run: npx tsx lib/star-api/eligibility.selftest.ts
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

  const tempDir = path.join(process.cwd(), ".data", "star-eligibility-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const { assertCanStar, resolveEligibleStar } = await import("./eligibility");
  const {
    addMember,
    createWorkspace,
    placeApp,
    updateWorkspace,
  } = await import("../workspace-store/store");
  const { peerBotPreviewHref } = await import("../workspace-ui/peer-preview");

  const ownerId = "owner_1";
  const partId = "part_1";
  const strangerId = "stranger_1";

  const ownerBot = "bot_owner";
  const partBot = "bot_part";
  const deletedBot = "bot_deleted";
  const starredAt = "2026-07-21T12:00:00.000Z";

  await withTempApps(
    [stubApp(ownerBot, ownerId), stubApp(partBot, partId)],
    async () => {
      try {
        // --- Own bot eligible → editor open target ---
        const ownAssert = await assertCanStar(ownerId, ownerBot);
        assertEqual(ownAssert, { ok: true, owned: true }, "own bot assertCanStar");

        const ownResolved = await resolveEligibleStar(
          ownerId,
          ownerBot,
          starredAt
        );
        assert(ownResolved != null, "own bot resolveEligibleStar returns entry");
        if (ownResolved) {
          assertEqual(ownResolved.appId, ownerBot, "own resolved appId");
          assertEqual(ownResolved.title, `App ${ownerBot}`, "own resolved title");
          assertEqual(
            ownResolved.description,
            `Description for ${ownerBot}`,
            "own resolved description"
          );
          assertEqual(ownResolved.owned, true, "own resolved owned flag");
          assertEqual(ownResolved.starredAt, starredAt, "own resolved starredAt");
          assertEqual(
            ownResolved.open,
            { kind: "editor", href: `/app/${ownerBot}/editor` },
            "own open target is editor"
          );
        }

        const ws = await createWorkspace({
          name: "Eligibility Lab",
          ownerUserId: ownerId,
        });
        await addMember({
          workspaceId: ws.id,
          userId: partId,
          role: "participant",
        });
        await placeApp(ws.id, ownerBot, ownerId);
        await placeApp(ws.id, partBot, partId);

        // --- Peer hidden (permission b off): Participant denied ---
        const hiddenAssert = await assertCanStar(partId, ownerBot);
        assertEqual(
          hiddenAssert,
          { ok: false, reason: "forbidden" },
          "peer hidden (b off) assertCanStar forbidden"
        );
        assertEqual(
          await resolveEligibleStar(partId, ownerBot, starredAt),
          null,
          "peer hidden omitted from resolveEligibleStar"
        );

        // --- Peer visible (permission b on): Participant allowed → peer open ---
        await updateWorkspace(ws.id, {
          buildingPermissions: {
            canCreateBots: false,
            canSeeOthersBots: true,
            canShareOutside: false,
            canManageOwnBots: false,
          },
        });

        const peerAssert = await assertCanStar(partId, ownerBot);
        assertEqual(
          peerAssert,
          { ok: true, owned: false },
          "peer visible assertCanStar"
        );

        const peerResolved = await resolveEligibleStar(
          partId,
          ownerBot,
          starredAt
        );
        assert(peerResolved != null, "peer visible resolveEligibleStar returns entry");
        if (peerResolved) {
          assertEqual(peerResolved.appId, ownerBot, "peer resolved appId");
          assertEqual(peerResolved.title, `App ${ownerBot}`, "peer resolved title");
          assertEqual(peerResolved.owned, false, "peer resolved owned flag");
          assertEqual(
            peerResolved.open,
            {
              kind: "peer",
              href: peerBotPreviewHref(ws.id, ownerBot),
              workspaceId: ws.id,
            },
            "peer open target is non-edit peer preview"
          );
        }

        // --- Distinct open targets (own editor vs peer preview) ---
        if (ownResolved && peerResolved) {
          assert(
            ownResolved.open.kind !== peerResolved.open.kind,
            "open target kinds differ for own vs peer"
          );
          assert(
            ownResolved.open.href !== peerResolved.open.href,
            "open hrefs differ for own vs peer"
          );
          assert(
            !peerResolved.open.href.includes("/editor"),
            "peer open href is not editor"
          );
        }

        // --- Inaccessible (non-member, bot exists): forbidden / omitted ---
        const inaccessibleAssert = await assertCanStar(strangerId, ownerBot);
        assertEqual(
          inaccessibleAssert,
          { ok: false, reason: "forbidden" },
          "inaccessible assertCanStar forbidden"
        );
        assertEqual(
          await resolveEligibleStar(strangerId, ownerBot, starredAt),
          null,
          "inaccessible omitted from resolveEligibleStar"
        );

        // --- Deleted / missing: not_found / omitted ---
        const missingAssert = await assertCanStar(ownerId, deletedBot);
        assertEqual(
          missingAssert,
          { ok: false, reason: "not_found" },
          "deleted/missing assertCanStar not_found"
        );
        assertEqual(
          await resolveEligibleStar(ownerId, deletedBot, starredAt),
          null,
          "deleted/missing omitted from resolveEligibleStar"
        );

        // --- Unplaced peer bot remains denied even with (b) on ---
        const ghostBot = "bot_unplaced";
        await withTempApps(
          [
            stubApp(ownerBot, ownerId),
            stubApp(partBot, partId),
            stubApp(ghostBot, ownerId),
          ],
          async () => {
            const unplacedAssert = await assertCanStar(partId, ghostBot);
            assertEqual(
              unplacedAssert,
              { ok: false, reason: "forbidden" },
              "unplaced peer bot assertCanStar forbidden"
            );
            assertEqual(
              await resolveEligibleStar(partId, ghostBot, starredAt),
              null,
              "unplaced peer omitted from resolveEligibleStar"
            );
          }
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
  console.log("OK: star-api eligibility selftest passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
