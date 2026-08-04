/**
 * Self-test for shouldShowTestCaseRail helper.
 * Run: npx tsx lib/assisted-authoring/test-case-rail.selftest.ts
 */

import { shouldShowTestCaseRail } from "./test-case-rail";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

const beforeHydrate = shouldShowTestCaseRail(false);
assert(
  beforeHydrate === false,
  `Expected shouldShowTestCaseRail(false) to hide panel before hydrate, got ${beforeHydrate}`
);

const afterHydrate = shouldShowTestCaseRail(true);
assert(
  afterHydrate === true,
  `Expected shouldShowTestCaseRail(true) to show panel after hydrate (ON or OFF), got ${afterHydrate}`
);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}

console.log("OK: shouldShowTestCaseRail");
