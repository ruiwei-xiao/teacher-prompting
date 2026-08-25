/**
 * Client-safe chat session navigation helpers for sidebar and activity entry points.
 */

export const MY_SESSIONS_HREF = "/sessions";

/** True when pathname is My sessions (exact or nested under /sessions). */
export function isMySessionsPath(pathname: string): boolean {
  return (
    pathname === MY_SESSIONS_HREF ||
    pathname === `${MY_SESSIONS_HREF}/` ||
    pathname.startsWith(`${MY_SESSIONS_HREF}/`)
  );
}

export function activityHrefForApp(appId: string): string {
  return `/app/${appId}/activity`;
}
