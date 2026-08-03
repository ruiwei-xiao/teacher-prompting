/**
 * Runtime self-test for ON→OFF transition planner (Task 3.4).
 * Run: npx tsx lib/assisted-authoring/on-to-off-transition.selftest.ts
 */

import { planOnToOffTransition, shouldPersistOnToOffTransition } from "./on-to-off-transition";
import type { OnToOffTransitionInput } from "./on-to-off-transition";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

// Test case 1: Should create save-and-hide plan with valid input
const validInput: OnToOffTransitionInput = {
  appId: "test-app-123",
  testCases: [
    { id: "case-1", name: "Test Case 1" },
    { id: "case-2", name: "Test Case 2" },
  ],
  finalPromptText: "You are a helpful assistant.",
};

const validPlan = planOnToOffTransition(validInput);
assert(
  validPlan.action === "save-and-hide",
  `Should create save-and-hide plan, got ${validPlan.action}`
);

if (validPlan.action === "save-and-hide") {
  assert(
    validPlan.snapshot.appId === "test-app-123",
    `Snapshot appId should match input, got ${validPlan.snapshot.appId}`
  );
  assert(
    JSON.stringify(validPlan.snapshot.testCases) === JSON.stringify(validInput.testCases),
    `Snapshot testCases should match input`
  );
  assert(
    typeof validPlan.snapshot.promptFingerprint === "string" &&
      validPlan.snapshot.promptFingerprint.length > 0,
    `Snapshot should have non-empty promptFingerprint`
  );
  assert(
    typeof validPlan.snapshot.savedAt === "string",
    `Snapshot should have savedAt timestamp`
  );
}

// Test case 2: Should normalize whitespace in Final Prompt for fingerprint
const input1: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: [{ id: "1" }],
  finalPromptText: "Hello   world",
};

const input2: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: [{ id: "1" }],
  finalPromptText: "Hello world",
};

const plan1 = planOnToOffTransition(input1);
const plan2 = planOnToOffTransition(input2);

if (plan1.action === "save-and-hide" && plan2.action === "save-and-hide") {
  assert(
    plan1.snapshot.promptFingerprint === plan2.snapshot.promptFingerprint,
    `Whitespace-normalized prompts should have same fingerprint`
  );
}

// Test case 3: Should handle empty test cases array
const emptyTestCasesInput: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: [],
  finalPromptText: "Test prompt",
};

const emptyTestCasesPlan = planOnToOffTransition(emptyTestCasesInput);
assert(
  emptyTestCasesPlan.action === "save-and-hide",
  `Should accept empty test cases array`
);

if (emptyTestCasesPlan.action === "save-and-hide") {
  assert(
    Array.isArray(emptyTestCasesPlan.snapshot.testCases) &&
      emptyTestCasesPlan.snapshot.testCases.length === 0,
    `Empty test cases should be preserved in snapshot`
  );
}

// Test case 4: Should handle empty Final Prompt
const emptyPromptInput: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: [{ id: "1" }],
  finalPromptText: "",
};

const emptyPromptPlan = planOnToOffTransition(emptyPromptInput);
assert(
  emptyPromptPlan.action === "save-and-hide",
  `Should accept empty Final Prompt`
);

if (emptyPromptPlan.action === "save-and-hide") {
  assert(
    typeof emptyPromptPlan.snapshot.promptFingerprint === "string",
    `Should create fingerprint even for empty prompt`
  );
}

// Test case 5: Should return error plan for missing appId
const missingAppIdInput: OnToOffTransitionInput = {
  appId: "",
  testCases: [{ id: "1" }],
  finalPromptText: "Test",
};

const missingAppIdPlan = planOnToOffTransition(missingAppIdInput);
assert(
  missingAppIdPlan.action === "error",
  `Should return error for missing appId, got ${missingAppIdPlan.action}`
);

if (missingAppIdPlan.action === "error") {
  assert(
    missingAppIdPlan.reason.toLowerCase().includes("appid"),
    `Error reason should mention appId, got: ${missingAppIdPlan.reason}`
  );
}

// Test case 6: Should create different fingerprints for different prompts
const inputA: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: [{ id: "1" }],
  finalPromptText: "Prompt A",
};

const inputB: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: [{ id: "1" }],
  finalPromptText: "Prompt B",
};

const planA = planOnToOffTransition(inputA);
const planB = planOnToOffTransition(inputB);

if (planA.action === "save-and-hide" && planB.action === "save-and-hide") {
  assert(
    planA.snapshot.promptFingerprint !== planB.snapshot.promptFingerprint,
    `Different prompts should have different fingerprints`
  );
}

// Test case 7: Should preserve complex test case structure
const complexTestCases = [
  {
    id: "case-1",
    name: "Complex Case",
    messages: [{ role: "user", content: "Hello" }],
    passed: true,
    studentProfile: { name: "Alice", level: "beginner" },
  },
];

