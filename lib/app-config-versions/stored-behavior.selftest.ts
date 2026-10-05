/**
 * Self-check: stored configuration-version behavior on the JSON store (Task 4.1).
 * Drives create, in-window save, pin, publish, edit, revert, fork, session stamp, and repair.
 *
 * Run: npx tsx lib/app-config-versions/stored-behavior.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { AppConfig, PromptBuilderState } from "../app-store/types";
import type { UpsertSessionTurnInput } from "../chat-session-store/types";
import { snapshotFromApp } from "./rules";
import type { ConfigSnapshot, ConfigVersionRecord } from "./types";

let failures = 0;

class CheckError extends Error {}

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

function must<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    failures += 1;
    console.error(`FAIL: ${message}`);
    throw new CheckError(message);
  }
  return value;
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
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "teacher-a",
    name: overrides.name ?? "Stored Behavior",
    description: overrides.description ?? "A tutoring bot",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4.1",
    apiKey: overrides.apiKey ?? "draft-key-1",
    variability: overrides.variability ?? 0.4,
    systemPrompt: overrides.systemPrompt ?? "Opening prompt",
    builderState: overrides.builderState ?? builderState(),
    assistedAuthoringMode: overrides.assistedAuthoringMode ?? false,
    publishedAt: overrides.publishedAt,
    publishedVersionId: overrides.publishedVersionId,
    publishedApiKey: overrides.publishedApiKey,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
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

function sessionTurn(content: string): UpsertSessionTurnInput {
  const at = "2026-09-28T18:00:00.000Z";
  return {
    id: "stored-behavior-session",
    appId: "stored-behavior-bot",
    appName: "Stored Behavior",
    ownerId: "teacher-a",
    participantId: "student-1",
    participantName: "Sam",
    surface: "editor-test",
    shared: true,
    messages: [
      { role: "user", content, at },
      { role: "assistant", content: "Reply", at },
    ],
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

async function withTempStore(fn: () => Promise<void>): Promise<void> {
  const dir = path.join(process.cwd(), ".data");
  const appsFile = path.join(dir, "apps.json");
  const versionsFile = path.join(dir, "app-config-versions.json");
  const sessionsFile = path.join(dir, "chat-sessions.json");
  await fs.mkdir(dir, { recursive: true });
  const previousApps = await readOptional(appsFile);
  const previousVersions = await readOptional(versionsFile);
  const previousSessions = await readOptional(sessionsFile);
  await fs.writeFile(appsFile, JSON.stringify([], null, 2), "utf-8");
  await fs.writeFile(versionsFile, JSON.stringify({ versions: [] }, null, 2), "utf-8");
  await fs.writeFile(sessionsFile, JSON.stringify({ sessions: [] }, null, 2), "utf-8");
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
  const { forkApp } = await import("../app-store/fork");
  const {
    ensurePublishedVersion,
    listConfigVersions,
    pinSessionSnapshot,
    revertToConfigVersion,
  } = await import("./store");
  const { getSessionById, upsertSessionTurn } = await import("../chat-session-store/store");

  const stamped = new Date().toISOString();
  const bot = stubApp({
    id: "stored-behavior-bot",
    name: "Stored Behavior",
    ownerId: "teacher-a",
    apiKey: "draft-key-1",
    provider: "openai",
    model: "gpt-4.1",
    variability: 0.4,
    systemPrompt: "Opening prompt",
    builderState: builderState(),
    assistedAuthoringMode: false,
    createdAt: stamped,
    updatedAt: stamped,
  });

  await withTempStore(async () => {
    const created = await createApp(bot);
    const createdVersions = await listConfigVersions(bot.id);
    assertEqual(createdVersions.length, 1, "creating a bot yields one version");
    const createdVersion = must(createdVersions[0], "createApp stores a version");
    assertEqual(createdVersion.kind, "edit", "the first version is an edit");
    assertEqual(createdVersion.sealedAt, null, "the first version is an unsealed draft");
    assert(createdVersion.createdAt.length > 0, "the version stores a created time");
    assert(createdVersion.updatedAt.length > 0, "the version stores a last-updated time");
    assertEqual(
      snapshotOf(createdVersion),
      snapshotFromApp(created),
      "the first version matches the bot"
    );
    const storedCreated = await getAppById(bot.id);
    assert(
      storedCreated?.publishedVersionId == null,
      "creating a bot leaves the published pointer empty"
    );

    const trimmed = must(
      await updateApp(bot.id, { systemPrompt: "Opening prompt\n" }),
      "a trailing newline save returns the app"
    );
    const trimmedVersions = await listConfigVersions(bot.id);
    assertEqual(trimmedVersions.length, 1, "a trailing newline does not add a version");
    const trimmedVersion = must(trimmedVersions[0], "the original version remains");
    assertEqual(trimmedVersion.id, createdVersion.id, "a trailing newline keeps the same version");
    assertEqual(
      trimmedVersion.updatedAt,
      createdVersion.updatedAt,
      "a trailing newline does not touch the version time"
    );
    assertEqual(trimmedVersion.systemPrompt, "Opening prompt", "a trailing newline keeps the stored prompt");
    assertEqual(trimmed.systemPrompt, "Opening prompt", "a trailing newline keeps the app prompt");

    const saved = must(
      await updateApp(bot.id, { systemPrompt: "Prompt after first save" }),
      "in-window save returns the app"
    );
    const savedVersions = await listConfigVersions(bot.id);
    assertEqual(savedVersions.length, 1, "an in-window save keeps one version");
    const savedVersion = must(savedVersions[0], "in-window save keeps the version row");
    assertEqual(savedVersion.id, createdVersion.id, "an in-window save updates the same version");
    assertEqual(
      savedVersion.createdAt,
      createdVersion.createdAt,
      "an in-window save keeps the created time"
    );
    assert(
      savedVersion.updatedAt !== createdVersion.updatedAt,
      "an in-window save changes the last-updated time"
    );
    assertEqual(
      savedVersion.systemPrompt,
      "Prompt after first save",
      "an in-window save stores the new prompt"
    );
    assertEqual(savedVersion.sealedAt, null, "an in-window save leaves the draft unsealed");
    assertEqual(
      snapshotFromApp(saved),
      snapshotOf(savedVersion),
      "an in-window save matches the app row to the draft"
    );

    const pinned = await pinSessionSnapshot({
      appId: bot.id,
      versionId: savedVersion.id,
      now: new Date().toISOString(),
    });
    const afterPin = await listConfigVersions(bot.id);
    const draftAfterPin = must(
      afterPin.find((version) => version.id === savedVersion.id),
      "the draft remains after a pin"
    );
    assertEqual(draftAfterPin.sealedAt, null, "a pin of the draft leaves it unsealed");
    assertEqual(draftAfterPin.kind, "edit", "a pin leaves the draft as an edit");
    assertEqual(draftAfterPin.createdAt, createdVersion.createdAt, "a pin keeps the draft created time");
    assert(
      pinned.configVersionId !== savedVersion.id,
      "a pin of an unsealed draft returns a session copy id"
    );
    const sessionCopy = must(
      afterPin.find((version) => version.id === pinned.configVersionId),
      "a pin inserts a session copy"
    );
    assertEqual(sessionCopy.kind, "session", "the pinned row is a session copy");
    const sessionSnapshot = JSON.stringify(snapshotOf(sessionCopy));

    const revised = must(
      await updateApp(bot.id, { systemPrompt: "Prompt after pin" }),
      "a save after pin returns the app"
    );
    const afterRevise = await listConfigVersions(bot.id);
    assertEqual(afterRevise.length, afterPin.length, "a save after pin updates the same draft");
    const draftAfterRevise = must(
      afterRevise.find((version) => version.id === savedVersion.id),
      "the draft remains after the post-pin save"
    );
    assertEqual(
      draftAfterRevise.createdAt,
      createdVersion.createdAt,
      "a save after pin keeps the draft created time"
    );
    assertEqual(draftAfterRevise.sealedAt, null, "a save after pin leaves the draft unsealed");
    assertEqual(
      draftAfterRevise.systemPrompt,
      "Prompt after pin",
      "a save after pin updates that draft"
    );
    assertEqual(
      snapshotFromApp(revised),
      snapshotOf(draftAfterRevise),
      "a save after pin matches the app row to the draft"
    );
    const copyAfterRevise = must(
      afterRevise.find((version) => version.id === pinned.configVersionId),
      "the session copy remains after the post-pin save"
    );
    assertEqual(
      JSON.stringify(snapshotOf(copyAfterRevise)),
      sessionSnapshot,
      "a later draft save leaves the session copy unchanged"
    );

    const idsBeforeStamp = (await listConfigVersions(bot.id)).map((version) => version.id).sort();
    await upsertSessionTurn(sessionTurn("First turn"), pinned.configVersionId);
    assertEqual(
      (await listConfigVersions(bot.id)).map((version) => version.id).sort(),
      idsBeforeStamp,
      "recording a session does not add a configuration version"
    );
    const started = await getSessionById("stored-behavior-session");
    assertEqual(
      started?.configVersionId,
      pinned.configVersionId,
      "a new session stores the server-supplied starting version"
    );

    const published = must(
      await updateApp(bot.id, {
        publishedAt: "2026-09-28T12:00:00.000Z",
        publicSlug: "stored-behavior",
      }),
      "publish returns the app"
    );
    const pointer = published.publishedVersionId;
    assert(
      typeof pointer === "string" && pointer.length > 0,
      "publish sets the published pointer"
    );
    const publishedRow = must(
      (await listConfigVersions(bot.id)).find((version) => version.id === pointer),
      "publish seals a version row"
    );
    const publishedSnapshot = JSON.stringify(snapshotOf(publishedRow));
    assertEqual(
      publishedRow.systemPrompt,
      "Prompt after pin",
      "publish keeps the current draft snapshot"
    );

    const edited = must(
      await updateApp(bot.id, { systemPrompt: "Prompt after publish" }),
      "an edit after publish returns the app"
    );
    const afterEdit = await listConfigVersions(bot.id);
    const stillPublished = must(
      afterEdit.find((version) => version.id === pointer),
      "the published version remains after a later edit"
    );
    assertEqual(
      JSON.stringify(snapshotOf(stillPublished)),
      publishedSnapshot,
      "publish then edit leaves the published snapshot unchanged"
    );
    assertEqual(edited.publishedVersionId, pointer, "an edit leaves the published pointer");
    assert(
      afterEdit.some(
        (version) => version.id !== pointer && version.systemPrompt === "Prompt after publish"
      ),
      "an edit after publish stores the new prompt on a draft"
    );
    const duringEdit = await getSessionById("stored-behavior-session");
    assertEqual(
      duringEdit?.configVersionId,
      pinned.configVersionId,
      "an edit leaves the session starting version unchanged"
    );

    const beforeRevert = await listConfigVersions(bot.id);
    const beforeRevertIds = beforeRevert.map((version) => version.id).sort();
    const currentApp = must(await getAppById(bot.id), "the app row exists before revert");
    const reverted = await revertToConfigVersion({
      app: currentApp,
      sourceVersionId: pointer,
      now: new Date().toISOString(),
    });
    assert(reverted.ok, "revert of a published edit version succeeds");
    if (!reverted.ok) {
      throw new CheckError("revert failed");
    }
    const afterRevert = await listConfigVersions(bot.id);
    assertEqual(
      afterRevert.map((version) => version.id).sort(),
      [...beforeRevertIds, reverted.created.id].sort(),
      "revert appends a version and leaves every older version"
    );
    const revertedApp = must(await getAppById(bot.id), "the app row exists after revert");
    assertEqual(
      snapshotFromApp(revertedApp),
      snapshotOf(reverted.created),
      "revert matches the app row to the new draft"
    );
    assertEqual(
      revertedApp.publishedVersionId,
      pointer,
      "revert leaves the published pointer unchanged"
    );
    assertEqual(
      revertedApp.publishedApiKey,
      published.publishedApiKey,
      "revert leaves the published API key unchanged"
    );
    const afterRevertSession = await getSessionById("stored-behavior-session");
    assertEqual(
      afterRevertSession?.configVersionId,
      pinned.configVersionId,
      "revert leaves the session starting version unchanged"
    );

    const idsBeforeSecondTurn = (await listConfigVersions(bot.id))
      .map((version) => version.id)
      .sort();
    await upsertSessionTurn(sessionTurn("Second turn"), "stored-behavior-later-version");
    const laterSession = await getSessionById("stored-behavior-session");
    assertEqual(
      laterSession?.configVersionId,
      pinned.configVersionId,
      "a second turn does not change the starting version"
    );
    assertEqual(
      (await listConfigVersions(bot.id)).map((version) => version.id).sort(),
      idsBeforeSecondTurn,
      "a second turn does not record another configuration version"
    );

    const rotated = must(
      await updateApp(bot.id, { apiKey: "draft-key-2" }),
      "a same-provider key change returns the app"
    );
    assertEqual(
      rotated.publishedApiKey,
      "draft-key-2",
      "a same-provider API key change updates the published key"
    );
    assertEqual(
      rotated.publishedVersionId,
      pointer,
      "a same-provider API key change leaves the published pointer"
    );
    assertEqual(rotated.apiKey, "draft-key-2", "a same-provider API key change stores the draft key");

    const switched = must(
      await updateApp(bot.id, { provider: "google", apiKey: "draft-key-3" }),
      "a provider change returns the app"
    );
    assertEqual(switched.provider, "google", "a provider change updates the draft provider");
    assertEqual(switched.apiKey, "draft-key-3", "a provider change stores the draft API key");
    assertEqual(
      switched.publishedApiKey,
      "draft-key-2",
      "a provider change does not update the published key"
    );
    assertEqual(
      switched.publishedVersionId,
      pointer,
      "a provider change leaves the published pointer"
    );
    const publishedAfterSwitch = must(
      (await listConfigVersions(bot.id)).find((version) => version.id === pointer),
      "the published version remains after a provider change"
    );
    assertEqual(
      publishedAfterSwitch.provider,
      "openai",
      "a provider change leaves the published snapshot provider"
    );

    const source = must(await getAppById(bot.id), "the source bot exists before duplicate");
    const sourceIds = (await listConfigVersions(bot.id)).map((version) => version.id).sort();
    assert(sourceIds.length > 1, "the source bot has several versions before duplicate");
    const forked = await forkApp({
      source,
      ownerId: "teacher-b",
      forkedFromAuthorName: "Ada",
    });
    const forkVersions = await listConfigVersions(forked.id);
    assertEqual(forkVersions.length, 1, "duplicating a bot with several versions yields one version");
    assertEqual(
      (await listConfigVersions(bot.id)).map((version) => version.id).sort(),
      sourceIds,
      "duplicating a bot leaves the source history unchanged"
    );
    const forkVersion = must(forkVersions[0], "the duplicated bot has its version");
    assert(
      !sourceIds.includes(forkVersion.id),
      "the duplicated bot version is not copied from the source history"
    );
    assertEqual(
      snapshotOf(forkVersion),
      snapshotFromApp(forked),
      "the duplicated bot version matches the new bot"
    );

    const repairApp = stubApp({
      id: "stored-repair-bot",
      name: "Repair tutor",
      ownerId: "teacher-a",
      apiKey: "repair-secret-key",
      provider: "openai",
      model: "gpt-4.1",
      variability: 0.25,
      systemPrompt: "Repair prompt",
      builderState: builderState(),
      assistedAuthoringMode: false,
      publishedAt: "2026-04-01T00:00:00.000Z",
      publishedVersionId: null,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });
    const appsFile = path.join(process.cwd(), ".data", "apps.json");
    const appsOnDisk = JSON.parse(await fs.readFile(appsFile, "utf-8")) as AppConfig[];
    appsOnDisk.push(repairApp);
    await fs.writeFile(appsFile, JSON.stringify(appsOnDisk, null, 2), "utf-8");
    assertEqual(
      (await listConfigVersions(repairApp.id)).length,
      0,
      "a published bot with an empty pointer starts with no version rows"
    );
    const repaired = await ensurePublishedVersion(repairApp, "2026-09-28T20:00:00.000Z");
    const repairedVersions = await listConfigVersions(repairApp.id);
    assertEqual(repairedVersions.length, 1, "repair gives a published bot with no versions one version");
    assertEqual(
      snapshotOf(repaired),
      snapshotFromApp(repairApp),
      "the repaired snapshot matches the bot"
    );
    const repairStored = await getAppById(repairApp.id);
    assertEqual(
      repairStored?.publishedVersionId,
      repaired.id,
      "repair points the published bot at that version"
    );
  });

  if (failures > 0) {
    console.error(`\nstored-behavior.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("stored-behavior.selftest: all assertions passed");
}

main().catch((err: unknown) => {
  if (err instanceof CheckError) {
    console.error(`\nstored-behavior.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.error("stored-behavior.selftest crashed:", err);
  process.exit(1);
});
