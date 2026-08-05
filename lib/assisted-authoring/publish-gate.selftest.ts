/**
 * Self-test for publish gate logic.
 * 
 * Tests the shouldBlockPublishForTestCases helper which determines
 * whether to block publish based on Assisted Authoring Mode and test case status.
 */

import { shouldBlockPublishForTestCases } from "./publish-gate";

// Test case: Mode ON, no test cases → BLOCK
const onNoTestsResult = shouldBlockPublishForTestCases(true, {
  totalCount: 0,
  passedCount: 0,
  allPassed: false,
});
if (onNoTestsResult.shouldBlock !== true) {
  throw new Error(`Expected shouldBlock=true when mode ON and no test cases, got ${onNoTestsResult.shouldBlock}`);
}
if (!onNoTestsResult.reason?.includes("at least one test case")) {
  throw new Error(`Expected reason about needing test cases, got: ${onNoTestsResult.reason}`);
}

// Test case: Mode ON, some tests but not all passed → BLOCK
const onPartialPassResult = shouldBlockPublishForTestCases(true, {
  totalCount: 3,
  passedCount: 2,
  allPassed: false,
});
if (onPartialPassResult.shouldBlock !== true) {
  throw new Error(`Expected shouldBlock=true when mode ON and partial pass, got ${onPartialPassResult.shouldBlock}`);
}
if (!onPartialPassResult.reason?.includes("Mark all test cases as pass")) {
  throw new Error(`Expected reason about marking all as pass, got: ${onPartialPassResult.reason}`);
}

// Test case: Mode ON, all tests passed → ALLOW
const onAllPassedResult = shouldBlockPublishForTestCases(true, {
  totalCount: 2,
  passedCount: 2,
  allPassed: true,
});
if (onAllPassedResult.shouldBlock !== false) {
  throw new Error(`Expected shouldBlock=false when mode ON and all passed, got ${onAllPassedResult.shouldBlock}`);
}

// Test case: Mode OFF, no test cases → ALLOW
const offNoTestsResult = shouldBlockPublishForTestCases(false, {
  totalCount: 0,
  passedCount: 0,
  allPassed: false,
});
if (offNoTestsResult.shouldBlock !== false) {
  throw new Error(`Expected shouldBlock=false when mode OFF and no tests, got ${offNoTestsResult.shouldBlock}`);
}

// Test case: Mode OFF, some tests but not all passed → ALLOW
const offPartialPassResult = shouldBlockPublishForTestCases(false, {
  totalCount: 3,
  passedCount: 1,
  allPassed: false,
});
if (offPartialPassResult.shouldBlock !== false) {
  throw new Error(`Expected shouldBlock=false when mode OFF and partial pass, got ${offPartialPassResult.shouldBlock}`);
}

// Test case: Mode OFF, all tests passed → ALLOW
const offAllPassedResult = shouldBlockPublishForTestCases(false, {
  totalCount: 2,
  passedCount: 2,
  allPassed: true,
});
if (offAllPassedResult.shouldBlock !== false) {
  throw new Error(`Expected shouldBlock=false when mode OFF and all passed, got ${offAllPassedResult.shouldBlock}`);
}

console.log("✓ All publish gate tests passed");
