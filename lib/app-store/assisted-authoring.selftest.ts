/**
 * Self-test: Assisted Authoring Mode persistence (Task 1.2).
 * Validates that the store preserves false vs undefined for assistedAuthoringMode.
 *
 * Run: npx tsx lib/app-store/assisted-authoring.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { AppConfig } from "@/lib/app-store/types";
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

  console.log("Test 1: Create bot with assistedAuthoringMode=false preserves false");
  const botOff = stubApp({
    id: "bot-explicit-off",
    name: "Bot Explicit Off",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botOff);
    const persisted = await getAppById(botOff.id);
    
    assert(persisted !== null, "bot persisted");
    assertEqual(
      persisted?.assistedAuthoringMode,
      false,
      "stored false is preserved"
    );
    assertEqual(
      resolveAssistedAuthoringMode(persisted!),
      false,
      "resolves to OFF (false)"
    );
  });

  console.log("Test 2: Create bot with assistedAuthoringMode=true preserves true");
  const botOn = stubApp({
    id: "bot-explicit-on",
    name: "Bot Explicit On",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botOn);
    const persisted = await getAppById(botOn.id);
    
    assert(persisted !== null, "bot persisted");
    assertEqual(
      persisted?.assistedAuthoringMode,
      true,
      "stored true is preserved"
    );
    assertEqual(
      resolveAssistedAuthoringMode(persisted!),
      true,
      "resolves to ON (true)"
    );
  });

  console.log("Test 3: Create bot with assistedAuthoringMode=undefined leaves undefined");
  const botUndefined = stubApp({
    id: "bot-legacy",
    name: "Bot Legacy",
  });

  await withTempApps([], async () => {
    await createApp(botUndefined);
    const persisted = await getAppById(botUndefined.id);
    
    assert(persisted !== null, "bot persisted");
    assertEqual(
      persisted?.assistedAuthoringMode,
      undefined,
      "undefined is preserved (not coerced to true)"
    );
    assertEqual(
      resolveAssistedAuthoringMode(persisted!),
      true,
      "resolves to ON (true) via default"
    );
  });

  console.log("Test 4: Update bot to assistedAuthoringMode=false preserves false");
  const botToUpdate = stubApp({
    id: "bot-to-update",
    name: "Bot To Update",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botToUpdate);
    const updated = await updateApp(botToUpdate.id, { assistedAuthoringMode: false });
    
    assert(updated !== null, "update succeeded");
    assertEqual(
      updated?.assistedAuthoringMode,
      false,
      "update to false is preserved"
    );
    assertEqual(
      resolveAssistedAuthoringMode(updated!),
      false,
      "resolves to OFF (false) after update"
    );

    const reloaded = await getAppById(botToUpdate.id);
    assertEqual(
      reloaded?.assistedAuthoringMode,
      false,
      "false persists across reload"
    );
  });

  console.log("Test 5: Update bot to assistedAuthoringMode=undefined leaves undefined");
  const botToUndefined = stubApp({
    id: "bot-to-undefined",
    name: "Bot To Undefined",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botToUndefined);
    // Explicitly set assistedAuthoringMode to undefined in the patch
    const updated = await updateApp(botToUndefined.id, { 
      assistedAuthoringMode: undefined 
    });
    
    assert(updated !== null, "update succeeded");
    // After update with undefined, the field should remain (not be deleted)
    // This tests that undefined in a patch doesn't accidentally delete the field
    assertEqual(
      updated?.assistedAuthoringMode,
      undefined,
      "update to undefined is preserved"
    );
    assertEqual(
      resolveAssistedAuthoringMode(updated!),
      true,
      "resolves to ON (true) via default"
    );
  });

  if (failures > 0) {
    console.error(`\nassisted-authoring.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nassisted-authoring.selftest: all assertions passed");
}

main().catch((err) => {
  console.error("assisted-authoring.selftest crashed:", err);
  process.exit(1);
});
