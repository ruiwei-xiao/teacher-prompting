/**
 * Runtime self-test for Assisted Authoring Snapshot Store (Task 2.2).
 * Run: npx tsx lib/assisted-authoring/snapshot.selftest.ts
 */

import {
  fingerprintFinalPrompt,
  saveAssistedAuthoringSnapshot,
  readAssistedAuthoringSnapshot,
  clearAssistedAuthoringSnapshot,
  planOffToOnTransition,
} from "./snapshot";
import type { AssistedAuthoringSnapshot } from "./types";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

// Mock storage for testing under Node/tsx
const mockStorage = new Map<string, string>();
const mockStorageAPI = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mockStorage.set(key, value);
  },
  removeItem: (key: string) => {
    mockStorage.delete(key);
  },
  clear: () => {
    mockStorage.clear();
  },
};

// Inject mock storage into global (for Node environment)
if (typeof window === "undefined") {
  (global as any).localStorage = mockStorageAPI;
}

// Test 1: fingerprintFinalPrompt normalizes whitespace
const fp1 = fingerprintFinalPrompt("  hello world  ");
const fp2 = fingerprintFinalPrompt("hello world");
assert(
  fp1 === fp2,
  `fingerprints should match after whitespace normalization: "${fp1}" vs "${fp2}"`
);

// Test 2: fingerprintFinalPrompt produces different hashes for different content
const fp3 = fingerprintFinalPrompt("hello world");
const fp4 = fingerprintFinalPrompt("goodbye world");
assert(
  fp3 !== fp4,
  `different prompts should produce different fingerprints: "${fp3}" vs "${fp4}"`
);

// Test 3: saveAssistedAuthoringSnapshot and readAssistedAuthoringSnapshot round-trip
mockStorage.clear();
const testSnapshot: AssistedAuthoringSnapshot = {
  appId: "test-app-1",
  promptFingerprint: "abc123",
  testCases: [{ id: "tc1", input: "test input", expectedOutput: "test output" }],
  savedAt: new Date().toISOString(),
};

saveAssistedAuthoringSnapshot(testSnapshot);
const retrieved = readAssistedAuthoringSnapshot("test-app-1");
assert(
  retrieved !== null,
  "readAssistedAuthoringSnapshot should return snapshot after save"
);
assert(
  retrieved?.appId === "test-app-1",
  `retrieved appId should match: ${retrieved?.appId}`
);
assert(
  retrieved?.promptFingerprint === "abc123",
  `retrieved fingerprint should match: ${retrieved?.promptFingerprint}`
);
assert(
  Array.isArray(retrieved?.testCases) && retrieved.testCases.length === 1,
  `retrieved test cases should match: ${JSON.stringify(retrieved?.testCases)}`
);

// Test 4: readAssistedAuthoringSnapshot returns null when no snapshot exists
mockStorage.clear();
const missing = readAssistedAuthoringSnapshot("nonexistent-app");
assert(
  missing === null,
  `readAssistedAuthoringSnapshot should return null for missing snapshot, got ${missing}`
);

// Test 5: clearAssistedAuthoringSnapshot removes snapshot
mockStorage.clear();
saveAssistedAuthoringSnapshot(testSnapshot);
clearAssistedAuthoringSnapshot("test-app-1");
const cleared = readAssistedAuthoringSnapshot("test-app-1");
assert(
  cleared === null,
  `snapshot should be null after clear, got ${cleared}`
);

// Test 6: planOffToOnTransition returns "restore" when fingerprints match
mockStorage.clear();
const currentPrompt = "hello teacher";
const matchingSnapshot: AssistedAuthoringSnapshot = {
  appId: "test-app-2",
  promptFingerprint: fingerprintFinalPrompt(currentPrompt),
  testCases: [{ id: "tc2" }],
  savedAt: new Date().toISOString(),
};
saveAssistedAuthoringSnapshot(matchingSnapshot);

const restorePlan = planOffToOnTransition({
  appId: "test-app-2",
  currentFinalPrompt: currentPrompt,
});
assert(
  restorePlan.action === "restore",
  `plan should be restore when fingerprints match, got ${restorePlan.action}`
);
if (restorePlan.action === "restore") {
  assert(
    restorePlan.snapshot.appId === "test-app-2",
    `restored snapshot appId should match: ${restorePlan.snapshot.appId}`
  );
}

// Test 7: planOffToOnTransition returns "regenerate" when fingerprints differ
mockStorage.clear();
const oldPrompt = "old prompt";
const newPrompt = "new prompt";
const mismatchSnapshot: AssistedAuthoringSnapshot = {
  appId: "test-app-3",
  promptFingerprint: fingerprintFinalPrompt(oldPrompt),
  testCases: [{ id: "tc3" }],
  savedAt: new Date().toISOString(),
};
saveAssistedAuthoringSnapshot(mismatchSnapshot);

const regenPlan = planOffToOnTransition({
  appId: "test-app-3",
  currentFinalPrompt: newPrompt,
});
assert(
  regenPlan.action === "regenerate",
  `plan should be regenerate when fingerprints differ, got ${regenPlan.action}`
);

// Test 8: planOffToOnTransition returns "regenerate" when snapshot is missing
mockStorage.clear();
const missingPlan = planOffToOnTransition({
  appId: "test-app-4",
  currentFinalPrompt: "some prompt",
});
assert(
  missingPlan.action === "regenerate",
  `plan should be regenerate when snapshot is missing, got ${missingPlan.action}`
);
if (missingPlan.action === "regenerate" && "reason" in missingPlan) {
  assert(
    missingPlan.reason === "missing-snapshot",
    `reason should be missing-snapshot, got ${missingPlan.reason}`
  );
}

// Test 9: snapshots are scoped by appId
mockStorage.clear();
const snap1: AssistedAuthoringSnapshot = {
  appId: "app-a",
  promptFingerprint: "fp-a",
  testCases: [{ id: "a" }],
  savedAt: new Date().toISOString(),
};
const snap2: AssistedAuthoringSnapshot = {
  appId: "app-b",
  promptFingerprint: "fp-b",
  testCases: [{ id: "b" }],
  savedAt: new Date().toISOString(),
};
saveAssistedAuthoringSnapshot(snap1);
saveAssistedAuthoringSnapshot(snap2);

const retrievedA = readAssistedAuthoringSnapshot("app-a");
const retrievedB = readAssistedAuthoringSnapshot("app-b");
assert(
  retrievedA?.appId === "app-a" && retrievedA?.promptFingerprint === "fp-a",
  `app-a snapshot should be isolated: ${retrievedA?.appId}`
);
assert(
  retrievedB?.appId === "app-b" && retrievedB?.promptFingerprint === "fp-b",
  `app-b snapshot should be isolated: ${retrievedB?.appId}`
);

// Test 10: fingerprint handles empty and whitespace-only strings
const fpEmpty = fingerprintFinalPrompt("");
const fpWhitespace = fingerprintFinalPrompt("   \n\t  ");
assert(
  fpEmpty === fpWhitespace,
  `empty and whitespace-only should produce same fingerprint: "${fpEmpty}" vs "${fpWhitespace}"`
);

if (failures > 0) {
  console.error(`\nsnapshot.selftest: ${failures} failure(s)`);
  process.exit(1);
}

console.log("snapshot.selftest: all assertions passed");
