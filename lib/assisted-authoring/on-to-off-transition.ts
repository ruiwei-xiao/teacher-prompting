/**
 * ON→OFF transition planner for Assisted Authoring Mode (Task 3.4).
 * 
 * Plans snapshot creation before hiding test cases when mode transitions from ON to OFF.
 */

import type { AssistedAuthoringSnapshot } from "./types";
import { fingerprintFinalPrompt } from "./snapshot";

/**
 * Plan for ON→OFF transition.
 * Returns snapshot save plan or error indication.
 */
export type OnToOffTransitionPlan =
  | { action: "save-and-hide"; snapshot: AssistedAuthoringSnapshot }
  | { action: "error"; reason: string };

/**
 * Input for ON→OFF transition planner.
 */
export interface OnToOffTransitionInput {
  appId: string;
  testCases: unknown[];
  finalPromptText: string;
}

/**
 * Determines if a mode transition should trigger snapshot persistence.
 * 
 * Critical: Prevents false positives during initial hydration (default true → resolved false).
 * Only returns true for genuine user-initiated ON→OFF transitions after hydration completes.
 * 
 * @param hydrated - Whether the mode has been initialized from server (true after first loadApp)
 * @param previous - Previous assistedAuthoringMode value (null before first transition)
 * @param next - Next assistedAuthoringMode value
 * @returns true if snapshot should be saved, false otherwise
 */
export function shouldPersistOnToOffTransition(
  hydrated: boolean,
  previous: boolean | null,
  next: boolean
): boolean {
  // Not yet hydrated: skip (still using default value)
  if (!hydrated) {
    return false;
  }

  // No previous value: skip (first transition after hydration)
  if (previous === null) {
    return false;
  }

  // Genuine ON→OFF transition after hydration
  return previous === true && next === false;
}

/**
 * Plan ON→OFF transition: create snapshot from current test cases and Final Prompt.
 * 
 * Validation:
 * - appId must be non-empty
 * - testCases can be empty array (valid state)
 * - finalPromptText can be empty string (valid state)
 * 
 * @param input - Current app state (appId, testCases, finalPromptText)
 * @returns Plan indicating save-and-hide with snapshot, or error with reason
 */
export function planOnToOffTransition(
  input: OnToOffTransitionInput
): OnToOffTransitionPlan {
  // Validate appId
  if (!input.appId || input.appId.trim() === "") {
    return {
      action: "error",
      reason: "appId is required for snapshot creation",
    };
  }

  // Create snapshot
  const snapshot: AssistedAuthoringSnapshot = {
    appId: input.appId,
    promptFingerprint: fingerprintFinalPrompt(input.finalPromptText),
    testCases: input.testCases,
    savedAt: new Date().toISOString(),
  };

  return {
    action: "save-and-hide",
    snapshot,
  };
}
