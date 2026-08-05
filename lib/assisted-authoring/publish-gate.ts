/**
 * Publish gate logic for Assisted Authoring Mode.
 * 
 * Determines whether to block publish based on mode and test case status.
 */

import type { AssistedAuthoringMode } from "./types";

export type TestCaseStatus = {
  totalCount: number;
  passedCount: number;
  allPassed: boolean;
};

export type PublishGateResult = {
  shouldBlock: boolean;
  reason?: string;
};

/**
 * Determines whether to block publish based on Assisted Authoring Mode and test case status.
 * 
 * Gate logic:
 * - Mode ON + no test cases → BLOCK with reason
 * - Mode ON + not all passed → BLOCK with reason
 * - Mode ON + all passed → ALLOW
 * - Mode OFF (any status) → ALLOW
 * 
 * @param mode - Assisted Authoring Mode (true=ON, false=OFF)
 * @param testCaseStatus - Current test case status
 * @returns Gate result indicating whether to block and reason if blocked
 */
export function shouldBlockPublishForTestCases(
  mode: AssistedAuthoringMode,
  testCaseStatus: TestCaseStatus
): PublishGateResult {
  // Mode OFF: always allow publish regardless of test status
  if (!mode) {
    return { shouldBlock: false };
  }

  // Mode ON: check test case status
  if (!testCaseStatus.allPassed) {
    if (testCaseStatus.totalCount === 0) {
      return {
        shouldBlock: true,
        reason: "Add and pass at least one test case before publishing.",
      };
    }
    
    return {
      shouldBlock: true,
      reason: `Mark all test cases as pass before publishing. ${testCaseStatus.passedCount} of ${testCaseStatus.totalCount} passed so far.`,
    };
  }

  // Mode ON + all passed: allow publish
  return { shouldBlock: false };
}
