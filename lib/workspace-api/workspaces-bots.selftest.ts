/**
 * Self-test: WorkspacesAPI peer bot snapshot + duplicate (Tasks 3.3, 3.4).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-bots.selftest.ts
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

  const tempDir = path.join(process.cwd(), ".data", "workspaces-bots-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const {
    duplicateWorkspaceBot,
    getWorkspaceBotSnapshot,
  } = await import("./workspaces-bots");
  const {
    addMember,
    createWorkspace,
    placeApp,
    updateWorkspace,
  } = await import("../workspace-store/store");
  const { getAppById } = await import("../app-store/store");

  const ownerId = "owner_1";
  const facId = "fac_1";
  const partId = "part_1";
  const strangerId = "stranger_1";

  const ownerBot = "bot_owner";
  const partBot = "bot_part";

  await withTempApps(
    [stubApp(ownerBot, ownerId), stubApp(partBot, partId)],
    async () => {
      try {
        // --- Unauthorized ---
        assertEqual(
          (await getWorkspaceBotSnapshot(null, "any", ownerBot)).status,
          401,
          "GET snapshot without auth → 401"
        );
        assertEqual(
          (await duplicateWorkspaceBot(null, "any", ownerBot)).status,
          401,
          "POST duplicate without auth → 401"
        );

        const ws = await createWorkspace({
          name: "Peer Inspect Lab",
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
        await placeApp(ws.id, ownerBot, ownerId);
        await placeApp(ws.id, partBot, partId);

        // (b) off by default on create
        assertEqual(
          (await getWorkspaceBotSnapshot(strangerId, ws.id, ownerBot)).status,
          403,
          "Non-member snapshot → 403 (8.1)"
        );
        assertEqual(
          (await duplicateWorkspaceBot(strangerId, ws.id, ownerBot)).status,
          403,
          "Non-member duplicate → 403 (8.1)"
        );

        assertEqual(
          (await getWorkspaceBotSnapshot(ownerId, "missing-ws", ownerBot))
            .status,
          404,
          "Missing workspace → 404"
        );

        assertEqual(
          (await getWorkspaceBotSnapshot(ownerId, ws.id, "ghost-bot")).status,
          404,
          "Unplaced / missing bot → 404"
        );
        assertEqual(
          (await duplicateWorkspaceBot(ownerId, ws.id, "ghost-bot")).status,
          404,
          "Duplicate unplaced bot → 404"
        );

        // --- Permission (b) off: Participant cannot inspect others (5.3) ---
        assertEqual(
          (await getWorkspaceBotSnapshot(partId, ws.id, ownerBot)).status,
          403,
          "Participant (b off) inspect peer → 403 (5.3)"
        );
        assertEqual(
          (await duplicateWorkspaceBot(partId, ws.id, ownerBot)).status,
          403,
          "Participant (b off) duplicate peer → 403 (5.3)"
        );

        // Own placed bot still visible
        const ownSnap = await getWorkspaceBotSnapshot(partId, ws.id, partBot);
        assertEqual(ownSnap.status, 200, "Participant inspect own → 200");
        if (ownSnap.ok) {
          assertEqual(ownSnap.body.app.id, partBot, "own snapshot id");
          assert(
            !("apiKey" in ownSnap.body.app),
            "own snapshot omits apiKey"
          );
        }

        // Facilitator always sees others (5.4 / Facilitator rules)
        const facSnap = await getWorkspaceBotSnapshot(facId, ws.id, ownerBot);
        assertEqual(
          facSnap.status,
          200,
          "Facilitator inspect peer with (b) off → 200 (5.4)"
        );
        if (facSnap.ok) {
          assertEqual(facSnap.body.app.name, `App ${ownerBot}`, "name present");
          assertEqual(
            facSnap.body.app.description,
            `Description for ${ownerBot}`,
            "description present"
          );
          assertEqual(
            facSnap.body.app.systemPrompt,
            `System prompt for ${ownerBot}`,
            "systemPrompt present"
          );
          assert(
            facSnap.body.app.builderState != null,
            "builderState present for inspect"
          );
          assert(
            !("apiKey" in facSnap.body.app),
            "peer snapshot omits apiKey (4.6/4.7)"
          );
          assertEqual(
            (facSnap.body.app as { apiKey?: string }).apiKey,
            undefined,
            "apiKey not present on snapshot object"
          );
        }

        // Owner can inspect
        assertEqual(
          (await getWorkspaceBotSnapshot(ownerId, ws.id, partBot)).status,
          200,
          "Owner inspect peer → 200"
        );

        // Facilitator may duplicate even when (b) is off
        const facDup = await duplicateWorkspaceBot(facId, ws.id, ownerBot);
        assertEqual(
          facDup.status,
          200,
          "Facilitator duplicate peer with (b) off → 200"
        );
        if (facDup.ok) {
          assertEqual(facDup.body.app.ownerId, facId, "fork owned by facilitator");
          assertEqual(facDup.body.app.apiKey, "", "fork apiKey empty (4.7)");
          assertEqual(
            facDup.body.app.forkedFromProjectName,
            `App ${ownerBot}`,
            "fork attribution name"
          );
          assert(
            facDup.body.app.id !== ownerBot,
            "fork has distinct id from source"
          );
        }
        const sourceAfterFacDup = await getAppById(ownerBot);
        assertEqual(
          sourceAfterFacDup?.ownerId,
          ownerId,
          "source ownership unchanged after facilitator duplicate"
        );
        assertEqual(
          sourceAfterFacDup?.apiKey,
          "secret-key-must-not-leak",
          "source apiKey unchanged after duplicate"
        );

        // --- Permission (b) on: Participant may inspect others (5.4) ---
        await updateWorkspace(ws.id, {
          buildingPermissions: {
            canCreateBots: false,
            canSeeOthersBots: true,
            canShareOutside: false,
            canManageOwnBots: false,
          },
        });
        const peerSnap = await getWorkspaceBotSnapshot(partId, ws.id, ownerBot);
        assertEqual(
          peerSnap.status,
          200,
          "Participant (b on) inspect peer → 200 (5.4)"
        );
        if (peerSnap.ok) {
          assert(
            !("apiKey" in peerSnap.body.app),
            "Participant peer snapshot strips apiKey"
          );
        }

        const partDup = await duplicateWorkspaceBot(partId, ws.id, ownerBot);
        assertEqual(
          partDup.status,
          200,
          "Participant (b on) duplicate peer → 200 (4.7)"
        );
        if (partDup.ok) {
          assertEqual(
            partDup.body.app.ownerId,
            partId,
            "caller becomes owner of fork"
          );
          assertEqual(partDup.body.app.apiKey, "", "participant fork apiKey empty");
          assertEqual(
            partDup.body.app.systemPrompt,
            `System prompt for ${ownerBot}`,
            "authoring fields copied"
          );
        }
        assertEqual(
          (await getAppById(ownerBot))?.ownerId,
          ownerId,
          "source ownership unchanged after participant duplicate"
        );

        // Own bot duplicate still works for Participant
        const ownDup = await duplicateWorkspaceBot(partId, ws.id, partBot);
        assertEqual(ownDup.status, 200, "Participant duplicate own → 200");
        if (ownDup.ok) {
          assertEqual(ownDup.body.app.ownerId, partId, "own fork owned by caller");
        }

        // --- Non-owner still cannot load via owner-filtered getAppById (PATCH gate, 4.6) ---
        assertEqual(
          await getAppById(ownerBot, partId),
          null,
          "getAppById(owner filter) denies peer — apps PATCH stays owner-only (4.6)"
        );
        assert(
          (await getAppById(ownerBot)) != null,
          "getAppById without owner filter loads bot after ACL path"
        );

        if (failures === 0) {
          console.log("workspaces-bots.selftest: all assertions passed");
        } else {
          console.error(
            `workspaces-bots.selftest: ${failures} assertion(s) failed`
          );
          process.exitCode = 1;
        }
      } catch (err) {
        console.error("workspaces-bots.selftest crashed:", err);
        process.exitCode = 1;
      }
    }
  );

  await fs.rm(tempDir, { recursive: true, force: true });
}

main();
