/**
 * Self-test: configuration version JSON store, backfill, and published repair (Task 1.2).
 * Run: npx tsx lib/app-config-versions/store.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { AppConfig, PromptBuilderState } from "../app-store/types";
import { snapshotFromApp } from "./rules";
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

  const { createApp, getAppById, updateApp } = await import("../app-store/store");
  const {
    ensurePublishedVersion,
    listConfigVersions,
    prepareConfigVersionStore,
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
      const createdLate = await createApp(late);
      assertEqual(
        (await listConfigVersions(late.id)).length,
        0,
        "creating a bot does not insert a version"
      );

      const lateNow = "2026-09-27T19:00:00.000Z";
      const lateVersion = await ensurePublishedVersion(createdLate, lateNow);
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
        createdLate,
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
        1,
        "renaming a bot does not insert a version"
      );
      assertEqual(
        publishedAfterRename[0] ? snapshotOf(publishedAfterRename[0]) : null,
        snapshotFromApp(published),
        "renaming a bot does not change the stored snapshot"
      );

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
    const patched = await updateApp(seeded.id, { description: "Updated description" });
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
    assertEqual(
      (await listConfigVersions(seeded.id)).length,
      0,
      "round-trip does not insert a version"
    );
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
