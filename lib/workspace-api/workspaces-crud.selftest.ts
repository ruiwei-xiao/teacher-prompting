/**
 * Self-test: WorkspacesAPI CRUD handlers (Task 2.1 / 5.2).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-crud.selftest.ts
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

  const tempDir = path.join(process.cwd(), ".data", "workspaces-crud-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.WORKSPACES_DATA_FILE = path.join(tempDir, "workspaces.json");

  const {
    createWorkspaces,
    deleteWorkspaceById,
    getWorkspaceById,
    listWorkspaces,
    updateWorkspaceById,
  } = await import("./workspaces-crud");
  const { addMember, listActivity, listWorkspacesForUser, placeApp } =
    await import("../workspace-store/store");
  const { getAppById } = await import("../app-store/store");

  try {
    // --- Unauthorized ---
    assertEqual(
      (await listWorkspaces(null)).status,
      401,
      "GET list without auth → 401"
    );
    assertEqual(
      (await createWorkspaces(null, { name: "X" })).status,
      401,
      "POST without auth → 401"
    );
    assertEqual(
      (await getWorkspaceById(null, "any")).status,
      401,
      "GET one without auth → 401"
    );
    assertEqual(
      (await updateWorkspaceById(null, "any", { name: "Y" })).status,
      401,
      "PATCH without auth → 401"
    );
    assertEqual(
      (await deleteWorkspaceById(null, "any")).status,
      401,
      "DELETE without auth → 401"
    );

    // --- Create + list ---
    const ownerId = "owner_1";
    const created = await createWorkspaces(ownerId, { name: "  Course Hub  " });
    assertEqual(created.status, 200, "Owner create → 200");
    assert(created.ok === true && "workspace" in created.body, "create returns workspace");
    const workspace =
      created.ok && "workspace" in created.body ? created.body.workspace : null;
    assert(workspace !== null, "workspace present");
    assertEqual(workspace!.name, "Course Hub", "create trims name");
    assertEqual(
      workspace!.buildingPermissions,
      {
        canCreateBots: false,
        canSeeOthersBots: false,
        canShareOutside: false,
        canManageOwnBots: false,
      },
      "new Workspace defaults permissions off"
    );
    assertEqual(
      workspace!.buildingPermissions.canSeeOthersBots,
      false,
      "create without permissions overlay leaves (b) off"
    );
    assertEqual(
      workspace!.assistedAuthoringModeDefault,
      false,
      "create Assisted Authoring default is always off"
    );

    const badName = await createWorkspaces(ownerId, { name: "   " });
    assertEqual(badName.status, 400, "empty name → 400");
    const tooLong = await createWorkspaces(ownerId, {
      name: "x".repeat(41),
    });
    assertEqual(tooLong.status, 400, "over-long create name → 400");

    const listed = await listWorkspaces(ownerId);
    assertEqual(listed.status, 200, "list → 200");
    assert(
      listed.ok &&
        listed.body.workspaces.some((w) => w.id === workspace!.id),
      "list includes created Workspace"
    );

    // --- Get as Owner ---
    const got = await getWorkspaceById(ownerId, workspace!.id);
    assertEqual(got.status, 200, "Owner get → 200");
    assert(
      got.ok && got.body.role === "owner",
      "get returns role owner"
    );
    assert(
      got.ok && "assistedAuthoringModeDefault" in got.body.workspace,
      "GET includes assistedAuthoringModeDefault"
    );
    assertEqual(
      got.ok ? got.body.workspace.assistedAuthoringModeDefault : undefined,
      false,
      "GET Assisted Authoring default is off"
    );

    // --- Non-member / missing ---
    assertEqual(
      (await getWorkspaceById("stranger", workspace!.id)).status,
      403,
      "non-member get → 403"
    );
    assertEqual(
      (await getWorkspaceById(ownerId, "missing-id")).status,
      404,
      "missing workspace → 404"
    );

    // --- Facilitator may rename + update permissions ---
    const facId = "fac_1";
    await addMember({
      workspaceId: workspace!.id,
      userId: facId,
      role: "facilitator",
    });
    const renamed = await updateWorkspaceById(facId, workspace!.id, {
      name: "Course Hub Renamed",
    });
    assertEqual(renamed.status, 200, "Facilitator rename → 200");
    assert(
      renamed.ok && renamed.body.workspace.name === "Course Hub Renamed",
      "rename applied"
    );
    assertEqual(
      (
        await updateWorkspaceById(facId, workspace!.id, {
          name: "x".repeat(41),
        })
      ).status,
      400,
      "over-long rename → 400"
    );

    const perms = await updateWorkspaceById(facId, workspace!.id, {
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: false,
        canShareOutside: false,
        canManageOwnBots: false,
      },
    });
    assertEqual(perms.status, 200, "Facilitator permissions → 200");
    assert(
      perms.ok && perms.body.workspace.buildingPermissions.canCreateBots === true,
      "permissions applied"
    );

    const activity = await listActivity(workspace!.id, { viewerRole: "owner" });
    assert(
      activity.some((e) => e.type === "workspace.renamed"),
      "activity append on rename"
    );
    assert(
      activity.some((e) => e.type === "permissions.updated"),
      "activity append on permissions change"
    );

    // --- Participant forbidden on settings / delete ---
    const partId = "part_1";
    await addMember({
      workspaceId: workspace!.id,
      userId: partId,
      role: "participant",
    });
    assertEqual(
      (
        await updateWorkspaceById(partId, workspace!.id, {
          name: "Hacked",
        })
      ).status,
      403,
      "Participant rename → 403"
    );
    assertEqual(
      (
        await updateWorkspaceById(partId, workspace!.id, {
          buildingPermissions: {
            canCreateBots: true,
            canSeeOthersBots: true,
            canShareOutside: true,
            canManageOwnBots: true,
          },
        })
      ).status,
      403,
      "Participant permissions → 403"
    );
    assertEqual(
      (await deleteWorkspaceById(partId, workspace!.id)).status,
      403,
      "Participant delete → 403"
    );

    // --- Create permissions overlay + AA default ignored (4.2, 5.2, 5.3, 5.7, 5.8, 7.1) ---
    const overlaid = await createWorkspaces(ownerId, {
      name: "Perms Overlay",
      buildingPermissions: {
        canCreateBots: true,
        canSeeOthersBots: true,
        canShareOutside: false,
        canManageOwnBots: true,
      },
    });
    assertEqual(overlaid.status, 200, "create with permissions overlay → 200");
    assert(
      overlaid.ok &&
        overlaid.body.workspace.buildingPermissions.canCreateBots === true &&
        overlaid.body.workspace.buildingPermissions.canSeeOthersBots === true &&
        overlaid.body.workspace.buildingPermissions.canShareOutside === false &&
        overlaid.body.workspace.buildingPermissions.canManageOwnBots === true,
      "create permissions overlay persists (a)(b)(d) on, (c) off"
    );
    assertEqual(
      overlaid.ok ? overlaid.body.workspace.assistedAuthoringModeDefault : true,
      false,
      "create with permissions overlay still has AA default off"
    );

    const ignoredAaBody: {
      name?: unknown;
      buildingPermissions?: unknown;
      assistedAuthoringModeDefault?: unknown;
    } = {
      name: "Ignore AA Body",
      assistedAuthoringModeDefault: true,
    };
    const ignoredAa = await createWorkspaces(ownerId, ignoredAaBody);
    assertEqual(ignoredAa.status, 200, "create with AA default in body → 200");
    assertEqual(
      ignoredAa.ok ? ignoredAa.body.workspace.assistedAuthoringModeDefault : true,
      false,
      "create body cannot set AA default (always false)"
    );
    const ignoredAaGet = ignoredAa.ok
      ? await getWorkspaceById(ownerId, ignoredAa.body.workspace.id)
      : { ok: false as const, status: 500 };
    assertEqual(
      ignoredAaGet.ok
        ? ignoredAaGet.body.workspace.assistedAuthoringModeDefault
        : true,
      false,
      "GET after create still has AA default off when body tried to set it"
    );

    const invalidCreatePerms = await createWorkspaces(ownerId, {
      name: "Bad Perms",
      buildingPermissions: "nope",
    });
    assertEqual(
      invalidCreatePerms.status,
      400,
      "create with invalid buildingPermissions → 400"
    );
    assert(
      invalidCreatePerms.ok === false,
      "invalid create permissions does not create a Workspace"
    );

    if (overlaid.ok) {
      await deleteWorkspaceById(ownerId, overlaid.body.workspace.id);
    }
    if (ignoredAa.ok) {
      await deleteWorkspaceById(ownerId, ignoredAa.body.workspace.id);
    }

    // --- PATCH AA default: operators ok, Participant 403, no bot rewrite (4.5, 4.7) ---
    const ownerAaPatch = await updateWorkspaceById(ownerId, workspace!.id, {
      assistedAuthoringModeDefault: true,
    });
    assertEqual(ownerAaPatch.status, 200, "Owner PATCH AA default → 200");
    assertEqual(
      ownerAaPatch.ok
        ? ownerAaPatch.body.workspace.assistedAuthoringModeDefault
        : false,
      true,
      "Owner PATCH persists assistedAuthoringModeDefault true"
    );
    const ownerAaGet = await getWorkspaceById(ownerId, workspace!.id);
    assertEqual(
      ownerAaGet.ok
        ? ownerAaGet.body.workspace.assistedAuthoringModeDefault
        : false,
      true,
      "GET includes patched assistedAuthoringModeDefault"
    );

    const facAaPatch = await updateWorkspaceById(facId, workspace!.id, {
      assistedAuthoringModeDefault: false,
    });
    assertEqual(facAaPatch.status, 200, "Facilitator PATCH AA default → 200");
    assertEqual(
      facAaPatch.ok
        ? facAaPatch.body.workspace.assistedAuthoringModeDefault
        : true,
      false,
      "Facilitator PATCH persists assistedAuthoringModeDefault false"
    );

    assertEqual(
      (
        await updateWorkspaceById(partId, workspace!.id, {
          assistedAuthoringModeDefault: true,
        })
      ).status,
      403,
      "Participant PATCH AA default → 403"
    );
    const afterPartPatch = await getWorkspaceById(ownerId, workspace!.id);
    assertEqual(
      afterPartPatch.ok
        ? afterPartPatch.body.workspace.assistedAuthoringModeDefault
        : true,
      false,
      "Participant PATCH does not change AA default"
    );

    const aaBotId = "bot_crud_aa_existing";
    await withTempApps([stubApp(aaBotId, ownerId, false)], async () => {
      const rewriteWs = await createWorkspaces(ownerId, {
        name: "No Rewrite Bots",
      });
      assertEqual(rewriteWs.status, 200, "create workspace for no-rewrite → 200");
      if (!rewriteWs.ok) return;
      await placeApp(rewriteWs.body.workspace.id, aaBotId, ownerId);
      const patchedDefault = await updateWorkspaceById(
        ownerId,
        rewriteWs.body.workspace.id,
        { assistedAuthoringModeDefault: true }
      );
      assertEqual(
        patchedDefault.status,
        200,
        "PATCH AA default on placed-bot Workspace → 200"
      );
      assertEqual(
        patchedDefault.ok
          ? patchedDefault.body.workspace.assistedAuthoringModeDefault
          : false,
        true,
        "PATCH default ON does not require rewriting bots"
      );
      assertEqual(
        (await getAppById(aaBotId))?.assistedAuthoringMode,
        false,
        "PATCH default does not change existing bots' assistedAuthoringMode"
      );
      await deleteWorkspaceById(ownerId, rewriteWs.body.workspace.id);
    });

    // --- Facilitator cannot delete ---
    assertEqual(
      (await deleteWorkspaceById(facId, workspace!.id)).status,
      403,
      "Facilitator delete → 403"
    );

    // --- Owner delete cascades; no activity append for delete ---
    const beforeDeleteActivity = await listActivity(workspace!.id, {
      viewerRole: "owner",
    });
    const deleted = await deleteWorkspaceById(ownerId, workspace!.id);
    assertEqual(deleted.status, 200, "Owner delete → 200");
    assert(
      deleted.ok && deleted.body.ok === true,
      "delete returns { ok: true }"
    );
    assertEqual(
      (await getWorkspaceById(ownerId, workspace!.id)).status,
      404,
      "deleted workspace gone"
    );
    assertEqual(
      await listWorkspacesForUser(ownerId),
      [],
      "owner list empty after delete"
    );
    // Activity was cascaded away with the workspace (no delete event left behind).
    assert(
      beforeDeleteActivity.every((e) => e.type !== "workspace.deleted" as string),
      "no workspace.deleted activity type exists before delete"
    );

    // --- Owner can create again after delete ---
    const again = await createWorkspaces(ownerId, { name: "Round Two" });
    assertEqual(again.status, 200, "Owner create after delete → 200");
    if (again.ok && "workspace" in again.body) {
      const del2 = await deleteWorkspaceById(ownerId, again.body.workspace.id);
      assertEqual(del2.status, 200, "Owner delete again → 200");
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("OK: WorkspacesAPI CRUD handlers (list/create/get/update/delete)");
}

void main();
