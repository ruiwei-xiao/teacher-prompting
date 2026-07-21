/**
 * Self-test: WorkspacesAPI CRUD handlers (Task 2.1).
 * Uses JSON store + handler functions (auth is injected as userId).
 *
 * Run: npx tsx lib/workspace-api/workspaces-crud.selftest.ts
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
  const { addMember, listActivity, listWorkspacesForUser } = await import(
    "../workspace-store/store"
  );

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

    const badName = await createWorkspaces(ownerId, { name: "   " });
    assertEqual(badName.status, 400, "empty name → 400");

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
