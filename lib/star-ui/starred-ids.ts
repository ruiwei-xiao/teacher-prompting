/**
 * Client-safe helpers for My bots / Workspace star toggles (Task 4.1).
 */

/** Derive a Set of starred app ids from an eligible stars list. */
export function starredAppIdsFromList(
  stars: ReadonlyArray<{ appId: string }>
): Set<string> {
  return new Set(stars.map((star) => star.appId));
}
