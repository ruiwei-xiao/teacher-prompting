/**
 * Client-safe shared-document helpers (Tasks 6.2–6.3).
 * Room id, Yjs document keys, auth endpoint, cursor identity,
 * snapshot POST, and lock/outage read-only rules.
 * Does not import the calibration engine, store, or API modules.
 */

export const LIVEBLOCKS_AUTH_ENDPOINT = "/api/calibration/liveblocks-auth";

/** Idle debounce before POSTing a plain-text snapshot (design: ≈3–5 s). */
export const SNAPSHOT_DEBOUNCE_MS = 4000;

export const LIVEBLOCKS_OUTAGE_BANNER =
  "Liveblocks is unavailable. Showing the last saved snapshot as read-only.";

export const DOC_YJS_KEYS = ["rubric", "notes"] as const;

export type SharedDocKey = (typeof DOC_YJS_KEYS)[number];

export type SharedDocSnapshots = Record<SharedDocKey, string>;

export type SharedDocRole = "member" | "operator";

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

export function snapshotApiHref(teamId: string, docKind: SharedDocKey): string {
  return `/api/calibration/teams/${teamId}/docs/${docKind}`;
}

export function snapshotPostBody(text: string): { text: string } {
  return { text };
}

export function snapshotsFromDocs(
  docs: ReadonlyArray<{ docKind: string; snapshotText: string }> | null | undefined
): SharedDocSnapshots {
  const snapshots: SharedDocSnapshots = { rubric: "", notes: "" };
  for (const doc of docs ?? []) {
    if (doc.docKind === "rubric" || doc.docKind === "notes") {
      snapshots[doc.docKind] = doc.snapshotText;
    }
  }
  return snapshots;
}

export function canPushDocSnapshot(input: {
  locked: boolean;
  role: SharedDocRole;
}): boolean {
  return !input.locked && input.role === "member";
}

export function shouldShowReadOnly(input: {
  locked: boolean;
  liveblocksDown: boolean;
}): boolean {
  return input.locked || input.liveblocksDown;
}

export function isLiveblocksOutage(input: {
  status?: string | null;
  lostConnection?: string | null;
}): boolean {
  if (input.status === "disconnected") return true;
  if (input.lostConnection === "lost" || input.lostConnection === "failed") {
    return true;
  }
  return false;
}
