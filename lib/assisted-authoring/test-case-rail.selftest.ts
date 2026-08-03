/**
 * Self-test for shouldShowTestCaseRail helper.
 * 
 * Tests the visibility logic for test-case rail based on assisted authoring mode.
 * 
 * Run: npx tsx lib/assisted-authoring/test-case-rail.selftest.ts
 */

import { shouldShowTestCaseRail } from "./test-case-rail";

// Test case: Mode ON → rail should be visible
const onResult = shouldShowTestCaseRail(true);
if (onResult !== true) {
  throw new Error(`Expected shouldShowTestCaseRail(true) to return true (show rail when mode is ON), got ${onResult}`);
}

// Test case: Mode OFF → rail should be hidden
const offResult = shouldShowTestCaseRail(false);
if (offResult !== false) {
  throw new Error(`Expected shouldShowTestCaseRail(false) to return false (hide rail when mode is OFF), got ${offResult}`);
}

console.log("✓ All test-case rail visibility tests passed");
