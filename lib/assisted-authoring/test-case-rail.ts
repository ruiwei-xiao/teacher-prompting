/**
 * Helper for right editor panel visibility based on mode hydration.
 *
 * The assisted suite vs try-chat content is gated inside AssistantPanel.
 * This helper only decides whether the right panel host should mount after
 * mode has been loaded (avoids flashing the wrong surface before hydrate).
 *
 * @param modeHydrated - Whether assisted authoring mode has been loaded from the server
 * @returns true if the right panel should be shown
 */
export function shouldShowTestCaseRail(modeHydrated: boolean): boolean {
  return modeHydrated;
}
