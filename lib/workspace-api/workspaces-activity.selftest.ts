/**
 * Self-test: WorkspacesAPI activity feed handler (Task 2.4).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-activity.selftest.ts
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

function stubApp(id: string, ownerId: string): AppConfig {
  const now = new Date().toISOString();
  return {
    id,
    ownerId,
    name: `App ${id}`,
    provider: "openai",
    model: "gpt-4o",
    apiKey: "",
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

  const tempDir = path.join(process.cwd(), ".data", "workspaces-activity-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const { listWorkspaceActivity } = await import("./workspaces-activity");
  const {
    addMember,
    appendActivity,
    createWorkspace,
    placeApp,
    updateWorkspace,
  } = await import("../workspace-store/store");

  try {
    // --- Unauthorized ---
    assertEqual(
      (await listWorkspaceActivity(null, "any")).status,
      401,
      "GET activity without auth → 401"
    );

    const ownerId = "owner_1";
    const facId = "fac_1";
    const partId = "part_1";
    const outsiderId = "outsider_1";

    const ws = await createWorkspace({
      name: "Activity Feed Lab",
      ownerUserId: ownerId,
    });
    await addMember({ workspaceId: ws.id, userId: facId, role: "facilitator" });
    await addMember({
      workspaceId: ws.id,
      userId: partId,
      role: "participant",
    });

    // Seed activity + placements
    await placeApp(ws.id, "bot_mine", partId);
    await placeApp(ws.id, "bot_theirs", ownerId);
    await appendActivity({
      workspaceId: ws.id,
      type: "member.joined",
      actorUserId: ownerId,
      payload: { userId: partId, role: "participant" },
    });
    await appendActivity({
      workspaceId: ws.id,
      type: "bot.placed",
      actorUserId: partId,
      payload: { appId: "bot_mine" },
    });
    await appendActivity({
      workspaceId: ws.id,
      type: "bot.placed",
      actorUserId: ownerId,
      payload: { appId: "bot_theirs" },
    });
    await appendActivity({
      workspaceId: ws.id,
      type: "bot.unplaced",
      actorUserId: ownerId,
      payload: { appId: "bot_mine" },
    });
    await appendActivity({
      workspaceId: ws.id,
      type: "workspace.renamed",
      actorUserId: ownerId,
      payload: { from: "A", to: "B" },
    });
    await appendActivity({
      workspaceId: ws.id,
      type: "permissions.updated",
      actorUserId: facId,
      payload: { canSeeOthersBots: true },
    });
    await appendActivity({
      workspaceId: ws.id,
      type: "member.removed",
      actorUserId: ownerId,
      payload: { userId: "gone", role: "participant" },
    });

    // --- Missing workspace ---
    assertEqual(
      (await listWorkspaceActivity(ownerId, "missing-id")).status,
      404,
      "GET activity missing workspace → 404"
    );

    // --- Non-member ---
    assertEqual(
      (await listWorkspaceActivity(outsiderId, ws.id)).status,
      403,
      "GET activity non-member → 403"
    );

    // --- Owner sees facilitation feed (all types, newest-first) ---
    const ownerFeed = await listWorkspaceActivity(ownerId, ws.id);
    assertEqual(ownerFeed.status, 200, "Owner GET activity → 200");
    assert(
      ownerFeed.ok && Array.isArray(ownerFeed.body.events),
      "Owner response has events array"
    );
    if (ownerFeed.ok) {
      const types = ownerFeed.body.events.map((e) => e.type);
      assert(
        types.includes("member.joined") &&
          types.includes("member.removed") &&
          types.includes("workspace.renamed") &&
          types.includes("permissions.updated") &&
          types.includes("bot.placed") &&
          types.includes("bot.unplaced"),
        "Owner sees membership, settings, and bot activity"
      );
      assertEqual(
        types.slice(0, 3),
        ["member.removed", "permissions.updated", "workspace.renamed"],
        "Owner feed is chronological newest-first"
      );
    }

    // --- Facilitator same as owner ---
    const facFeed = await listWorkspaceActivity(facId, ws.id);
    assertEqual(facFeed.status, 200, "Facilitator GET activity → 200");
    if (facFeed.ok && ownerFeed.ok) {
      assertEqual(
        facFeed.body.events.map((e) => e.type),
        ownerFeed.body.events.map((e) => e.type),
        "Facilitator sees same facilitation feed as Owner"
      );
    }

    // --- Participant with (b) off: only own bots via ownership ---
    // Default building permissions have canSeeOthersBots false.
    await withTempApps(
      [stubApp("bot_mine", partId), stubApp("bot_theirs", ownerId)],
      async () => {
        const partOff = await listWorkspaceActivity(partId, ws.id);
        assertEqual(
          partOff.status,
          200,
          "Participant GET activity (b off) → 200"
        );
        if (partOff.ok) {
          const types = partOff.body.events.map((e) => e.type);
          const appIds = partOff.body.events.map((e) => e.payload.appId);
          assert(
            types.every((t) => t === "bot.placed" || t === "bot.unplaced"),
            "Participant (b off) only sees bot place/unplace"
          );
          assert(
            !types.includes("member.joined") &&
              !types.includes("member.removed") &&
              !types.includes("workspace.renamed") &&
              !types.includes("permissions.updated"),
            "Participant does not see facilitation-only membership/settings"
          );
          assertEqual(
            appIds,
            ["bot_mine", "bot_mine"],
            "Participant (b off) only sees activity for owned placed bots"
          );
        }
      }
    );

    // --- Participant with (b) on: all placed appIds ---
    await updateWorkspace(ws.id, {
      buildingPermissions: {
        ...ws.buildingPermissions,
        canSeeOthersBots: true,
      },
    });

    await withTempApps(
      [stubApp("bot_mine", partId), stubApp("bot_theirs", ownerId)],
      async () => {
        const partOn = await listWorkspaceActivity(partId, ws.id);
        assertEqual(
          partOn.status,
          200,
          "Participant GET activity (b on) → 200"
        );
        if (partOn.ok) {
          const appIds = new Set(
            partOn.body.events.map((e) => e.payload.appId)
          );
          assert(
            appIds.has("bot_mine") && appIds.has("bot_theirs"),
            "Participant (b on) sees place/unplace for all placed bots"
          );
          assert(
            partOn.body.events.every(
              (e) => e.type === "bot.placed" || e.type === "bot.unplaced"
            ),
            "Participant (b on) still limited to bot place/unplace types"
          );
        }
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nworkspaces-activity.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("workspaces-activity.selftest: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
