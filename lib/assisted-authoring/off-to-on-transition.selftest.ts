/**
 * Selftest for OFF→ON transition planning (Task 3.5, Task 4.2).
 * 
 * Run: npx tsx lib/assisted-authoring/off-to-on-transition.selftest.ts
 */

// Mock localStorage for Node.js environment
if (typeof window === "undefined" && typeof localStorage === "undefined") {
  const store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
}

import {
  planOffToOnTransition,
  fingerprintFinalPrompt,
  saveAssistedAuthoringSnapshot,
  clearAssistedAuthoringSnapshot,
} from "./snapshot";
import type { AssistedAuthoringSnapshot } from "./types";
import { shouldPersistOffToOnTransition } from "./off-to-on-transition";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
}

function runShouldPersistOffToOnTransitionTests() {
  console.log("\n## shouldPersistOffToOnTransition tests");

  // 1. Not hydrated yet → skip (still using default)
  assert(
    !shouldPersistOffToOnTransition(false, null, true),
    "Skip when not hydrated (false, null, true)"
  );
  assert(
    !shouldPersistOffToOnTransition(false, false, true),
    "Skip when not hydrated (false, false, true)"
  );

  // 2. Hydrated but no previous value → skip (first transition)
  assert(
    !shouldPersistOffToOnTransition(true, null, true),
    "Skip when previous is null (true, null, true)"
  );
  assert(
    !shouldPersistOffToOnTransition(true, null, false),
    "Skip when previous is null (true, null, false)"
  );

  // 3. Genuine OFF→ON transition after hydration
  assert(
    shouldPersistOffToOnTransition(true, false, true),
    "Trigger OFF→ON restore/regenerate (true, false, true)"
  );

  // 4. Other transitions should skip
  assert(
    !shouldPersistOffToOnTransition(true, true, true),
    "Skip ON→ON (true, true, true)"
  );
  assert(
    !shouldPersistOffToOnTransition(true, true, false),
    "Skip ON→OFF (true, true, false) - handled by ON→OFF planner"
  );
  assert(
    !shouldPersistOffToOnTransition(true, false, false),
    "Skip OFF→OFF (true, false, false)"
  );

  console.log("✅ All shouldPersistOffToOnTransition tests passed");
}

function runOffToOnPlanningTests() {
  console.log("\n## OFF→ON planning tests");

  const testAppId = "test-off-to-on-app";
  clearAssistedAuthoringSnapshot(testAppId);

  const plan1 = planOffToOnTransition({
    appId: testAppId,
    currentFinalPrompt: "Test prompt",
  });
  assert(plan1.action === "regenerate", "Missing snapshot should plan regenerate");
  console.log("✅ Test 1: Missing snapshot → regenerate");

  const savedPrompt = "This is my teaching prompt.";
  const snapshot: AssistedAuthoringSnapshot = {
    appId: testAppId,
    promptFingerprint: fingerprintFinalPrompt(savedPrompt),
    testCases: [{ id: "case-1" }],
    savedAt: new Date().toISOString(),
  };
  saveAssistedAuthoringSnapshot(snapshot);

  const plan2 = planOffToOnTransition({
    appId: testAppId,
    currentFinalPrompt: savedPrompt,
  });
  assert(
    plan2.action === "regenerate",
    "Leftover matching snapshot must still regenerate (no restore)"
  );
  console.log("✅ Test 2: Leftover snapshot → regenerate (discard policy)");

  const plan3 = planOffToOnTransition({
    appId: testAppId,
    currentFinalPrompt: "Different prompt now",
  });
  assert(plan3.action === "regenerate", "Changed prompt should plan regenerate");
  console.log("✅ Test 3: Changed prompt → regenerate");

  clearAssistedAuthoringSnapshot(testAppId);
  console.log("✅ All OFF→ON planning tests passed");
}

function runAllTests() {
  console.log("=== OFF→ON Transition Selftest ===");
  try {
    runShouldPersistOffToOnTransitionTests();
    runOffToOnPlanningTests();
    console.log("\n✅ All OFF→ON transition selftests passed!\n");
  } catch (error) {
    console.error("\n❌ Selftest failed:", error);
    process.exit(1);
  }
}

runAllTests();
