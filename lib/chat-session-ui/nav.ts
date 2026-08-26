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

export function activityExportHref(
  appId: string,
  format: "csv" | "json",
  filter: { surface?: string; from?: string; to?: string } = {}
): string {
  const params = new URLSearchParams({ format });
  const surface = filter.surface?.trim();
  const from = filter.from?.trim();
  const to = filter.to?.trim();
  if (surface) params.set("surface", surface);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/api/apps/${encodeURIComponent(appId)}/sessions/export?${params.toString()}`;
}
