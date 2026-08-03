/**
 * Helper for test-case rail visibility based on assisted authoring mode.
 * 
 * @param assistedAuthoringMode - Whether assisted authoring mode is enabled
 * @returns true if test-case rail should be shown, false otherwise
 */
export function shouldShowTestCaseRail(assistedAuthoringMode: boolean): boolean {
  return assistedAuthoringMode;
}
