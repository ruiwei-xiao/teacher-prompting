/**
 * Client-safe sample-bot try-chat helpers.
 * Does not import the calibration engine, store, or API modules.
 */
export function sampleChatApiHref(teamId: string): string {
  return `/api/calibration/teams/${teamId}/sample-chat`;
}
