/**
 * Self-test: PATCH validation for assistedAuthoringMode (Task 1.3).
 * Tests validation logic without spinning up Next server.
 *
 * Run: npx tsx lib/app-store/patch-validation.selftest.ts
 */
import {
  validateAssistedAuthoringMode,
  createDefaultBotFields,
} from "./patch-validation";

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
  console.log("Test 1: Missing assistedAuthoringMode is valid (undefined)");
  const result1 = validateAssistedAuthoringMode({});
  assert(result1.ok, "validation passes when field is absent");
  if (result1.ok) {
    assertEqual(result1.value, undefined, "value is undefined");
  }

  console.log("Test 2: assistedAuthoringMode=true is valid");
  const result2 = validateAssistedAuthoringMode({ assistedAuthoringMode: true });
  assert(result2.ok, "validation passes for true");
  if (result2.ok) {
    assertEqual(result2.value, true, "value is true");
  }

  console.log("Test 3: assistedAuthoringMode=false is valid");
  const result3 = validateAssistedAuthoringMode({ assistedAuthoringMode: false });
  assert(result3.ok, "validation passes for false");
  if (result3.ok) {
    assertEqual(result3.value, false, "value is false");
  }

  console.log("Test 4: assistedAuthoringMode='true' (string) is invalid");
  const result4 = validateAssistedAuthoringMode({ assistedAuthoringMode: "true" });
  assert(!result4.ok, "validation fails for string");
  if (!result4.ok) {
    assertEqual(result4.status, 400, "status is 400");
    assert(
      result4.error.includes("boolean"),
      "error message mentions boolean"
    );
  }

  console.log("Test 5: assistedAuthoringMode=1 (number) is invalid");
  const result5 = validateAssistedAuthoringMode({ assistedAuthoringMode: 1 });
  assert(!result5.ok, "validation fails for number");
  if (!result5.ok) {
    assertEqual(result5.status, 400, "status is 400");
  }

  console.log("Test 6: assistedAuthoringMode=null is invalid");
  const result6 = validateAssistedAuthoringMode({ assistedAuthoringMode: null });
  assert(!result6.ok, "validation fails for null");
  if (!result6.ok) {
    assertEqual(result6.status, 400, "status is 400");
  }

  console.log("Test 7: assistedAuthoringMode={} (object) is invalid");
  const result7 = validateAssistedAuthoringMode({ assistedAuthoringMode: {} });
  assert(!result7.ok, "validation fails for object");
  if (!result7.ok) {
    assertEqual(result7.status, 400, "status is 400");
  }

  console.log("Test 8: assistedAuthoringMode=[] (array) is invalid");
  const result8 = validateAssistedAuthoringMode({ assistedAuthoringMode: [] });
  assert(!result8.ok, "validation fails for array");
  if (!result8.ok) {
    assertEqual(result8.status, 400, "status is 400");
  }

  console.log("Test 9: createDefaultBotFields returns assistedAuthoringMode=false");
  const defaults = createDefaultBotFields();
  assertEqual(
    defaults.assistedAuthoringMode,
    false,
    "new bots default to OFF (false)"
  );

  console.log(
    "Test 10: assistedAuthoringMode with other fields (mixed body)"
  );
  const result10 = validateAssistedAuthoringMode({
    name: "Test Bot",
    assistedAuthoringMode: true,
    systemPrompt: "Be helpful",
  });
  assert(result10.ok, "validation passes with other fields present");
  if (result10.ok) {
    assertEqual(result10.value, true, "value is true");
  }

  if (failures > 0) {
    console.error(`\npatch-validation.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\npatch-validation.selftest: all assertions passed");
}

main();
