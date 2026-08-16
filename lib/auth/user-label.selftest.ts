/**
 * Self-test: person display labels.
 * Run: npx tsx lib/auth/user-label.selftest.ts
 */
import { labelForUserId, readUserLabels, userDisplayLabel } from "./user-label";

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
  assertEqual(
    userDisplayLabel({
      userId: "uuid-1",
      name: "Ada Lovelace",
      email: "ada@school.edu",
    }),
    "Ada Lovelace",
    "prefers name over email"
  );
  assertEqual(
    userDisplayLabel({
      userId: "uuid-1",
      name: "  ",
      email: "ada@school.edu",
    }),
    "ada@school.edu",
    "falls back to email when name is blank"
  );
  assertEqual(
    userDisplayLabel({ userId: "uuid-1", name: null, email: null }),
    "uuid-1",
    "falls back to user id when name and email are missing"
  );
  assertEqual(
    labelForUserId("uuid-1", { "uuid-1": "ada@school.edu" }),
    "ada@school.edu",
    "label map overrides the raw id"
  );
  assertEqual(
    labelForUserId("uuid-1", {}),
    "uuid-1",
    "missing map entry keeps the raw id"
  );
  assertEqual(
    readUserLabels({ "uuid-1": "ada@school.edu", skip: "  " }),
    { "uuid-1": "ada@school.edu" },
    "readUserLabels keeps non-empty string labels"
  );
  assertEqual(readUserLabels(null), {}, "readUserLabels ignores null");

  if (failures > 0) {
    console.error(`\nuser-label.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("user-label.selftest: all assertions passed");
}

main();
