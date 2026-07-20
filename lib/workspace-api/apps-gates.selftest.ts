/**
 * Self-test: AppsAPIGates — educator outward share (c) and self-delete (d).
 * Run: npx tsx lib/workspace-api/apps-gates.selftest.ts
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

function stubApp(id: string, ownerId: string): AppConfig {
  const now = new Date().toISOString();
  return {
    id,
    ownerId,
    name: `App ${id}`,
    provider: "openai",
    model: "gpt-4o",
    apiKey: "secret-key",
    createdAt: now,
    updatedAt: now,
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

  const tempDir = path.join(process.cwd(), ".data", "apps-gates-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const {
    patchTouchesEducatorOutwardFields,
    assertEducatorOutwardShareGate,
    assertDeleteOwnBotGate,
  } = await import("./apps-gates");
  const {
    addMember,
    createWorkspace,
    placeApp,
    updateWorkspace,
  } = await import("../workspace-store/store");

  // --- Field detection (pure) ---
  assert(
    patchTouchesEducatorOutwardFields({ shareProject: true }) === true,
    "shareProject:true touches educator-outward"
  );
  assert(
    patchTouchesEducatorOutwardFields({ publish: true }) === false,
    "publish alone does not touch educator-outward"
  );
  assert(
    patchTouchesEducatorOutwardFields({
      publish: true,
      name: "x",
    }) === false,
    "publish + name do not touch educator-outward"
  );
  assert(
    patchTouchesEducatorOutwardFields({
      projectShareVisibility: "public",
    }) === true,
    "projectShareVisibility touches educator-outward"
  );
  assert(
    patchTouchesEducatorOutwardFields({ communitySubject: "math" }) === true,
    "communitySubject touches educator-outward"
  );
  assert(
    patchTouchesEducatorOutwardFields({ communityTags: ["a"] }) === true,
    "communityTags touches educator-outward"
  );
  assert(
    patchTouchesEducatorOutwardFields({ shareAuthorName: true }) === true,
    "shareAuthorName touches educator-outward"
  );
  assert(
    patchTouchesEducatorOutwardFields({ shareProject: false }) === false,
    "shareProject:false does not touch (route ignores it)"
  );

  const ownerId = "owner_1";
  const partId = "part_1";
  const botId = "bot_part";

  await withTempApps([stubApp(botId, partId)], async () => {
    const ws = await createWorkspace({ name: "Course", ownerUserId: ownerId });
    await addMember({
      workspaceId: ws.id,
      userId: partId,
      role: "participant",
    });
    await updateWorkspace(ws.id, {
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: true,
        canShareOutside: false,
        canManageOwnBots: false,
      },
    });
    await placeApp(ws.id, botId, partId);

    // --- (c) share with Workspace context ---
    const shareBlocked = await assertEducatorOutwardShareGate({
      userId: partId,
      workspaceId: ws.id,
      body: { shareProject: true },
    });
    assert(
      shareBlocked.ok === false &&
        shareBlocked.status === 403 &&
        typeof shareBlocked.error === "string",
      "Participant shareProject with (c) off + workspaceId → 403"
    );

    const publishOk = await assertEducatorOutwardShareGate({
      userId: partId,
      workspaceId: ws.id,
      body: { publish: true },
    });
    assert(
      publishOk.ok === true,
      "publish with workspaceId and (c) off is not gated by (c)"
    );

    const noContextOk = await assertEducatorOutwardShareGate({
      userId: partId,
      workspaceId: undefined,
      body: { shareProject: true },
    });
    assert(
      noContextOk.ok === true,
      "shareProject without workspaceId ignores (c)"
    );

    await updateWorkspace(ws.id, {
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: true,
        canShareOutside: true,
        canManageOwnBots: false,
      },
    });
    const shareAllowed = await assertEducatorOutwardShareGate({
      userId: partId,
      workspaceId: ws.id,
      body: { shareProject: true, communityTags: ["alg"] },
    });
    assert(shareAllowed.ok === true, "Participant share with (c) on → ok");

    const ownerShare = await assertEducatorOutwardShareGate({
      userId: ownerId,
      workspaceId: ws.id,
      body: { shareProject: true },
    });
    // Owner is not bot owner for this bot; (c) is role/permission on Workspace, not bot ownership.
    // Owner facilitation bypasses (c).
    assert(ownerShare.ok === true, "Owner facilitation bypasses (c) off");

    await updateWorkspace(ws.id, {
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: true,
        canShareOutside: false,
        canManageOwnBots: false,
      },
    });
    const ownerShareCOff = await assertEducatorOutwardShareGate({
      userId: ownerId,
      workspaceId: ws.id,
      body: { projectShareVisibility: "public" },
    });
    assert(
      ownerShareCOff.ok === true,
      "Owner may update educator-outward fields with (c) off"
    );

    // --- (d) delete ---
    const deleteBlocked = await assertDeleteOwnBotGate({
      userId: partId,
      appId: botId,
    });
    assert(
      deleteBlocked.ok === false &&
        deleteBlocked.status === 403 &&
        /manage|policy|permission|delete/i.test(deleteBlocked.error),
      "Participant DELETE with (d) off via placement → 403 with message"
    );

    const deleteWithCtx = await assertDeleteOwnBotGate({
      userId: partId,
      appId: botId,
      workspaceId: ws.id,
    });
    assert(
      deleteWithCtx.ok === false && deleteWithCtx.status === 403,
      "Participant DELETE with explicit workspaceId and (d) off → 403"
    );

    await updateWorkspace(ws.id, {
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: true,
        canShareOutside: false,
        canManageOwnBots: true,
      },
    });
    const deleteAllowed = await assertDeleteOwnBotGate({
      userId: partId,
      appId: botId,
      workspaceId: ws.id,
    });
    assert(deleteAllowed.ok === true, "Participant DELETE with (d) on → ok");

    // Unplaced bot: (d) does not constrain
    const freeBot = "bot_free";
    await withTempApps(
      [stubApp(botId, partId), stubApp(freeBot, partId)],
      async () => {
        const freeDelete = await assertDeleteOwnBotGate({
          userId: partId,
          appId: freeBot,
        });
        assert(
          freeDelete.ok === true,
          "DELETE of unplaced personal bot ignores (d)"
        );
      }
    );
  });

  await fs.rm(tempDir, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`\napps-gates.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("apps-gates.selftest: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
