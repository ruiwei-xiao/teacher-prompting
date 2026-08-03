/**
 * OFF→ON transition planner for Assisted Authoring Mode (Task 3.5).
 * 
 * Plans restore or regenerate when mode transitions from OFF to ON based on
 * Final Prompt fingerprint comparison with preserved snapshot.
 */

/**
 * Determines if a mode transition should trigger OFF→ON restore/regenerate planning.
 * 
 * Critical: Prevents false positives during initial hydration (default true → resolved false).
 * Only returns true for genuine user-initiated OFF→ON transitions after hydration completes.
 * 
 * @param hydrated - Whether the mode has been initialized from server (true after first loadApp)
 * @param previous - Previous assistedAuthoringMode value (null before first transition)
 * @param next - Next assistedAuthoringMode value
 * @returns true if OFF→ON restore/regenerate should be planned, false otherwise
 */
export function shouldPersistOffToOnTransition(
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

  // Genuine OFF→ON transition after hydration
  return previous === false && next === true;
}
