/**
 * Helper to gate assisted authoring behaviors (Task 3.3).
 * Used by AssistantPanel to control auto-generation and prompt revision features.
 */

/**
 * Returns true if assisted authoring behaviors should be enabled.
 * Defaults to true for backward compatibility with components that don't yet pass the prop.
 * 
 * @param mode - The assisted authoring mode flag (true = ON, false = OFF, undefined = ON by default)
 * @returns true if assisted behaviors should be enabled, false otherwise
 */
export function isAssistedBehaviorEnabled(mode: boolean | undefined): boolean {
  return mode !== false;
}