const complexInput: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: complexTestCases,
  finalPromptText: "Test",
};

const complexPlan = planOnToOffTransition(complexInput);
if (complexPlan.action === "save-and-hide") {
  assert(
    JSON.stringify(complexPlan.snapshot.testCases) === JSON.stringify(complexTestCases),
    `Complex test case structure should be preserved exactly`
  );
}

// Test case 8: Should include valid ISO 8601 timestamp
const timestampInput: OnToOffTransitionInput = {
  appId: "test-app",
  testCases: [{ id: "1" }],
  finalPromptText: "Test",
};

const before = new Date();
const timestampPlan = planOnToOffTransition(timestampInput);
const after = new Date();

if (timestampPlan.action === "save-and-hide") {
  const savedAt = new Date(timestampPlan.snapshot.savedAt);
  assert(
    !isNaN(savedAt.getTime()),
    `savedAt should be a valid date`
  );
  assert(
    savedAt.getTime() >= before.getTime() - 1000 && // Allow 1s tolerance
      savedAt.getTime() <= after.getTime() + 1000,
    `savedAt timestamp should be approximately current time`
  );
}

// ==================== RED PHASE OUTPUT for shouldPersistOnToOffTransition ====================
// Expected behaviors (RED PHASE - these should FAIL before implementation):
// 1. Not hydrated → false (skip initial load)
// 2. Hydrated but previous=null → false (skip first real value after hydration)
// 3. Hydrated, previous=false, next=false → false (no transition)
// 4. Hydrated, previous=true, next=true → false (no transition)
// 5. Hydrated, previous=false, next=true → false (OFF→ON, not our case)
// 6. Hydrated, previous=true, next=false → TRUE (genuine ON→OFF after hydration)

// Test case 9: shouldPersistOnToOffTransition - Initial load (not hydrated)
assert(
  shouldPersistOnToOffTransition(false, true, false) === false,
  `Should skip initial load (not hydrated): default true → resolved false`
);

// Test case 10: shouldPersistOnToOffTransition - First real value after hydration
assert(
  shouldPersistOnToOffTransition(true, null, false) === false,
  `Should skip first transition after hydration (previous=null)`
);

assert(
  shouldPersistOnToOffTransition(true, null, true) === false,
  `Should skip first transition after hydration even if ON (previous=null)`
);

// Test case 11: shouldPersistOnToOffTransition - No transition (OFF→OFF)
assert(
  shouldPersistOnToOffTransition(true, false, false) === false,
  `Should skip OFF→OFF transition`
);

// Test case 12: shouldPersistOnToOffTransition - No transition (ON→ON)
assert(
  shouldPersistOnToOffTransition(true, true, true) === false,
  `Should skip ON→ON transition`
);

// Test case 13: shouldPersistOnToOffTransition - OFF→ON transition
assert(
  shouldPersistOnToOffTransition(true, false, true) === false,
  `Should skip OFF→ON transition (not our case)`
);

// Test case 14: shouldPersistOnToOffTransition - Genuine ON→OFF after hydration
assert(
  shouldPersistOnToOffTransition(true, true, false) === true,
  `Should detect genuine ON→OFF transition after hydration`
);

// Test case 15: shouldPersistOnToOffTransition - Edge case: not hydrated, previous=null
assert(
  shouldPersistOnToOffTransition(false, null, false) === false,
  `Should skip when not hydrated and previous=null`
);

// Test case 16: Editor effect sequencing for the boolean helper
// Mirrors page.tsx: skip while !hydrated; seed previous on first hydrated value
// without persisting; only then allow a later ON→OFF to persist.
{
  let previous: boolean | null = null;
  let persistCalls = 0;

  function simulateEffect(hydrated: boolean, next: boolean): void {
    if (!hydrated) return;
    if (previous === null) {
      previous = next;
      return;
    }
    if (shouldPersistOnToOffTransition(true, previous, next)) {
      persistCalls += 1;
    }
    previous = next;
  }

  // Pre-hydration default ON must not seed the ref
  simulateEffect(false, true);
  assert(previous === null, `Pre-hydration must leave previous=null`);
  assert(persistCalls === 0, `Pre-hydration must not persist`);

  // First hydrated value (server OFF) seeds without persisting
  simulateEffect(true, false);
  assert(previous === false, `First hydrated value should seed previous`);
  assert(persistCalls === 0, `Seeding first hydrated value must not persist`);

  // Later user ON→OFF should persist once
  simulateEffect(true, true);
  assert(persistCalls === 0, `OFF→ON must not persist`);
  simulateEffect(true, false);
  assert(persistCalls === 1, `Genuine post-seed ON→OFF should persist once`);
}

if (failures > 0) {
  console.error(`\non-to-off-transition.selftest: ${failures} failure(s)`);
  process.exit(1);
}

console.log("on-to-off-transition.selftest: all assertions passed");
