/**
 * Runtime self-test for Assisted Authoring Mode resolution (Task 1.1).
 * Run: npx tsx lib/assisted-authoring/resolve.selftest.ts
 */

import { resolveAssistedAuthoringMode } from "./resolve";
import type { AppWithAssistedAuthoring } from "./types";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

// Test case 1: undefined → ON (true)
const undefinedApp: AppWithAssistedAuthoring = {};
const undefinedResult = resolveAssistedAuthoringMode(undefinedApp);
assert(
  undefinedResult === true,
  `undefined mode should resolve to ON (true), got ${undefinedResult}`
);

// Test case 2: explicit true → ON (true)
const trueApp: AppWithAssistedAuthoring = { assistedAuthoringMode: true };
const trueResult = resolveAssistedAuthoringMode(trueApp);
assert(
  trueResult === true,
  `explicit true should resolve to ON (true), got ${trueResult}`
);

// Test case 3: explicit false → OFF (false)
const falseApp: AppWithAssistedAuthoring = { assistedAuthoringMode: false };
const falseResult = resolveAssistedAuthoringMode(falseApp);
assert(
  falseResult === false,
  `explicit false should resolve to OFF (false), got ${falseResult}`
);

// Test case 4: missing field → ON (true) - legacy bot case
const legacyApp = {} as AppWithAssistedAuthoring;
const legacyResult = resolveAssistedAuthoringMode(legacyApp);
assert(
  legacyResult === true,
  `legacy app without field should resolve to ON (true), got ${legacyResult}`
);

if (failures > 0) {
  console.error(`\nresolve.selftest: ${failures} failure(s)`);
  process.exit(1);
}

console.log("resolve.selftest: all assertions passed");
