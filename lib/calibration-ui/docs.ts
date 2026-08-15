/**
 * Client-safe shared-document helpers (Task 6.2).
 * Room id, Yjs document keys, auth endpoint, and cursor identity.
 * Does not import the calibration engine, store, or API modules.
 */

export const LIVEBLOCKS_AUTH_ENDPOINT = "/api/calibration/liveblocks-auth";

export const DOC_YJS_KEYS = ["rubric", "notes"] as const;

export type SharedDocKey = (typeof DOC_YJS_KEYS)[number];

export type CursorUserInfo = {
  name?: string | null;
  color?: string | null;
} | null | undefined;

export type CursorIdentity = {
  username: string;
  cursorColor: string;
};

const FALLBACK_CURSOR_COLOR = "#0ea5e9";
const FALLBACK_CURSOR_NAME = "Member";

export function liveblocksRoomId(teamId: string): string {
  return `calibration:${teamId}`;
}

/**
 * Map Liveblocks token userInfo (name + color) onto Lexical cursor props.
 */
export function cursorIdentity(userInfo: CursorUserInfo): CursorIdentity {
  const username = userInfo?.name?.trim() || FALLBACK_CURSOR_NAME;
  const cursorColor = userInfo?.color?.trim() || FALLBACK_CURSOR_COLOR;
  return { username, cursorColor };
}

export function sharedDocTitle(docKey: SharedDocKey): string {
  return docKey === "rubric" ? "Shared rubric" : "Shared notes";
}

export function sharedDocPlaceholder(docKey: SharedDocKey): string {
  return docKey === "rubric"
    ? "Synthesize 3–4 criteria, each with a one-line rationale."
    : "Capture evidence, disagreements, and working notes.";
}
