/**
 * Client-safe Starred Library navigation helpers for WorkspaceSidebar.
 */

export const STARRED_HREF = "/starred";

/** True when pathname is the Starred library (exact or nested under /starred). */
export function isStarredPath(pathname: string): boolean {
  return (
    pathname === STARRED_HREF ||
    pathname === `${STARRED_HREF}/` ||
    pathname.startsWith(`${STARRED_HREF}/`)
  );
}
