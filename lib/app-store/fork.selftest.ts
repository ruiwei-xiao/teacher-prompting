/**
 * Self-test: AppForkHelper (Task 3.2).
 * Shared fork clones a bot into a caller-owned app with forkedFrom* and empty apiKey.
 *
 * Run: npx tsx lib/app-store/fork.selftest.ts
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

function stubApp(overrides: Partial<AppConfig> & Pick<AppConfig, "id">): AppConfig {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "owner-a",
    name: overrides.name ?? `App ${overrides.id}`,
    description: overrides.description ?? "A source bot",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o",
    apiKey: overrides.apiKey ?? "source-secret-key",
    variability: overrides.variability ?? 0.5,
    systemPrompt: overrides.systemPrompt ?? "You are helpful.",
    builderState: overrides.builderState,
    projectShareSlug: overrides.projectShareSlug,
    shareAuthorName: overrides.shareAuthorName,
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

  const { forkApp } = await import("./fork");
  const { getAppById, listApps } = await import("./store");

  const source = stubApp({
    id: "math-tutor",
    name: "Math Tutor",
    ownerId: "teacher-a",
    apiKey: "never-copy-me",
    projectShareSlug: "math-tutor-share",
    systemPrompt: "Teach math patiently.",
    description: "Algebra helper",
    variability: 0.3,
  });

  await withTempApps([source], async () => {
    const forked = await forkApp({
      source,
      ownerId: "teacher-b",
      forkedFromAuthorName: "Alice Teacher",
    });

    assertEqual(forked.ownerId, "teacher-b", "fork owner is caller");
    assertEqual(forked.apiKey, "", "fork apiKey is empty");
    assertEqual(forked.name, "Math Tutor Copy", "fork name suffix");
    assertEqual(forked.id, "math-tutor-copy", "fork id slug");
    assertEqual(forked.description, "Algebra helper", "copies description");
    assertEqual(forked.provider, "openai", "copies provider");
    assertEqual(forked.model, "gpt-4o", "copies model");
    assertEqual(forked.variability, 0.3, "copies variability");
    assertEqual(
      forked.systemPrompt,
      "Teach math patiently.",
      "copies systemPrompt"
    );
    assertEqual(
      forked.forkedFromProjectName,
      "Math Tutor",
      "sets forkedFromProjectName"
    );
    assertEqual(
      forked.forkedFromProjectShareSlug,
      "math-tutor-share",
      "sets forkedFromProjectShareSlug"
    );
    assertEqual(
      forked.forkedFromAuthorName,
      "Alice Teacher",
      "sets forkedFromAuthorName"
    );
    assert(
      forked.projectShareSlug === undefined,
      "does not copy projectShareSlug onto fork"
    );
    assert(
      forked.publicSlug === undefined,
      "does not copy publicSlug onto fork"
    );

    const persisted = await getAppById(forked.id);
    assert(persisted !== null, "fork is persisted");
    assertEqual(persisted?.apiKey, "", "persisted apiKey empty");
    assertEqual(persisted?.ownerId, "teacher-b", "persisted owner");

    const sourceStill = await getAppById("math-tutor");
    assertEqual(sourceStill?.ownerId, "teacher-a", "source ownership unchanged");
    assertEqual(sourceStill?.apiKey, "never-copy-me", "source apiKey unchanged");
  });

  // Unique id/name when collisions exist
  const existingCopy = stubApp({
    id: "math-tutor-copy",
    name: "Math Tutor Copy",
    ownerId: "teacher-b",
    apiKey: "",
  });
  const existingCopy2 = stubApp({
    id: "math-tutor-copy-2",
    name: "Math Tutor Copy 2",
    ownerId: "teacher-b",
    apiKey: "",
  });

  await withTempApps([source, existingCopy, existingCopy2], async () => {
    const forked = await forkApp({
      source,
      ownerId: "teacher-b",
      forkedFromAuthorName: "Alice Teacher",
    });
    assertEqual(forked.id, "math-tutor-copy-3", "increments id on collision");
    assertEqual(
      forked.name,
      "Math Tutor Copy 3",
      "increments name on collision"
    );

    const owned = await listApps("teacher-b");
    assertEqual(owned.length, 3, "caller owns three apps after second fork");
  });

  // Empty / special name falls back to "project-copy"
  const weird = stubApp({
    id: "emoji-bot",
    name: "!!!",
    ownerId: "teacher-a",
    apiKey: "secret",
  });
  await withTempApps([weird], async () => {
    const forked = await forkApp({
      source: weird,
      ownerId: "teacher-c",
      forkedFromAuthorName: "Anonymous teacher",
    });
    assertEqual(forked.id, "project-copy", "fallback id for non-alphanumeric name");
    assertEqual(forked.name, "!!! Copy", "keeps original name for display copy");
  });

  if (failures > 0) {
    console.error(`\nfork.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("fork.selftest: all assertions passed");
}

main().catch((err) => {
  console.error("fork.selftest crashed:", err);
  process.exit(1);
});
