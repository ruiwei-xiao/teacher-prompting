/**
 * Self-test: configuration version JSON store, backfill, published repair,
 * draft sync on create/update/fork, and publish pointer sync (Tasks 1.2, 1.3, and 2.1).
 * Run: npx tsx lib/app-config-versions/store.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { AppConfig, PromptBuilderState } from "../app-store/types";
import { parsePeerBotSnapshotResponse } from "../workspace-ui/peer-preview";
import { CONFIG_VERSION_WINDOW_MS, snapshotFromApp } from "./rules";
import type { ConfigSnapshot, ConfigVersionRecord } from "./types";

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

function builderState(): PromptBuilderState {
  return {
    learningObjective: "Add fractions",
    learningObjectivePrompt: "Objective prompt",
    uploadedExerciseName: "Worksheet A",
    uploadedExerciseText: "Solve 1/2 + 1/4.",
    exercisePrompt: "Exercise prompt",
    gradeLevel: "5",
    language: "English",
    learnerNotes: "Needs visual models",
    learnerProfilePrompt: "Learner prompt",
    selectedTemplate: "guided-practice",
    templatePrompt: "Template prompt",
  };
}

function stubApp(overrides: Partial<AppConfig> & Pick<AppConfig, "id">): AppConfig {
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "owner-a",
    name: overrides.name ?? `App ${overrides.id}`,
    description: overrides.description ?? "A tutoring bot",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4.1",
    apiKey: overrides.apiKey ?? "unset-key",
    variability: overrides.variability,
    systemPrompt: overrides.systemPrompt,
    builderState: overrides.builderState,
    assistedAuthoringMode: overrides.assistedAuthoringMode,
    projectShareSlug: overrides.projectShareSlug,
    publishedAt: overrides.publishedAt,
    publishedVersionId: overrides.publishedVersionId,
    publishedApiKey: overrides.publishedApiKey,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function versionRecord(
  overrides: Partial<ConfigVersionRecord> & Pick<ConfigVersionRecord, "id" | "appId">
): ConfigVersionRecord {
  return {
    name: overrides.name ?? "Historical name",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4.1",
    variability: overrides.variability === undefined ? null : overrides.variability,
    systemPrompt: overrides.systemPrompt ?? "Older prompt",
    assistedAuthoringMode: overrides.assistedAuthoringMode ?? true,
    builderState: overrides.builderState === undefined ? null : overrides.builderState,
    id: overrides.id,
    appId: overrides.appId,
    kind: overrides.kind ?? "edit",
    createdAt: overrides.createdAt ?? "2021-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2021-01-01T00:00:00.000Z",
    sealedAt: overrides.sealedAt === undefined ? null : overrides.sealedAt,
  };
}

function snapshotOf(version: ConfigVersionRecord): ConfigSnapshot {
  return {
    name: version.name,
    provider: version.provider,
    model: version.model,
    variability: version.variability,
    systemPrompt: version.systemPrompt,
    assistedAuthoringMode: version.assistedAuthoringMode,
    builderState: version.builderState,
  };
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

async function restore(file: string, previous: string | null): Promise<void> {
  if (previous === null) {
    await fs.rm(file, { force: true });
  } else {
    await fs.writeFile(file, previous, "utf-8");
  }
}

async function withTempStore(
  apps: AppConfig[],
  versions: ConfigVersionRecord[],
  fn: () => Promise<void>
): Promise<void> {
  const dir = path.join(process.cwd(), ".data");
  const appsFile = path.join(dir, "apps.json");
  const versionsFile = path.join(dir, "app-config-versions.json");
  const sessionsFile = path.join(dir, "chat-sessions.json");
  await fs.mkdir(dir, { recursive: true });
  const previousApps = await readOptional(appsFile);
  const previousVersions = await readOptional(versionsFile);
  const previousSessions = await readOptional(sessionsFile);
  await fs.writeFile(appsFile, JSON.stringify(apps, null, 2), "utf-8");
  await fs.writeFile(
    versionsFile,
    JSON.stringify({ versions }, null, 2),
    "utf-8"
  );
  try {
    await fn();
  } finally {
    await restore(appsFile, previousApps);
    await restore(versionsFile, previousVersions);
    await restore(sessionsFile, previousSessions);
  }
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const { createApp, getAppById, getAppByProjectShareSlug, updateApp } = await import(
    "../app-store/store"
  );
  const { forkApp } = await import("../app-store/fork");
  const {
    ensurePublishedVersion,
    listConfigVersions,
    prepareConfigVersionStore,
    syncDraftVersion,
  } = await import("./store");

  const publishedPrompt = "Be kind.\n\nReference:\nChapter 1 on photosynthesis";
  const published = stubApp({
    id: "published-bot",
    name: "Fraction tutor",
    apiKey: "pub-bot-key-should-not-appear-in-versions",
    systemPrompt: publishedPrompt,
    builderState: builderState(),
    assistedAuthoringMode: false,
    publishedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  });
  const draft = stubApp({
    id: "draft-bot",
    name: "Draft tutor",
    apiKey: "draft-bot-key-should-not-appear-in-versions",
    systemPrompt: "",
    variability: 0.4,
    createdAt: "2026-01-20T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  });
  const repairApp = stubApp({
    id: "needs-repair",
    name: "Live name",
    apiKey: "repair-bot-key-should-not-appear-in-versions",
    systemPrompt: "Current settings prompt",
    publishedAt: "2026-02-15T00:00:00.000Z",
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });
  const earliest = versionRecord({
    id: "a-edit",
    appId: "needs-repair",
    name: "Historical name",
    systemPrompt: "Historical prompt",
    createdAt: "2021-01-01T00:00:00.000Z",
    updatedAt: "2021-02-01T00:00:00.000Z",
    builderState: builderState(),
  });
  const sameTimeLaterId = versionRecord({
    id: "b-edit",
    appId: "needs-repair",
    name: "Other edit",
    createdAt: "2021-01-01T00:00:00.000Z",
    updatedAt: "2021-03-01T00:00:00.000Z",
  });
  const newerEdit = versionRecord({
    id: "0-newer",
    appId: "needs-repair",
    name: "Newer edit",
    createdAt: "2022-01-01T00:00:00.000Z",
    updatedAt: "2022-01-01T00:00:00.000Z",
  });
  const sessionCopy = versionRecord({
    id: "0-session",
    appId: "needs-repair",
    name: "Session copy",
    kind: "session",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    sealedAt: "2020-01-01T00:00:00.000Z",
  });

  const sessionsFile = path.join(process.cwd(), ".data", "chat-sessions.json");
  const versionsFile = path.join(process.cwd(), ".data", "app-config-versions.json");

  await withTempStore(
    [published, draft, repairApp],
    [sessionCopy, sameTimeLaterId, earliest, newerEdit],
    async () => {
      const sessionsBefore = await readOptional(sessionsFile);

      await prepareConfigVersionStore();

      const publishedVersions = await listConfigVersions(published.id);
      const draftVersions = await listConfigVersions(draft.id);
      const repairVersions = await listConfigVersions(repairApp.id);

      assertEqual(publishedVersions.length, 1, "published bot receives one version");
      assertEqual(draftVersions.length, 1, "unpublished bot receives one version");
      assertEqual(repairVersions.length, 4, "backfill skips a bot that already has versions");

      const publishedVersion = publishedVersions[0];
      const draftVersion = draftVersions[0];
      assert(publishedVersion !== undefined, "published version exists");
      assert(draftVersion !== undefined, "draft version exists");
      if (!publishedVersion || !draftVersion) return;

      assertEqual(publishedVersion.kind, "edit", "backfill kind is edit");
      assertEqual(draftVersion.kind, "edit", "unpublished backfill kind is edit");
      assertEqual(
        publishedVersion.createdAt,
        published.updatedAt,
        "published version createdAt is the app updatedAt"
      );
      assertEqual(
        publishedVersion.updatedAt,
        published.updatedAt,
        "published version updatedAt is the app updatedAt"
      );
      assertEqual(
        publishedVersion.sealedAt,
        published.updatedAt,
        "published backfill version is sealed at app updatedAt"
      );
      assertEqual(
        draftVersion.createdAt,
        draft.updatedAt,
        "draft version createdAt is the app updatedAt"
      );
      assertEqual(
        draftVersion.updatedAt,
        draft.updatedAt,
        "draft version updatedAt is the app updatedAt"
      );
      assertEqual(draftVersion.sealedAt, null, "unpublished version stays unsealed");
      assertEqual(
        snapshotOf(publishedVersion),
        snapshotFromApp(published),
        "published snapshot matches current settings"
      );
      assertEqual(
        snapshotOf(draftVersion),
        snapshotFromApp(draft),
        "draft snapshot matches current settings"
      );
      assert(!("apiKey" in publishedVersion), "version has no apiKey");
      assert(!("publishedApiKey" in publishedVersion), "version has no publishedApiKey");

      const storedPublished = await getAppById(published.id);
      const storedDraft = await getAppById(draft.id);
      const storedRepair = await getAppById(repairApp.id);
      assertEqual(
        storedPublished?.publishedVersionId,
        publishedVersion.id,
        "published bot points at the initial version"
      );
      assertEqual(
        storedPublished?.publishedApiKey,
        published.apiKey,
        "published API key is copied from the current key"
      );
      assertEqual(
        storedPublished?.updatedAt,
        published.updatedAt,
        "backfill does not change published app updatedAt"
      );
      assert(
        storedDraft?.publishedVersionId == null,
        "unpublished bot keeps an empty published pointer"
      );
      assert(
        storedDraft?.publishedApiKey == null,
        "unpublished bot keeps an empty published API key"
      );
      assertEqual(
        storedDraft?.updatedAt,
        draft.updatedAt,
        "backfill does not change draft app updatedAt"
      );
      assert(
        storedRepair?.publishedVersionId == null,
        "backfill does not set a pointer when versions already exist"
      );
      assertEqual(
        repairVersions.map((version) => version.id).sort(),
        ["0-newer", "0-session", "a-edit", "b-edit"],
        "existing version ids are unchanged"
      );
      const historical = repairVersions.find((version) => version.id === "a-edit");
      assertEqual(
        historical ? snapshotOf(historical) : null,
        snapshotOf(earliest),
        "backfill does not change an existing snapshot"
      );

      await prepareConfigVersionStore();
      const publishedAgain = await listConfigVersions(published.id);
      const draftAgain = await listConfigVersions(draft.id);
      assertEqual(
        publishedAgain.map((version) => version.id),
        [publishedVersion.id],
        "running backfill twice does not add a second published version"
      );
      assertEqual(
        draftAgain.map((version) => version.id),
        [draftVersion.id],
        "running backfill twice does not add a second draft version"
      );

      const sessionsAfterBackfill = await readOptional(sessionsFile);
      assertEqual(
        sessionsAfterBackfill,
        sessionsBefore,
        "backfill does not assign a version to existing chat sessions"
      );

      const repairNow = "2026-09-27T18:30:00.000Z";
      const repaired = await ensurePublishedVersion(repairApp, repairNow);
      assertEqual(repaired.id, "a-edit", "repair points at the earliest edit version");
      assertEqual(repaired.sealedAt, repairNow, "repair seals the earliest edit version");
      assertEqual(
        snapshotOf(repaired),
        snapshotOf(earliest),
        "repair does not change the earliest snapshot"
      );
      assertEqual(repaired.createdAt, earliest.createdAt, "repair keeps createdAt");
      assertEqual(repaired.updatedAt, earliest.updatedAt, "repair keeps updatedAt");
      const afterRepair = await listConfigVersions(repairApp.id);
      assertEqual(afterRepair.length, 4, "repair does not insert another version");
      const sealedRow = afterRepair.find((version) => version.id === "a-edit");
      const otherEdit = afterRepair.find((version) => version.id === "b-edit");
      const sessionRow = afterRepair.find((version) => version.id === "0-session");
      assertEqual(sealedRow?.sealedAt, repairNow, "stored earliest edit is sealed");
      assertEqual(
        sealedRow ? snapshotOf(sealedRow) : null,
        snapshotOf(earliest),
        "stored earliest snapshot is unchanged"
      );
      assertEqual(otherEdit?.sealedAt, null, "later edit stays unsealed");
      assertEqual(
        sessionRow?.name,
        "Session copy",
        "session copy is not rewritten"
      );
      const repairStored = await getAppById(repairApp.id);
      assertEqual(
        repairStored?.publishedVersionId,
        "a-edit",
        "repair sets the published pointer"
      );
      assertEqual(
        repairStored?.publishedApiKey,
        repairApp.apiKey,
        "repair copies the current API key"
      );
      assertEqual(
        repairStored?.updatedAt,
        repairApp.updatedAt,
        "repair does not change app updatedAt"
      );

      const repairedAgain = await ensurePublishedVersion(
        repairApp,
        "2026-12-01T00:00:00.000Z"
      );
      assertEqual(repairedAgain.id, "a-edit", "second repair returns the same version");
      assertEqual(
        repairedAgain.sealedAt,
        repairNow,
        "second repair does not change sealedAt"
      );
      assertEqual(
        (await listConfigVersions(repairApp.id)).length,
        4,
        "second repair does not insert a version"
      );

      const late = stubApp({
        id: "late-published",
        name: "Late tutor",
        apiKey: "late-bot-key-should-not-appear-in-versions",
        systemPrompt: "Late prompt",
        variability: 0.2,
        assistedAuthoringMode: true,
        publishedAt: "2026-05-01T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      });
      const appsFile = path.join(process.cwd(), ".data", "apps.json");
      const appsOnDisk = JSON.parse(await fs.readFile(appsFile, "utf-8")) as AppConfig[];
      appsOnDisk.push(late);
      await fs.writeFile(appsFile, JSON.stringify(appsOnDisk, null, 2), "utf-8");
      assertEqual(
        (await listConfigVersions(late.id)).length,
        0,
        "a published bot seeded without createApp still has no versions"
      );

      const lateNow = "2026-09-27T19:00:00.000Z";
      const lateVersion = await ensurePublishedVersion(late, lateNow);
      assertEqual(lateVersion.kind, "edit", "zero-version repair kind is edit");
      assertEqual(lateVersion.createdAt, lateNow, "zero-version repair stores createdAt");
      assertEqual(lateVersion.updatedAt, lateNow, "zero-version repair stores updatedAt");
      assertEqual(lateVersion.sealedAt, lateNow, "zero-version repair seals the version");
      assertEqual(
        snapshotOf(lateVersion),
        snapshotFromApp(late),
        "zero-version repair copies current settings"
      );
      assert(
        lateVersion.id.length > 0,
        "zero-version repair assigns an id"
      );
      const lateStored = await getAppById(late.id);
      assertEqual(
        lateStored?.publishedVersionId,
        lateVersion.id,
        "zero-version repair sets the pointer"
      );
      assertEqual(
        lateStored?.publishedApiKey,
        late.apiKey,
        "zero-version repair copies the current API key"
      );
      const lateAgain = await ensurePublishedVersion(
        late,
        "2026-09-27T20:00:00.000Z"
      );
      assertEqual(lateAgain.id, lateVersion.id, "second zero-version repair keeps the id");
      assertEqual(
        lateAgain.sealedAt,
        lateNow,
        "second zero-version repair keeps sealedAt"
      );
      assertEqual(
        (await listConfigVersions(late.id)).length,
        1,
        "second zero-version repair does not insert another version"
      );

      const renamed = await updateApp(published.id, { name: "Renamed tutor" });
      assertEqual(renamed?.name, "Renamed tutor", "updateApp still renames the bot");
      assertEqual(
        renamed?.publishedVersionId,
        publishedVersion.id,
        "updateApp keeps the published pointer"
      );
      assertEqual(
        renamed?.publishedApiKey,
        published.apiKey,
        "updateApp keeps the published API key"
      );
      const publishedAfterRename = await listConfigVersions(published.id);
      assertEqual(
        publishedAfterRename.length,
        2,
        "renaming a sealed version appends an edit version"
      );
      const sealedPublished = publishedAfterRename.find(
        (version) => version.id === publishedVersion.id
      );
      const draftAfterRename = publishedAfterRename.find(
        (version) => version.id !== publishedVersion.id
      );
      assert(sealedPublished !== undefined, "published version row remains");
      assert(draftAfterRename !== undefined, "rename appends a draft version");
      if (sealedPublished && draftAfterRename && renamed) {
        assertEqual(
          snapshotOf(sealedPublished),
          snapshotFromApp(published),
          "sealed published snapshot stays unchanged"
        );
        assertEqual(
          sealedPublished.sealedAt,
          published.updatedAt,
          "published version stays sealed at the original time"
        );
        assertEqual(draftAfterRename.kind, "edit", "appended rename version is an edit");
        assertEqual(draftAfterRename.sealedAt, null, "appended rename version is unsealed");
        assertEqual(
          snapshotOf(draftAfterRename),
          snapshotFromApp(renamed),
          "app row matches the unsealed draft after rename"
        );
        assertEqual(
          draftAfterRename.createdAt,
          draftAfterRename.updatedAt,
          "appended version stores created and updated times"
        );
        assertEqual(
          renamed.updatedAt,
          draftAfterRename.updatedAt,
          "app updatedAt matches the unsealed draft"
        );
        assertEqual(
          publishedAfterRename.filter(
            (version) => version.kind === "edit" && version.sealedAt === null
          ).length,
          1,
          "only one edit version stays unsealed after rename"
        );
      }

      const rawVersions = await fs.readFile(versionsFile, "utf-8");
      const parsed = JSON.parse(rawVersions) as { versions?: unknown };
      assert(Array.isArray(parsed.versions), "versions file stores a versions array");
      for (const secret of [
        published.apiKey,
        draft.apiKey,
        repairApp.apiKey,
        late.apiKey,
      ]) {
        assert(!rawVersions.includes(secret), "versions file does not contain API keys");
      }

      const sessionsAtEnd = await readOptional(sessionsFile);
      assertEqual(
        sessionsAtEnd,
        sessionsBefore,
        "repair does not rewrite chat sessions"
      );
    }
  );

  await withTempStore([], [], async () => {
    const seeded = stubApp({
      id: "seeded-pointer",
      name: "Seeded",
      apiKey: "seed-key",
      publishedVersionId: "ver-existing",
      publishedApiKey: "kept-secret",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    await createApp(seeded);
    const loaded = await getAppById(seeded.id);
    assertEqual(loaded?.publishedVersionId, "ver-existing", "createApp stores the pointer");
    assertEqual(loaded?.publishedApiKey, "kept-secret", "createApp stores the published API key");
    const createdVersions = await listConfigVersions(seeded.id);
    assertEqual(createdVersions.length, 1, "creating a bot creates one edit version");
    const createdVersion = createdVersions[0];
    if (createdVersion && loaded) {
      assertEqual(createdVersion.kind, "edit", "created version kind is edit");
      assertEqual(createdVersion.sealedAt, null, "created version is unsealed");
      assertEqual(
        snapshotOf(createdVersion),
        snapshotFromApp(loaded),
        "created app row matches its unsealed version"
      );
    }
    const patched = await updateApp(seeded.id, { description: "Updated description" });
    assertEqual(patched?.description, "Updated description", "description save is stored");
    assertEqual(
      patched?.publishedVersionId,
      "ver-existing",
      "updateApp round-trips the pointer"
    );
    assertEqual(
      patched?.publishedApiKey,
      "kept-secret",
      "updateApp round-trips the published API key"
    );
    const afterDescription = await listConfigVersions(seeded.id);
    assertEqual(
      afterDescription.length,
      1,
      "saving a non-snapshotted setting does not create a version"
    );
    assertEqual(
      afterDescription[0]?.updatedAt,
      createdVersion?.updatedAt,
      "a description save leaves the version timestamps unchanged"
    );
  });

  const draftVersionsFile = path.join(process.cwd(), ".data", "app-config-versions.json");
  const draftAppsFile = path.join(process.cwd(), ".data", "apps.json");

  async function readStoredVersions(): Promise<ConfigVersionRecord[]> {
    const parsed = JSON.parse(await fs.readFile(draftVersionsFile, "utf-8")) as {
      versions: ConfigVersionRecord[];
    };
    return parsed.versions;
  }

  async function writeStoredVersions(versions: ConfigVersionRecord[]): Promise<void> {
    await fs.writeFile(draftVersionsFile, JSON.stringify({ versions }, null, 2), "utf-8");
  }

  await withTempStore([], [], async () => {
    const appsFile = draftAppsFile;
    const versionsFile = draftVersionsFile;
    const stamp = "2026-09-27T12:00:00.000Z";
    const within = new Date(Date.parse(stamp) + CONFIG_VERSION_WINDOW_MS).toISOString();
    const beyond = new Date(Date.parse(stamp) + CONFIG_VERSION_WINDOW_MS + 1).toISOString();
    const boundaryBot = stubApp({
      id: "boundary-bot",
      name: "Boundary",
      systemPrompt: "original prompt",
      updatedAt: stamp,
      createdAt: stamp,
    });
    const pastBot = stubApp({
      id: "past-boundary-bot",
      name: "Past boundary",
      systemPrompt: "original prompt",
      updatedAt: stamp,
      createdAt: stamp,
    });
    const boundaryVersion = versionRecord({
      id: "boundary-version",
      appId: boundaryBot.id,
      name: boundaryBot.name,
      systemPrompt: "original prompt",
      createdAt: stamp,
      updatedAt: stamp,
    });
    const pastVersion = versionRecord({
      id: "past-boundary-version",
      appId: pastBot.id,
      name: pastBot.name,
      systemPrompt: "original prompt",
      createdAt: stamp,
      updatedAt: stamp,
    });
    const seededApps = JSON.parse(await fs.readFile(appsFile, "utf-8")) as AppConfig[];
    seededApps.push(boundaryBot, pastBot);
    await fs.writeFile(appsFile, JSON.stringify(seededApps, null, 2), "utf-8");
    await writeStoredVersions([boundaryVersion, pastVersion]);

    const atWindow = await syncDraftVersion({
      app: { ...boundaryBot, systemPrompt: "updated prompt", updatedAt: within },
      now: within,
    });
    assertEqual(atWindow.latest.id, boundaryVersion.id, "exactly 15 minutes updates the same version");
    assertEqual(atWindow.latest.createdAt, stamp, "in-window update keeps createdAt");
    assertEqual(atWindow.latest.updatedAt, within, "in-window update moves updatedAt");
    assertEqual(atWindow.latest.sealedAt, null, "in-window draft stays unsealed");
    assertEqual(atWindow.latest.systemPrompt, "updated prompt", "in-window update stores the new prompt");
    const boundaryRows = await listConfigVersions(boundaryBot.id);
    assertEqual(boundaryRows.length, 1, "in-window sync does not append a version");

    const pastWindow = await syncDraftVersion({
      app: { ...pastBot, systemPrompt: "later prompt", updatedAt: beyond },
      now: beyond,
    });
    assert(pastWindow.latest.id !== pastVersion.id, "one millisecond past 15 minutes appends a version");
    assertEqual(pastWindow.latest.sealedAt, null, "appended version is the unsealed draft");
    assertEqual(pastWindow.latest.createdAt, beyond, "appended version stores createdAt");
    assertEqual(pastWindow.latest.kind, "edit", "appended version is an edit");
    const pastRows = await listConfigVersions(pastBot.id);
    assertEqual(pastRows.length, 2, "out-of-window sync keeps the previous version");
    const sealedPast = pastRows.find((version) => version.id === pastVersion.id);
    assertEqual(sealedPast?.sealedAt, beyond, "append seals the previous edit version");
    assertEqual(sealedPast?.systemPrompt, "original prompt", "sealed version keeps its snapshot");
    assertEqual(sealedPast?.createdAt, stamp, "sealing does not change createdAt");
    assertEqual(sealedPast?.updatedAt, stamp, "sealing does not change updatedAt");
    assertEqual(
      pastRows.filter((version) => version.kind === "edit" && version.sealedAt === null).length,
      1,
      "only one edit version stays unsealed"
    );

    const recent = new Date().toISOString();
    const openBot = stubApp({
      id: "open-draft",
      name: "Open draft",
      systemPrompt: "first prompt",
      variability: 0.4,
      builderState: builderState(),
      updatedAt: recent,
      createdAt: recent,
    });
    const createdOpen = await createApp(openBot);
    const openVersions = await listConfigVersions(openBot.id);
    assertEqual(openVersions.length, 1, "creating a bot also creates one version");
    const openDraft = openVersions[0];
    if (openDraft && createdOpen) {
      assertEqual(openDraft.kind, "edit", "new bot version is an edit");
      assertEqual(openDraft.sealedAt, null, "new bot version is unsealed");
      assertEqual(
        snapshotOf(openDraft),
        snapshotFromApp(createdOpen),
        "new app row matches its unsealed version"
      );
      assertEqual(openDraft.createdAt, recent, "new version createdAt matches the app stamp");
      assertEqual(openDraft.updatedAt, recent, "new version updatedAt matches the app stamp");
    }

    const edited = await updateApp(openBot.id, { systemPrompt: "second prompt" });
    const editedVersions = await listConfigVersions(openBot.id);
    assertEqual(editedVersions.length, 1, "an in-window prompt save updates the same version");
    const editedDraft = editedVersions[0];
    if (editedDraft && edited && openDraft) {
      assertEqual(editedDraft.id, openDraft.id, "in-window save keeps the version id");
      assertEqual(editedDraft.createdAt, openDraft.createdAt, "in-window save keeps createdAt");
      assert(editedDraft.updatedAt !== openDraft.updatedAt, "in-window save moves updatedAt");
      assertEqual(editedDraft.sealedAt, null, "in-window save leaves the draft unsealed");
      assertEqual(
        snapshotOf(editedDraft),
        snapshotFromApp(edited),
        "app row matches the updated draft"
      );
      const reloaded = await getAppById(openBot.id);
      assertEqual(
        reloaded ? snapshotFromApp(reloaded) : null,
        snapshotOf(editedDraft),
        "reloaded app row matches the unsealed draft"
      );
    }

    const varied = await updateApp(openBot.id, { variability: undefined });
    const variedVersions = await listConfigVersions(openBot.id);
    assertEqual(variedVersions.length, 1, "clearing variability inside the window stays one version");
    assertEqual(variedVersions[0]?.variability, null, "unset variability is stored as null");
    assertEqual(variedVersions[0]?.createdAt, openDraft?.createdAt, "variability save keeps createdAt");
    if (varied) {
      assertEqual(
        snapshotFromApp(varied),
        variedVersions[0] ? snapshotOf(variedVersions[0]) : null,
        "app row matches the draft after variability is unset"
      );
    }

    const oldBot = stubApp({
      id: "old-draft",
      name: "Old draft",
      systemPrompt: "old prompt",
      model: "gpt-4.1",
      updatedAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    await createApp(oldBot);
    const aged = await updateApp(oldBot.id, { model: "gpt-4.1-mini" });
    const agedVersions = await listConfigVersions(oldBot.id);
    assertEqual(agedVersions.length, 2, "a save after 15 minutes appends an edit version");
    const agedPrevious = agedVersions.find((version) => version.model === "gpt-4.1");
    const agedDraft = agedVersions.find((version) => version.model === "gpt-4.1-mini");
    assert(agedPrevious !== undefined, "previous edit version remains");
    assert(agedDraft !== undefined, "new edit version is stored");
    if (agedPrevious && agedDraft && aged) {
      assertEqual(agedPrevious.sealedAt !== null, true, "previous edit version is sealed");
      assertEqual(agedPrevious.systemPrompt, "old prompt", "previous snapshot is unchanged");
      assertEqual(agedPrevious.updatedAt, "2020-01-01T00:00:00.000Z", "sealing keeps updatedAt");
      assertEqual(agedDraft.sealedAt, null, "new edit version is unsealed");
      assertEqual(agedDraft.kind, "edit", "new row is an edit");
      assertEqual(snapshotOf(agedDraft), snapshotFromApp(aged), "app row matches the new draft");
      assertEqual(
        agedVersions.filter((version) => version.kind === "edit" && version.sealedAt === null)
          .length,
        1,
        "an old draft save leaves only one unsealed edit"
      );
    }

    const sealedBot = stubApp({
      id: "sealed-recent",
      name: "Sealed recent",
      systemPrompt: "sealed prompt",
      updatedAt: recent,
      createdAt: recent,
    });
    await createApp(sealedBot);
    const sealedRows = await readStoredVersions();
    const sealedIndex = sealedRows.findIndex((version) => version.appId === sealedBot.id);
    const sealedOriginal = sealedRows[sealedIndex];
    assert(sealedOriginal !== undefined, "sealed-recent bot has a version to seal");
    if (sealedOriginal) {
      sealedRows[sealedIndex] = { ...sealedOriginal, sealedAt: sealedOriginal.updatedAt };
      await writeStoredVersions(sealedRows);
      const afterSeal = await updateApp(sealedBot.id, { name: "Sealed recent renamed" });
      const sealVersions = await listConfigVersions(sealedBot.id);
      assertEqual(sealVersions.length, 2, "a sealed latest edit forces a new version");
      const stillSealed = sealVersions.find((version) => version.id === sealedOriginal.id);
      const sealDraft = sealVersions.find((version) => version.id !== sealedOriginal.id);
      assertEqual(stillSealed?.sealedAt, sealedOriginal.updatedAt, "the sealed version keeps sealedAt");
      assertEqual(stillSealed?.name, "Sealed recent", "the sealed snapshot stays unchanged");
      assertEqual(sealDraft?.sealedAt, null, "the new edit version is unsealed");
      assertEqual(sealDraft?.kind, "edit", "the new row is an edit");
      if (afterSeal && sealDraft) {
        assertEqual(
          snapshotOf(sealDraft),
          snapshotFromApp(afterSeal),
          "app row matches the new draft, not the sealed version"
        );
      }
      assertEqual(
        sealVersions.filter((version) => version.kind === "edit" && version.sealedAt === null)
          .length,
        1,
        "sealing on append leaves one unsealed edit"
      );
    }

    const sessionBot = stubApp({
      id: "session-bot",
      name: "Draft name",
      systemPrompt: "draft prompt",
      updatedAt: recent,
      createdAt: recent,
    });
    await createApp(sessionBot);
    const sessionVersions = await readStoredVersions();
    const sessionDraft = sessionVersions.find((version) => version.appId === sessionBot.id);
    assert(sessionDraft !== undefined, "session bot has an edit version");
    if (sessionDraft) {
      sessionVersions.push(
        versionRecord({
          id: "session-copy",
          appId: sessionBot.id,
          name: "Session name",
          systemPrompt: "session prompt",
          kind: "session",
          createdAt: "2099-01-01T00:00:00.000Z",
          updatedAt: "2099-01-01T00:00:00.000Z",
          sealedAt: "2099-01-01T00:00:00.000Z",
        })
      );
      await writeStoredVersions(sessionVersions);
      const sessionSaved = await updateApp(sessionBot.id, { systemPrompt: "draft prompt revised" });
      const afterSession = await listConfigVersions(sessionBot.id);
      const editAfter = afterSession.find((version) => version.id === sessionDraft.id);
      const copyAfter = afterSession.find((version) => version.id === "session-copy");
      assertEqual(afterSession.length, 2, "a session copy is not replaced or deleted");
      assertEqual(editAfter?.systemPrompt, "draft prompt revised", "the edit draft receives the save");
      assertEqual(editAfter?.createdAt, sessionDraft.createdAt, "the edit draft keeps createdAt");
      assertEqual(editAfter?.sealedAt, null, "the edit draft stays unsealed");
      assertEqual(editAfter?.name, "Draft name", "the session copy does not become the draft");
      assertEqual(copyAfter?.name, "Session name", "session copy snapshot stays unchanged");
      assertEqual(copyAfter?.sealedAt, "2099-01-01T00:00:00.000Z", "session copy stays sealed");
      assertEqual(copyAfter?.kind, "session", "session row keeps its kind");
      if (sessionSaved) {
        assertEqual(sessionSaved.name, "Draft name", "app row keeps the draft name");
        assertEqual(
          sessionSaved.systemPrompt,
          "draft prompt revised",
          "app row stores the draft prompt"
        );
        assertEqual(
          snapshotFromApp(sessionSaved),
          editAfter ? snapshotOf(editAfter) : null,
          "app row matches the edit draft, not the session copy"
        );
      }
    }

    const quiet = stubApp({
      id: "quiet-bot",
      name: "Quiet",
      apiKey: "quiet-secret-key",
      systemPrompt: "quiet prompt",
      projectShareSlug: "quiet-share",
      updatedAt: recent,
      createdAt: recent,
    });
    await createApp(quiet);
    const versionsBeforeQuiet = await fs.readFile(versionsFile, "utf-8");
    const quietSaved = await updateApp(quiet.id, {
      description: "Changed description",
      apiKey: "rotated-quiet-secret",
      communitySubject: "Science",
      projectShareVisibility: "public",
    });
    const versionsAfterQuiet = await fs.readFile(versionsFile, "utf-8");
    assertEqual(
      versionsAfterQuiet,
      versionsBeforeQuiet,
      "saving non-snapshotted settings does not rewrite versions"
    );
    assertEqual(quietSaved?.description, "Changed description", "description is saved on the app");
    assertEqual(quietSaved?.apiKey, "rotated-quiet-secret", "api key is saved on the app");
    assertEqual(quietSaved?.communitySubject, "Science", "community subject is saved on the app");
    assert(!versionsAfterQuiet.includes("rotated-quiet-secret"), "versions omit the api key");
    assert(!versionsAfterQuiet.includes("quiet-secret-key"), "versions omit the original api key");

    const preview = stubApp({
      id: "preview-bot",
      name: "Draft title",
      systemPrompt: "Draft prompt",
      projectShareSlug: "preview-share",
      publishedAt: "2026-08-01T00:00:00.000Z",
      publishedVersionId: "published-snapshot",
      publishedApiKey: "published-secret",
      apiKey: "draft-secret",
      updatedAt: recent,
      createdAt: recent,
    });
    const previewApps = JSON.parse(await fs.readFile(appsFile, "utf-8")) as AppConfig[];
    previewApps.push(preview);
    await fs.writeFile(appsFile, JSON.stringify(previewApps, null, 2), "utf-8");
    const previewVersions = await readStoredVersions();
    previewVersions.push(
      versionRecord({
        id: "published-snapshot",
        appId: preview.id,
        name: "Published title",
        systemPrompt: "Published prompt",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        sealedAt: "2026-08-01T00:00:00.000Z",
      })
    );
    await writeStoredVersions(previewVersions);
    const previewById = await getAppById(preview.id);
    const previewByShare = await getAppByProjectShareSlug("preview-share");
    assertEqual(previewById?.name, "Draft title", "peer preview reads the app row name");
    assertEqual(previewById?.systemPrompt, "Draft prompt", "peer preview reads the app row prompt");
    assertEqual(previewByShare?.name, "Draft title", "shared project reads the app row name");
    assertEqual(
      previewByShare?.systemPrompt,
      "Draft prompt",
      "shared project reads the app row prompt"
    );
    assertEqual(
      previewById?.publishedVersionId,
      "published-snapshot",
      "app row keeps its published pointer"
    );
    const publishedSnapshot = (await listConfigVersions(preview.id)).find(
      (version) => version.id === "published-snapshot"
    );
    assertEqual(publishedSnapshot?.name, "Published title", "published snapshot stays unread as the draft");
    assertEqual(
      publishedSnapshot?.systemPrompt,
      "Published prompt",
      "published snapshot prompt stays unchanged"
    );

    const failing = stubApp({
      id: "failing-bot",
      name: "Keep me",
      apiKey: "failing-secret-key",
      systemPrompt: "keep this prompt",
      updatedAt: recent,
      createdAt: recent,
    });
    await createApp(failing);
    const appsBeforeFailure = await fs.readFile(appsFile, "utf-8");
    const versionsBeforeFailure = await fs.readFile(versionsFile, "utf-8");
    const logged: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map((arg) => String(arg)).join(" "));
    };
    let threw = false;
    try {
      process.env.APP_DRAFT_SAVE_FAULT = "1";
      await updateApp(failing.id, {
        name: "Should not stick",
        systemPrompt: "SECRET PROMPT TEXT",
      });
    } catch {
      threw = true;
    } finally {
      console.error = originalError;
      delete process.env.APP_DRAFT_SAVE_FAULT;
    }
    assert(threw, "a failed save throws");
    assertEqual(
      await fs.readFile(appsFile, "utf-8"),
      appsBeforeFailure,
      "a failed save leaves the app file unchanged"
    );
    assertEqual(
      await fs.readFile(versionsFile, "utf-8"),
      versionsBeforeFailure,
      "a failed save leaves the versions file unchanged"
    );
    const failingStored = await getAppById(failing.id);
    assertEqual(failingStored?.name, "Keep me", "a failed save leaves the app row unchanged");
    assertEqual(
      failingStored?.systemPrompt,
      "keep this prompt",
      "a failed save leaves the previous prompt"
    );
    const failureLog = logged.join("\n");
    assert(!failureLog.includes("SECRET PROMPT TEXT"), "failure log omits prompt text");
    assert(!failureLog.includes("failing-secret-key"), "failure log omits API keys");
    assert(
      failureLog.includes("failing-bot"),
      "failure log includes the app id"
    );

    const source = stubApp({
      id: "fork-source",
      name: "Fraction Lab",
      ownerId: "teacher-a",
      apiKey: "source-secret-key",
      systemPrompt: "Teach fractions.",
      variability: 0.3,
      builderState: builderState(),
      projectShareSlug: "fraction-lab",
      assistedAuthoringMode: false,
      updatedAt: "2024-01-01T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    const sourceVersions = [
      versionRecord({
        id: "fork-v1",
        appId: source.id,
        name: "Fraction Lab",
        systemPrompt: "First prompt",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        sealedAt: "2024-02-01T00:00:00.000Z",
      }),
      versionRecord({
        id: "fork-v2",
        appId: source.id,
        name: "Fraction Lab",
        systemPrompt: "Second prompt",
        createdAt: "2024-03-01T00:00:00.000Z",
        updatedAt: "2024-03-01T00:00:00.000Z",
        sealedAt: "2024-04-01T00:00:00.000Z",
      }),
      versionRecord({
        id: "fork-v3",
        appId: source.id,
        name: "Fraction Lab",
        systemPrompt: "Teach fractions.",
        variability: 0.3,
        builderState: builderState(),
        assistedAuthoringMode: false,
        createdAt: "2024-05-01T00:00:00.000Z",
        updatedAt: "2024-05-01T00:00:00.000Z",
      }),
    ];
    const forkApps = JSON.parse(await fs.readFile(appsFile, "utf-8")) as AppConfig[];
    forkApps.push(source);
    await fs.writeFile(appsFile, JSON.stringify(forkApps, null, 2), "utf-8");
    await writeStoredVersions([...(await readStoredVersions()), ...sourceVersions]);
    const forked = await forkApp({
      source,
      ownerId: "teacher-b",
      forkedFromAuthorName: "Ada",
    });
    const sourceAfter = await listConfigVersions(source.id);
    const forkVersions = await listConfigVersions(forked.id);
    assertEqual(
      sourceAfter.map((version) => version.id),
      ["fork-v1", "fork-v2", "fork-v3"],
      "duplicating a bot does not copy or change the source history"
    );
    assertEqual(forkVersions.length, 1, "a duplicated bot gets exactly one version");
    const forkVersion = forkVersions[0];
    if (forkVersion) {
      assertEqual(forkVersion.kind, "edit", "fork version is an edit");
      assertEqual(forkVersion.sealedAt, null, "fork version is unsealed");
      assert(!["fork-v1", "fork-v2", "fork-v3"].includes(forkVersion.id), "fork version is new");
      assertEqual(
        snapshotOf(forkVersion),
        snapshotFromApp(forked),
        "fork version matches the copied tutoring configuration"
      );
      assertEqual(forkVersion.systemPrompt, "Teach fractions.", "fork version copies the prompt");
      assertEqual(forkVersion.name, "Fraction Lab Copy", "fork version uses the new bot name");
      assert(!JSON.stringify(forkVersion).includes("source-secret-key"), "fork version omits the api key");
    }
    const sourceStill = await getAppById(source.id);
    assertEqual(sourceStill?.apiKey, "source-secret-key", "source api key stays on the source app");
    assertEqual(forked.apiKey, "", "fork api key is empty");
  });

  await withTempStore([], [], async () => {
    const versionsFile = draftVersionsFile;
    const recent = new Date().toISOString();
    const publishAt = "2026-09-28T01:00:00.000Z";
    const republishAt = "2026-09-28T02:00:00.000Z";
    const noopAt = "2026-09-28T03:00:00.000Z";

    const combo = stubApp({
      id: "publish-combo",
      name: "Combo",
      apiKey: "combo-draft-key",
      provider: "openai",
      systemPrompt: "before combo",
      createdAt: recent,
      updatedAt: recent,
    });
    await createApp(combo);
    const comboCreated = (await listConfigVersions(combo.id))[0];
    assert(comboCreated !== undefined, "combo bot has a draft version");
    const comboPublished = await updateApp(combo.id, {
      name: "Combo published",
      systemPrompt: "after combo",
      publishedAt: publishAt,
      publicSlug: "combo-slug",
    });
    const comboVersions = await listConfigVersions(combo.id);
    assertEqual(
      comboVersions.length,
      1,
      "a save that also publishes keeps one in-window version"
    );
    const comboVersion = comboVersions[0];
    if (comboCreated && comboVersion && comboPublished) {
      assertEqual(comboVersion.id, comboCreated.id, "publish seals the synced draft");
      assertEqual(
        comboVersion.createdAt,
        comboCreated.createdAt,
        "combined publish keeps createdAt"
      );
      assertEqual(comboVersion.systemPrompt, "after combo", "draft sync runs before publish");
      assertEqual(comboVersion.name, "Combo published", "draft sync stores the published name");
      assert(comboVersion.sealedAt !== null, "combined publish seals the latest edit");
      assertEqual(
        comboVersion.sealedAt,
        comboVersion.updatedAt,
        "seal uses the sync time and does not rewrite snapshot fields"
      );
      assertEqual(
        snapshotOf(comboVersion),
        snapshotFromApp(comboPublished),
        "app row matches the sealed snapshot"
      );
      assertEqual(
        comboPublished.publishedVersionId,
        comboVersion.id,
        "first combined publish sets the pointer"
      );
      assertEqual(
        comboPublished.publishedApiKey,
        "combo-draft-key",
        "first combined publish copies the draft API key"
      );
      assertEqual(comboPublished.publishedAt, publishAt, "publish stores publishedAt");
      assertEqual(comboPublished.publicSlug, "combo-slug", "publish stores the public slug");
      assert(!("publishedApiKey" in comboVersion), "version record has no publishedApiKey");
    }
    const comboRaw = await fs.readFile(versionsFile, "utf-8");
    assert(!comboRaw.includes("combo-draft-key"), "version file omits the draft API key");
    assert(!comboRaw.includes("publishedApiKey"), "version file omits publishedApiKey");

    const first = stubApp({
      id: "publish-first",
      name: "First",
      apiKey: "first-draft-key",
      provider: "openai",
      systemPrompt: "stable prompt",
      model: "gpt-4.1",
      createdAt: recent,
      updatedAt: recent,
    });
    await createApp(first);
    const firstBefore = (await listConfigVersions(first.id))[0];
    assert(firstBefore !== undefined, "first-publish bot has a draft");
    const firstSnapshot = firstBefore ? snapshotOf(firstBefore) : null;
    const firstPublished = await updateApp(first.id, {
      publishedAt: publishAt,
      publicSlug: "first-slug",
    });
    const firstAfterList = await listConfigVersions(first.id);
    assertEqual(firstAfterList.length, 1, "first publish does not insert a version");
    const firstAfter = firstAfterList[0];
    if (firstBefore && firstAfter && firstPublished && firstSnapshot) {
      assertEqual(firstAfter.id, firstBefore.id, "first publish keeps the latest edit id");
      assertEqual(snapshotOf(firstAfter), firstSnapshot, "first publish does not change the snapshot");
      assertEqual(firstAfter.createdAt, firstBefore.createdAt, "first publish keeps createdAt");
      assertEqual(firstAfter.updatedAt, firstBefore.updatedAt, "first publish keeps version updatedAt");
      assertEqual(firstBefore.sealedAt, null, "draft starts unsealed");
      assert(firstAfter.sealedAt !== null, "first publish seals the latest edit");
      assertEqual(
        firstPublished.publishedVersionId,
        firstAfter.id,
        "first publish sets the pointer"
      );
      assertEqual(
        firstPublished.publishedApiKey,
        "first-draft-key",
        "first publish copies the draft API key"
      );
      assertEqual(firstPublished.apiKey, "first-draft-key", "first publish leaves the draft API key");
    }

    const edited = await updateApp(first.id, { systemPrompt: "draft after publish" });
    const afterEdit = await listConfigVersions(first.id);
    assertEqual(afterEdit.length, 2, "editing a published version appends a draft");
    const stillPublished = afterEdit.find((version) => version.id === firstBefore?.id);
    const openDraft = afterEdit.find((version) => version.id !== firstBefore?.id);
    assert(stillPublished !== undefined && openDraft !== undefined, "republish setup has both versions");
    if (stillPublished && openDraft && edited && firstBefore) {
      assertEqual(
        snapshotOf(stillPublished),
        snapshotOf(firstBefore),
        "the published snapshot stays unchanged after a later edit"
      );
      assertEqual(openDraft.sealedAt, null, "the newer edit is unsealed");
      assertEqual(openDraft.systemPrompt, "draft after publish", "the draft has the new prompt");
      assertEqual(edited.publishedVersionId, firstBefore.id, "an edit does not move the pointer");
      const publishedSnapshot = snapshotOf(stillPublished);
      const draftSnapshot = snapshotOf(openDraft);
      const publishedSealedAt = stillPublished.sealedAt;
      const draftUpdatedAt = openDraft.updatedAt;
      const republished = await updateApp(first.id, {
        publishedAt: republishAt,
        publicSlug: "first-slug",
      });
      const afterRepublish = await listConfigVersions(first.id);
      const oldRow = afterRepublish.find((version) => version.id === stillPublished.id);
      const newRow = afterRepublish.find((version) => version.id === openDraft.id);
      assert(oldRow !== undefined && newRow !== undefined, "republish keeps both version rows");
      if (oldRow && newRow && republished) {
        assertEqual(
          snapshotOf(oldRow),
          publishedSnapshot,
          "republish leaves the previous snapshot unchanged"
        );
        assertEqual(
          snapshotOf(newRow),
          draftSnapshot,
          "republish leaves the latest snapshot unchanged"
        );
        assertEqual(oldRow.sealedAt, publishedSealedAt, "republish leaves the previous seal time");
        assertEqual(newRow.updatedAt, draftUpdatedAt, "republish does not change the latest updatedAt");
        assert(newRow.sealedAt !== null, "republish seals the latest edit");
        assertEqual(republished.publishedVersionId, newRow.id, "republish moves the pointer");
        assertEqual(
          republished.publishedApiKey,
          "first-draft-key",
          "republish copies the draft API key"
        );
        assertEqual(afterRepublish.length, 2, "republish does not insert a version");
      }
    }

    const storedBeforeNoop = await getAppById(first.id);
    const versionsBeforeNoop = await fs.readFile(versionsFile, "utf-8");
    const noop = await updateApp(first.id, {
      publishedAt: noopAt,
      publicSlug: "first-slug-again",
      apiKey: "noop-should-not-copy",
    });
    assertEqual(
      storedBeforeNoop?.publishedApiKey,
      "first-draft-key",
      "republish stored the draft key before the matching publish"
    );
    assertEqual(
      noop?.publishedVersionId,
      storedBeforeNoop?.publishedVersionId,
      "a matching publish leaves the pointer"
    );
    assertEqual(
      noop?.publishedApiKey,
      "first-draft-key",
      "a matching publish leaves the published API key"
    );
    assertEqual(noop?.apiKey, "noop-should-not-copy", "a matching publish still stores the draft API key");
    assertEqual(noop?.publishedAt, noopAt, "a matching publish still stores publishedAt");
    assertEqual(
      await fs.readFile(versionsFile, "utf-8"),
      versionsBeforeNoop,
      "a matching publish leaves every version unchanged"
    );

    const keyed = stubApp({
      id: "publish-key",
      name: "Keyed",
      apiKey: "provider-key-1",
      provider: "openai",
      systemPrompt: "key prompt",
      createdAt: recent,
      updatedAt: recent,
    });
    await createApp(keyed);
    const keyedPublished = await updateApp(keyed.id, {
      publishedAt: publishAt,
      publicSlug: "key-slug",
    });
    const keyedVersionId = keyedPublished?.publishedVersionId;
    assertEqual(keyedPublished?.publishedApiKey, "provider-key-1", "publish copies the original draft key");
    const versionsBeforeKey = await fs.readFile(versionsFile, "utf-8");
    const rotated = await updateApp(keyed.id, { apiKey: "provider-key-2" });
    assertEqual(
      rotated?.publishedApiKey,
      "provider-key-2",
      "a same-provider key change updates the published API key"
    );
    assertEqual(rotated?.apiKey, "provider-key-2", "a same-provider key change stores the draft API key");
    assertEqual(rotated?.publishedVersionId, keyedVersionId, "a key change does not publish");
    assertEqual(rotated?.publishedAt, publishAt, "a key change leaves publishedAt");
    assertEqual(
      await fs.readFile(versionsFile, "utf-8"),
      versionsBeforeKey,
      "a key change does not rewrite versions"
    );
    assert(
      !(await fs.readFile(versionsFile, "utf-8")).includes("provider-key-2"),
      "versions omit the rotated key"
    );

    const switched = await updateApp(keyed.id, {
      provider: "google",
      apiKey: "provider-key-3",
    });
    const publishedRow = (await listConfigVersions(keyed.id)).find(
      (version) => version.id === keyedVersionId
    );
    assertEqual(switched?.provider, "google", "the draft provider changes");
    assertEqual(switched?.apiKey, "provider-key-3", "the draft API key changes with the provider");
    assertEqual(
      switched?.publishedApiKey,
      "provider-key-2",
      "a different provider leaves the published API key"
    );
    assertEqual(
      switched?.publishedVersionId,
      keyedVersionId,
      "a provider change does not move the pointer"
    );
    assertEqual(publishedRow?.provider, "openai", "the published snapshot keeps its provider");

    const stillDifferent = await updateApp(keyed.id, { apiKey: "provider-key-4" });
    assertEqual(
      stillDifferent?.publishedApiKey,
      "provider-key-2",
      "a key change against a different published provider leaves the published API key"
    );
    assertEqual(stillDifferent?.apiKey, "provider-key-4", "the draft API key still updates");

    const matchedAgain = await updateApp(keyed.id, {
      provider: "openai",
      apiKey: "provider-key-5",
    });
    assertEqual(
      matchedAgain?.publishedApiKey,
      "provider-key-5",
      "a key change updates the published API key when the draft provider matches the published snapshot"
    );
    assertEqual(
      matchedAgain?.publishedVersionId,
      keyedVersionId,
      "matching the provider does not publish"
    );

    const republishKey = stubApp({
      id: "publish-republish-key",
      name: "Republish key",
      apiKey: "republish-key-1",
      provider: "openai",
      systemPrompt: "republish prompt",
      createdAt: recent,
      updatedAt: recent,
    });
    await createApp(republishKey);
    const republishFirst = await updateApp(republishKey.id, {
      publishedAt: publishAt,
      publicSlug: "republish-key-slug",
    });
    const previousPointer = republishFirst?.publishedVersionId;
    await updateApp(republishKey.id, {
      provider: "anthropic",
      apiKey: "republish-key-2",
    });
    const beforeRepublishRows = await listConfigVersions(republishKey.id);
    const snapshotsBeforeRepublish = beforeRepublishRows.map((version) => ({
      id: version.id,
      snapshot: snapshotOf(version),
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      sealedAt: version.sealedAt,
    }));
    const republishedKey = await updateApp(republishKey.id, {
      publishedAt: republishAt,
      publicSlug: "republish-key-slug-2",
    });
    assertEqual(
      republishedKey?.publishedApiKey,
      "republish-key-2",
      "republish copies the draft API key when it differs from the published key"
    );
    assertEqual(republishedKey?.apiKey, "republish-key-2", "republish leaves the draft API key");
    assert(
      republishedKey?.publishedVersionId !== previousPointer,
      "republish moves the pointer to the latest edit"
    );
    const afterRepublishRows = await listConfigVersions(republishKey.id);
    assertEqual(
      afterRepublishRows.length,
      snapshotsBeforeRepublish.length,
      "republish does not insert a version"
    );
    for (const before of snapshotsBeforeRepublish) {
      const after = afterRepublishRows.find((version) => version.id === before.id);
      assertEqual(
        after ? snapshotOf(after) : null,
        before.snapshot,
        "republish does not change any version snapshot"
      );
      assertEqual(after?.createdAt, before.createdAt, "republish keeps createdAt");
      assertEqual(after?.updatedAt, before.updatedAt, "republish keeps updatedAt");
      if (before.id !== republishedKey?.publishedVersionId) {
        assertEqual(after?.sealedAt, before.sealedAt, "republish leaves other seal times unchanged");
      }
    }
    const previousPublished = afterRepublishRows.find((version) => version.id === previousPointer);
    const newlyPublished = afterRepublishRows.find(
      (version) => version.id === republishedKey?.publishedVersionId
    );
    assertEqual(previousPublished?.provider, "openai", "the previous snapshot keeps its provider");
    assertEqual(newlyPublished?.provider, "anthropic", "the published pointer selects the latest edit");
    assert(newlyPublished?.sealedAt !== null, "republish seals the latest edit");
    const republishRaw = await fs.readFile(versionsFile, "utf-8");
    assert(!republishRaw.includes("republish-key-1"), "version file omits the original draft key");
    assert(!republishRaw.includes("republish-key-2"), "version file omits the republished draft key");

    const unpublished = stubApp({
      id: "publish-unpublished",
      name: "Unpublished",
      apiKey: "unpublished-key",
      createdAt: recent,
      updatedAt: recent,
    });
    await createApp(unpublished);
    const unpublishedSaved = await updateApp(unpublished.id, { apiKey: "unpublished-key-2" });
    assertEqual(
      unpublishedSaved?.publishedApiKey ?? null,
      null,
      "an unpublished bot has no published API key"
    );
    assertEqual(
      unpublishedSaved?.publishedVersionId ?? null,
      null,
      "an unpublished bot has no published pointer"
    );

    const failing = stubApp({
      id: "publish-fail",
      name: "Fail publish",
      apiKey: "publish-fail-key",
      provider: "openai",
      systemPrompt: "published prompt",
      createdAt: recent,
      updatedAt: recent,
    });
    await createApp(failing);
    const failedFirst = await updateApp(failing.id, {
      publishedAt: publishAt,
      publicSlug: "fail-slug",
    });
    await updateApp(failing.id, { systemPrompt: "draft that must remain" });
    const appsBeforeFailure = await fs.readFile(draftAppsFile, "utf-8");
    const versionsBeforeFailure = await fs.readFile(versionsFile, "utf-8");
    const logged: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map((arg) => String(arg)).join(" "));
    };
    let threw = false;
    try {
      process.env.APP_PUBLISH_FAULT = "1";
      await updateApp(failing.id, {
        systemPrompt: "SECRET PROMPT TEXT",
        publishedAt: republishAt,
        publicSlug: "fail-slug-2",
        apiKey: "SECRET-PUBLISH-KEY",
      });
    } catch {
      threw = true;
    } finally {
      console.error = originalError;
      delete process.env.APP_PUBLISH_FAULT;
    }
    assert(threw, "a failed publish throws");
    assertEqual(
      await fs.readFile(draftAppsFile, "utf-8"),
      appsBeforeFailure,
      "a failed publish restores the app file"
    );
    assertEqual(
      await fs.readFile(versionsFile, "utf-8"),
      versionsBeforeFailure,
      "a failed publish restores the versions file"
    );
    const failedStored = await getAppById(failing.id);
    assertEqual(
      failedStored?.publishedVersionId,
      failedFirst?.publishedVersionId,
      "a failed publish leaves the previous pointer"
    );
    assertEqual(
      failedStored?.publishedApiKey,
      "publish-fail-key",
      "a failed publish leaves the previous published API key"
    );
    assertEqual(
      failedStored?.systemPrompt,
      "draft that must remain",
      "a failed publish leaves the previous draft"
    );
    const publishFailureLog = logged.join("\n");
    assert(!publishFailureLog.includes("SECRET PROMPT TEXT"), "publish failure log omits prompt text");
    assert(!publishFailureLog.includes("SECRET-PUBLISH-KEY"), "publish failure log omits API keys");
    assert(!publishFailureLog.includes("publish-fail-key"), "publish failure log omits the published API key");
    assert(publishFailureLog.includes("publish-fail"), "publish failure log includes the app id");

    const parsed = parsePeerBotSnapshotResponse(200, {
      app: {
        id: "peer",
        name: "Peer",
        provider: "openai",
        model: "gpt-4.1",
        createdAt: recent,
        updatedAt: recent,
        apiKey: "peer-draft-key",
        publishedApiKey: "peer-published-key",
      },
    });
    assert(parsed.ok, "peer snapshot parses");
    if (parsed.ok) {
      assert(!("apiKey" in parsed.app), "peer snapshot omits apiKey");
      assert(!("publishedApiKey" in parsed.app), "peer snapshot omits publishedApiKey");
      assert(
        !JSON.stringify(parsed.app).includes("peer-published-key"),
        "peer snapshot omits the published key value"
      );
      assert(
        !JSON.stringify(parsed.app).includes("peer-draft-key"),
        "peer snapshot omits the draft key value"
      );
    }
  });

  if (failures > 0) {
    console.error(`\nstore.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("store.selftest: all assertions passed");
}

main().catch((err) => {
  console.error("store.selftest crashed:", err);
  process.exit(1);
});
