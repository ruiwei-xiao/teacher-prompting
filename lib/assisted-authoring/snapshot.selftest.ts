/**
 * Self-test for assisted-authoring snapshot helpers (regenerate-only OFF→ON).
 * Run: npx tsx lib/assisted-authoring/snapshot.selftest.ts
 */

import {
  clearAssistedAuthoringSnapshot,
  fingerprintFinalPrompt,
  planOffToOnTransition,
  readAssistedAuthoringSnapshot,
  saveAssistedAuthoringSnapshot,
} from "./snapshot";
import type { AssistedAuthoringSnapshot } from "./types";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

const mockStorage = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mockStorage.set(key, value);
  },
  removeItem: (key: string) => {
    mockStorage.delete(key);
  },
  clear: () => mockStorage.clear(),
  key: () => null,
  get length() {
    return mockStorage.size;
  },
} as Storage;

mockStorage.clear();

const fpA = fingerprintFinalPrompt("hello");
const fpB = fingerprintFinalPrompt("hello");
const fpC = fingerprintFinalPrompt("hello world");
assert(fpA === fpB, "same prompt should fingerprint equal");
assert(fpA !== fpC, "different prompts should fingerprint differently");

const snapshot: AssistedAuthoringSnapshot = {
  appId: "app-1",
  promptFingerprint: fpA,
  testCases: [{ id: "1" }],
  savedAt: new Date().toISOString(),
};
saveAssistedAuthoringSnapshot(snapshot);
const readBack = readAssistedAuthoringSnapshot("app-1");
assert(readBack?.appId === "app-1", "snapshot should round-trip");
assert(
  Array.isArray(readBack?.testCases) && readBack!.testCases.length === 1,
  "snapshot test cases should round-trip"
);

clearAssistedAuthoringSnapshot("app-1");
assert(
  readAssistedAuthoringSnapshot("app-1") === null,
  "clear should remove snapshot"
);

const plan = planOffToOnTransition({
  appId: "app-1",
  currentFinalPrompt: "anything",
});
assert(
  plan.action === "regenerate",
  `OFF→ON plan should always regenerate, got ${plan.action}`
);

// Even with a leftover snapshot, plan must regenerate (no restore).
saveAssistedAuthoringSnapshot(snapshot);
const planWithSnapshot = planOffToOnTransition({
  appId: "app-1",
  currentFinalPrompt: "hello",
});
assert(
  planWithSnapshot.action === "regenerate",
  "matching leftover snapshot must not restore"
);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}

console.log("OK: assisted-authoring snapshot helpers");
