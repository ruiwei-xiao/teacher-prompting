/**
 * Self-test: HTTP API contract for assistedAuthoringMode (Task 1.3).
 * Tests the full flow: create default OFF, GET, PATCH with validation.
 *
 * Run: npx tsx lib/app-store/api-contract.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { AppConfig } from "@/lib/app-store/types";
import {
  createDefaultBotFields,
  validateAssistedAuthoringMode,
} from "./patch-validation";
import { resolveAssistedAuthoringMode } from "@/lib/assisted-authoring/resolve";

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

function stubApp(overrides: Partial<AppConfig> & Pick<AppConfig, "id">): AppConfig {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "owner-a",
    name: overrides.name ?? `App ${overrides.id}`,
    description: overrides.description ?? "Test bot",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o",
    apiKey: overrides.apiKey ?? "test-key",
    variability: overrides.variability ?? 0.5,
    systemPrompt: overrides.systemPrompt ?? "You are helpful.",
    assistedAuthoringMode: overrides.assistedAuthoringMode,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
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

  const { createApp, getAppById, updateApp } = await import("./store");

  console.log(
    "Test 1: POST /api/apps creates bot with assistedAuthoringMode=false"
  );
  const defaults = createDefaultBotFields();
  assertEqual(
    defaults.assistedAuthoringMode,
    false,
    "createDefaultBotFields returns false"
  );

  const newBot = stubApp({
    id: "new-bot-via-post",
    name: "New Bot",
    assistedAuthoringMode: defaults.assistedAuthoringMode,
  });

  await withTempApps([], async () => {
    await createApp(newBot);
    const retrieved = await getAppById(newBot.id);

    assert(retrieved !== null, "bot created");
    assertEqual(
      retrieved?.assistedAuthoringMode,
      false,
      "POST create stores OFF (false)"
    );
    assertEqual(
      resolveAssistedAuthoringMode(retrieved!),
      false,
      "resolves to OFF"
    );
  });

  console.log("Test 2: GET /api/apps/[appId] returns assistedAuthoringMode");
  const botWithMode = stubApp({
    id: "bot-with-mode",
    name: "Bot With Mode",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botWithMode);
    const retrieved = await getAppById(botWithMode.id);

    assert(retrieved !== null, "bot exists");
    assert(
      "assistedAuthoringMode" in retrieved!,
      "GET response includes assistedAuthoringMode field"
    );
    assertEqual(
      retrieved?.assistedAuthoringMode,
      true,
      "GET returns stored true"
    );
  });

  console.log("Test 3: GET returns undefined for legacy bots (missing field)");
  const legacyBot = stubApp({
    id: "legacy-bot",
    name: "Legacy Bot",
    // assistedAuthoringMode intentionally omitted
  });

  await withTempApps([], async () => {
    await createApp(legacyBot);
    const retrieved = await getAppById(legacyBot.id);

    assert(retrieved !== null, "legacy bot exists");
    assertEqual(
      retrieved?.assistedAuthoringMode,
      undefined,
      "GET returns undefined for legacy bots (not coerced to false)"
    );
    assertEqual(
      resolveAssistedAuthoringMode(retrieved!),
      true,
      "legacy bots resolve to ON (true)"
    );
  });

  console.log(
    "Test 4: PATCH /api/apps/[appId] with assistedAuthoringMode=true round-trips"
  );
  const botToPatchOn = stubApp({
    id: "bot-patch-on",
    name: "Bot Patch On",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botToPatchOn);

    // Simulate PATCH validation
    const patchBody = { assistedAuthoringMode: true };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(validation.ok, "PATCH validation passes for true");

    const updated = await updateApp(botToPatchOn.id, {
      assistedAuthoringMode: validation.ok ? validation.value : undefined,
    });

    assert(updated !== null, "update succeeded");
    assertEqual(
      updated?.assistedAuthoringMode,
      true,
      "PATCH true persists"
    );

    const retrieved = await getAppById(botToPatchOn.id);
    assertEqual(
      retrieved?.assistedAuthoringMode,
      true,
      "PATCH true round-trips on GET"
    );
  });

  console.log(
    "Test 5: PATCH /api/apps/[appId] with assistedAuthoringMode=false round-trips"
  );
  const botToPatchOff = stubApp({
    id: "bot-patch-off",
    name: "Bot Patch Off",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botToPatchOff);

    const patchBody = { assistedAuthoringMode: false };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(validation.ok, "PATCH validation passes for false");

    const updated = await updateApp(botToPatchOff.id, {
      assistedAuthoringMode: validation.ok ? validation.value : undefined,
    });

    assert(updated !== null, "update succeeded");
    assertEqual(
      updated?.assistedAuthoringMode,
      false,
      "PATCH false persists"
    );

    const retrieved = await getAppById(botToPatchOff.id);
    assertEqual(
      retrieved?.assistedAuthoringMode,
      false,
      "PATCH false round-trips on GET"
    );
  });

  console.log(
    "Test 6: PATCH with invalid assistedAuthoringMode type returns 400"
  );
  const invalidBodies = [
    { assistedAuthoringMode: "true" },
    { assistedAuthoringMode: 1 },
    { assistedAuthoringMode: null },
    { assistedAuthoringMode: {} },
    { assistedAuthoringMode: [] },
    { assistedAuthoringMode: undefined }, // explicit undefined in body
  ];

  for (const body of invalidBodies) {
    const validation = validateAssistedAuthoringMode(body);
    assert(
      !validation.ok,
      `PATCH rejects ${JSON.stringify(body.assistedAuthoringMode)}`
    );
    if (!validation.ok) {
      assertEqual(validation.status, 400, "status is 400");
      assert(
        validation.error.includes("boolean"),
        "error mentions boolean"
      );
    }
  }

  console.log("Test 7: PATCH without assistedAuthoringMode leaves field unchanged");
  const botNoChange = stubApp({
    id: "bot-no-change",
    name: "Bot No Change",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botNoChange);

    const patchBody = { name: "Updated Name" };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(validation.ok, "validation passes when field absent");
    assertEqual(validation.value, undefined, "value is undefined");

    const updated = await updateApp(botNoChange.id, { name: "Updated Name" });

    assert(updated !== null, "update succeeded");
    assertEqual(
      updated?.assistedAuthoringMode,
      true,
      "assistedAuthoringMode unchanged"
    );
  });

  console.log(
    "Test 8: PATCH rejects non-boolean without silently coercing"
  );
  const botNonBoolean = stubApp({
    id: "bot-non-boolean",
    name: "Bot Non Boolean",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botNonBoolean);

    // Try PATCH with string "true"
    const patchBody = { assistedAuthoringMode: "true" as any };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(!validation.ok, "validation fails for string 'true'");

    // Verify bot state unchanged
    const unchanged = await getAppById(botNonBoolean.id);
    assertEqual(
      unchanged?.assistedAuthoringMode,
      false,
      "bot state not coerced or changed"
    );
  });

  console.log("Test 9: Multiple PATCH round-trips preserve exact values");
  const botMultiPatch = stubApp({
    id: "bot-multi-patch",
    name: "Bot Multi Patch",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botMultiPatch);

    // false -> true
    await updateApp(botMultiPatch.id, { assistedAuthoringMode: true });
    let current = await getAppById(botMultiPatch.id);
    assertEqual(current?.assistedAuthoringMode, true, "first patch: false->true");

    // true -> false
    await updateApp(botMultiPatch.id, { assistedAuthoringMode: false });
    current = await getAppById(botMultiPatch.id);
    assertEqual(current?.assistedAuthoringMode, false, "second patch: true->false");

    // false -> true again
    await updateApp(botMultiPatch.id, { assistedAuthoringMode: true });
    current = await getAppById(botMultiPatch.id);
    assertEqual(current?.assistedAuthoringMode, true, "third patch: false->true");
  });

  console.log(
    "Test 10: Owner-scoped responses maintain assistedAuthoringMode visibility"
  );
  const botOwnerScoped = stubApp({
    id: "bot-owner-scoped",
    name: "Bot Owner Scoped",
    ownerId: "owner-123",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botOwnerScoped);

    // GET with ownerId
    const retrieved = await getAppById(botOwnerScoped.id, "owner-123");
    assert(retrieved !== null, "owner can retrieve bot");
    assertEqual(
      retrieved?.assistedAuthoringMode,
      false,
      "owner sees assistedAuthoringMode"
    );

    // GET without matching ownerId should not find bot (owner-scoped)
    const notFound = await getAppById(botOwnerScoped.id, "different-owner");
    assertEqual(notFound, null, "different owner cannot retrieve bot");
  });

  if (failures > 0) {
    console.error(`\napi-contract.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\napi-contract.selftest: all assertions passed");
}

main().catch((err) => {
  console.error("api-contract.selftest crashed:", err);
  process.exit(1);
});
