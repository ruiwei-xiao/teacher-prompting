/**
 * Self-test: starred app id Set helper (Task 4.1).
 * Run: npx tsx lib/star-ui/starred-ids.selftest.ts
 */
import { starredAppIdsFromList } from "./starred-ids";

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

function main(): void {
  const empty = starredAppIdsFromList([]);
  assert(empty instanceof Set, "returns a Set");
  assertEqual(empty.size, 0, "empty list → empty Set");

  const ids = starredAppIdsFromList([
    { appId: "app_a" },
    { appId: "app_b" },
    { appId: "app_a" },
  ]);
  assertEqual(ids.size, 2, "dedupes appIds");
  assert(ids.has("app_a"), "includes app_a");
  assert(ids.has("app_b"), "includes app_b");
  assert(!ids.has("app_c"), "excludes unknown ids");

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("OK: starred-ids.selftest passed");
}

main();
