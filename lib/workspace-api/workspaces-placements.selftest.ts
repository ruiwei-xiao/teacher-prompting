/**
 * Self-test: WorkspacesAPI placement handlers (Task 3.1).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-placements.selftest.ts
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
  assistedAuthoringMode?: boolean
): AppConfig {
  const now = new Date().toISOString();
  return {
    id,
    ownerId,
    name: `App ${id}`,
    provider: "openai",
    model: "gpt-4o",
    apiKey: "secret-key",
    ...(assistedAuthoringMode !== undefined ? { assistedAuthoringMode } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

async function writeWorkspaceAssistedAuthoringDefault(
  workspaceId: string,
  value: boolean | "missing"
): Promise<void> {
  const dataFile = process.env.WORKSPACES_DATA_FILE;
  if (!dataFile) {
    throw new Error("WORKSPACES_DATA_FILE is required for AA default mutation");
  }
  const parsed = JSON.parse(await fs.readFile(dataFile, "utf-8")) as {
    workspaces: Array<Record<string, unknown> & { id: string }>;
  };
  const workspace = parsed.workspaces.find((row) => row.id === workspaceId);
  if (!workspace) {
    throw new Error(`workspace ${workspaceId} not found for AA default mutation`);
  }
  if (value === "missing") {
    delete workspace.assistedAuthoringModeDefault;
  } else {
    workspace.assistedAuthoringModeDefault = value;
  }
  await fs.writeFile(dataFile, JSON.stringify(parsed, null, 2), "utf-8");
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

  const tempDir = path.join(
    process.cwd(),
    ".data",
    "workspaces-placements-selftest"
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const {
    listWorkspacePlacements,
    placeWorkspaceBot,
    unplaceWorkspaceBot,
  } = await import("./workspaces-placements");
  const {
    addMember,
    createWorkspace,
    listActivity,
    listPlacements,
    updateWorkspace,
  } = await import("../workspace-store/store");
  const { getAppById, updateApp } = await import("../app-store/store");

  const ownerId = "owner_1";
  const facId = "fac_1";
  const partId = "part_1";
  const strangerId = "stranger_1";

  const ownerBot = "bot_owner";
  const partBot = "bot_part";
  const facBot = "bot_fac";
  const aaFirstBot = "bot_aa_first";
  const aaLaterBot = "bot_aa_later";
  const aaMissingDefaultBot = "bot_aa_missing_default";

  await withTempApps(
    [
      stubApp(ownerBot, ownerId),
      stubApp(partBot, partId),
      stubApp(facBot, facId),
      stubApp(aaFirstBot, ownerId, false),
      stubApp(aaLaterBot, ownerId, false),
      stubApp(aaMissingDefaultBot, ownerId, true),
    ],
    async () => {
      try {
        // --- Unauthorized ---
        assertEqual(
          (await listWorkspacePlacements(null, "any")).status,
          401,
          "GET placements without auth → 401"
        );
        assertEqual(
          (await placeWorkspaceBot(null, "any", { appId: ownerBot })).status,
          401,
          "POST place without auth → 401"
        );
        assertEqual(
          (await unplaceWorkspaceBot(null, "any", { appId: ownerBot })).status,
          401,
          "DELETE unplace without auth → 401"
        );

        const ws = await createWorkspace({
          name: "Placement Lab",
          ownerUserId: ownerId,
        });
        await addMember({
          workspaceId: ws.id,
          userId: facId,
          role: "facilitator",
        });
        await addMember({
          workspaceId: ws.id,
          userId: partId,
          role: "participant",
        });

        // Defaults: all building permissions off
        assertEqual(
          (await listWorkspacePlacements(strangerId, ws.id)).status,
          403,
          "non-member list → 403"
        );
        assertEqual(
          (await listWorkspacePlacements(ownerId, "missing-ws")).status,
          404,
          "missing workspace list → 404"
        );

        // --- Place: validation ---
        assertEqual(
          (await placeWorkspaceBot(ownerId, ws.id, {})).status,
          400,
          "POST without appId → 400"
        );
        assertEqual(
          (await placeWorkspaceBot(ownerId, ws.id, { appId: "no_such" })).status,
          404,
          "POST unknown bot → 404"
        );
        assertEqual(
          (
            await placeWorkspaceBot(ownerId, ws.id, { appId: partBot })
          ).status,
          403,
          "place non-owned bot → 403"
        );

        // --- Place: Owner with (a) off ---
        const placeOwner = await placeWorkspaceBot(ownerId, ws.id, {
          appId: ownerBot,
        });
        assertEqual(placeOwner.status, 200, "Owner place with (a) off → 200");
        assert(
          placeOwner.ok === true && "ok" in placeOwner.body,
          "place returns ok"
        );

        const afterPlace = await getAppById(ownerBot);
        assertEqual(
          afterPlace?.ownerId,
          ownerId,
          "place keeps single personal owner (4.1)"
        );

        const placedList = await listPlacements(ws.id);
        assertEqual(placedList.length, 1, "placement persisted");
        assertEqual(placedList[0]?.appId, ownerBot, "placed appId");

        const activityAfterPlace = await listActivity(ws.id, {
          viewerRole: "owner",
        });
        assert(
          activityAfterPlace.some(
            (e) =>
              e.type === "bot.placed" &&
              e.actorUserId === ownerId &&
              e.payload.appId === ownerBot
          ),
          "appends bot.placed activity (6.2)"
        );

        // Idempotent place: no duplicate activity
        const activityCount = activityAfterPlace.filter(
          (e) => e.type === "bot.placed" && e.payload.appId === ownerBot
        ).length;
        await placeWorkspaceBot(ownerId, ws.id, { appId: ownerBot });
        const activityAfterIdempotent = await listActivity(ws.id, {
          viewerRole: "owner",
        });
        assertEqual(
          activityAfterIdempotent.filter(
            (e) => e.type === "bot.placed" && e.payload.appId === ownerBot
          ).length,
          activityCount,
          "idempotent place does not re-append activity"
        );

        // --- Participant place with (a) off ---
        assertEqual(
          (await placeWorkspaceBot(partId, ws.id, { appId: partBot })).status,
          403,
          "Participant place with (a) off → 403 (5.2)"
        );

        // --- Facilitator place own with (a) off ---
        assertEqual(
          (await placeWorkspaceBot(facId, ws.id, { appId: facBot })).status,
          200,
          "Facilitator place own with (a) off → 200"
        );

        // --- Participant place with (a) on ---
        await updateWorkspace(ws.id, {
          buildingPermissions: {
            canCreateBots: true,
            canSeeOthersBots: false,
            canShareOutside: false,
            canManageOwnBots: false,
          },
        });
        assertEqual(
          (await placeWorkspaceBot(partId, ws.id, { appId: partBot })).status,
          200,
          "Participant place with (a) on → 200"
        );

        // --- List filtering (permission b) ---
        // (b) off: Participant sees only own; Owner/Facilitator see all
        let listed = await listWorkspacePlacements(partId, ws.id);
        assertEqual(listed.status, 200, "Participant list → 200");
        if (listed.ok) {
          const ids = listed.body.placements.map((p) => p.appId).sort();
          assertEqual(
            ids,
            [partBot],
            "Participant (b off) sees only own placements"
          );
        }

        listed = await listWorkspacePlacements(facId, ws.id);
        assertEqual(listed.status, 200, "Facilitator list → 200");
        if (listed.ok) {
          const ids = listed.body.placements.map((p) => p.appId).sort();
          assertEqual(
            ids,
            [facBot, ownerBot, partBot].sort(),
            "Facilitator sees all placements"
          );
        }

        await updateWorkspace(ws.id, {
          buildingPermissions: {
            canCreateBots: true,
            canSeeOthersBots: true,
            canShareOutside: false,
            canManageOwnBots: false,
          },
        });
        listed = await listWorkspacePlacements(partId, ws.id);
        if (listed.ok) {
          const ids = listed.body.placements.map((p) => p.appId).sort();
          assertEqual(
            ids,
            [facBot, ownerBot, partBot].sort(),
            "Participant (b on) sees all placements"
          );
        }

        // --- Unplace: Participant (d) off ---
        assertEqual(
          (await unplaceWorkspaceBot(partId, ws.id, { appId: partBot })).status,
          403,
          "Participant unplace own with (d) off → 403 (5.8)"
        );

        // --- Facilitator removes another's placement (does not delete bot) ---
        const unplaceOther = await unplaceWorkspaceBot(facId, ws.id, {
          appId: partBot,
        });
        assertEqual(
          unplaceOther.status,
          200,
          "Facilitator unplace other's bot → 200 (4.5)"
        );
        assertEqual(
          (await getAppById(partBot))?.ownerId,
          partId,
          "unplace does not delete bot / keeps owner (4.5)"
        );
        assertEqual(
          (await listPlacements(ws.id)).some((p) => p.appId === partBot),
          false,
          "placement removed from Workspace"
        );
        const activityAfterUnplace = await listActivity(ws.id, {
          viewerRole: "owner",
        });
        assert(
          activityAfterUnplace.some(
            (e) =>
              e.type === "bot.unplaced" &&
              e.actorUserId === facId &&
              e.payload.appId === partBot
          ),
          "appends bot.unplaced activity (6.2)"
        );

        // Re-place for participant (d) on test
        await placeWorkspaceBot(partId, ws.id, { appId: partBot });
        await updateWorkspace(ws.id, {
          buildingPermissions: {
            canCreateBots: true,
            canSeeOthersBots: true,
            canShareOutside: false,
            canManageOwnBots: true,
          },
        });
        assertEqual(
          (await unplaceWorkspaceBot(partId, ws.id, { appId: partBot })).status,
          200,
          "Participant unplace own with (d) on → 200 (5.9)"
        );
        assertEqual(
          (await getAppById(partBot))?.ownerId,
          partId,
          "owner remove keeps bot in My bots (4.4)"
        );

        // --- Participant cannot unplace others ---
        assertEqual(
          (await unplaceWorkspaceBot(partId, ws.id, { appId: ownerBot })).status,
          403,
          "Participant cannot unplace others → 403"
        );

        // --- Unplace validation ---
        assertEqual(
          (await unplaceWorkspaceBot(ownerId, ws.id, {})).status,
          400,
          "DELETE without appId → 400"
        );
        assertEqual(
          (
            await unplaceWorkspaceBot(ownerId, ws.id, { appId: "ghost" })
          ).status,
          404,
          "DELETE missing placement → 404"
        );

        // --- Multi-Workspace place (4.3) ---
        const wsB = await createWorkspace({
          name: "Second Lab",
          ownerUserId: ownerId,
        });
        assertEqual(
          (await placeWorkspaceBot(ownerId, wsB.id, { appId: ownerBot })).status,
          200,
          "same bot placed in second Workspace → 200"
        );
        assertEqual(
          (await getAppById(ownerBot))?.ownerId,
          ownerId,
          "multi-place keeps single owner"
        );
        assertEqual(
          (await listPlacements(ws.id)).some((p) => p.appId === ownerBot),
          true,
          "still placed in first Workspace"
        );
        assertEqual(
          (await listPlacements(wsB.id)).some((p) => p.appId === ownerBot),
          true,
          "also placed in second Workspace"
        );

        // --- Assisted Authoring default on first place (4.3–4.6) ---
        const aaWs = await createWorkspace({
          name: "AA Place Lab",
          ownerUserId: ownerId,
        });
        await writeWorkspaceAssistedAuthoringDefault(aaWs.id, true);

        const firstPlaceAa = await placeWorkspaceBot(ownerId, aaWs.id, {
          appId: aaFirstBot,
        });
        assertEqual(firstPlaceAa.status, 200, "first AA place → 200");
        assertEqual(
          (await getAppById(aaFirstBot))?.assistedAuthoringMode,
          true,
          "first place applies Workspace AA default ON (4.4)"
        );

        await writeWorkspaceAssistedAuthoringDefault(aaWs.id, false);
        assertEqual(
          (await getAppById(aaFirstBot))?.assistedAuthoringMode,
          true,
          "changing Workspace default later does not rewrite placed bot (4.5)"
        );

        await placeWorkspaceBot(ownerId, aaWs.id, { appId: aaFirstBot });
        assertEqual(
          (await getAppById(aaFirstBot))?.assistedAuthoringMode,
          true,
          "idempotent re-place does not re-apply AA default (4.5)"
        );

        const laterPlace = await placeWorkspaceBot(ownerId, aaWs.id, {
          appId: aaLaterBot,
        });
        assertEqual(laterPlace.status, 200, "later bot place → 200");
        assertEqual(
          (await getAppById(aaLaterBot))?.assistedAuthoringMode,
          false,
          "newly placed bot matches current Workspace default OFF (4.4)"
        );

        const settingsOverride = await updateApp(aaFirstBot, {
          assistedAuthoringMode: false,
        });
        assertEqual(
          settingsOverride?.assistedAuthoringMode,
          false,
          "bot Settings updateApp is not blocked by Workspace default (4.6)"
        );
        assertEqual(
          (await getAppById(aaFirstBot))?.assistedAuthoringMode,
          false,
          "per-bot Settings change persists after place"
        );

        const missingFieldWs = await createWorkspace({
          name: "AA Missing Default",
          ownerUserId: ownerId,
        });
        await writeWorkspaceAssistedAuthoringDefault(missingFieldWs.id, "missing");
        assertEqual(
          (
            await placeWorkspaceBot(ownerId, missingFieldWs.id, {
              appId: aaMissingDefaultBot,
            })
          ).status,
          200,
          "place into workspace with missing AA default → 200"
        );
        assertEqual(
          (await getAppById(aaMissingDefaultBot))?.assistedAuthoringMode,
          false,
          "missing Workspace AA default applies as false (4.4)"
        );

        if (failures === 0) {
          console.log("workspaces-placements.selftest: all assertions passed");
        } else {
          console.error(
            `workspaces-placements.selftest: ${failures} assertion(s) failed`
          );
          process.exitCode = 1;
        }
      } catch (err) {
        console.error("workspaces-placements.selftest crashed:", err);
        process.exitCode = 1;
      }
    }
  );

  await fs.rm(tempDir, { recursive: true, force: true });
}

main();
