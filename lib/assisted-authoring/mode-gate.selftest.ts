/**
 * Runtime self-test for mode-gate helper (Task 3.3).
 * Run: npx tsx lib/assisted-authoring/mode-gate.selftest.ts
 */

import { isAssistedBehaviorEnabled } from "./mode-gate";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

// Test case 1: When mode is true, should return true
const trueResult = isAssistedBehaviorEnabled(true);
assert(
  trueResult === true,
  `isAssistedBehaviorEnabled(true) should return true, got ${trueResult}`
);

// Test case 2: When mode is false, should return false
const falseResult = isAssistedBehaviorEnabled(false);
assert(
  falseResult === false,
  `isAssistedBehaviorEnabled(false) should return false, got ${falseResult}`
);

// Test case 3: When mode is undefined, should default to true (backward compatibility)
const undefinedResult = isAssistedBehaviorEnabled(undefined);
assert(
  undefinedResult === true,
  `isAssistedBehaviorEnabled(undefined) should default to true, got ${undefinedResult}`
);

if (failures > 0) {
  console.error(`\nmode-gate.selftest: ${failures} failure(s)`);
  process.exit(1);
}

console.log("mode-gate.selftest: all assertions passed");
