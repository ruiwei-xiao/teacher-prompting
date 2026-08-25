/**
 * Client helpers for public-chat owner-sharing opt-out (task 4).
 * The sharing endpoint accepts only the off transition; off is sticky.
 */

export const SHARING_OPT_OUT_ERROR =
  "Could not turn off sharing. Please try again.";

export type SharingRequest = {
  url: string;
  method: "POST";
};

export type OptOutResultInput =
  | { ok: true }
  | { ok?: false; error?: string };

export type SharingClientState = {
  sharing: boolean;
  error: string | null;
};

export function buildSharingRequest(sessionId: string): SharingRequest {
  return {
    url: `/api/sessions/${encodeURIComponent(sessionId)}/sharing`,
    method: "POST",
  };
}

/**
 * Map the sharing-endpoint HTTP status to an opt-out result.
 * 2xx: session existed and opt-out succeeded.
 * 404: no session row yet (opt-out before the first recorded turn) — local
 *      success so later chat turns send ownerSharing:false.
 * Other statuses (403/500/…) are real failures of an existing session.
 */
export function optOutResultFromHttpStatus(status: number): OptOutResultInput {
  if ((status >= 200 && status < 300) || status === 404) {
    return { ok: true };
  }
  return { ok: false };
}

export function applyOptOutResult(
  result: OptOutResultInput
): SharingClientState {
  if ("ok" in result && result.ok === true) {
    return { sharing: false, error: null };
  }
  return {
    sharing: true,
    error: SHARING_OPT_OUT_ERROR,
  };
}

/** Sticky-off: once sharing is false, later failures cannot turn it back on. */
export function applySharingTransition(
  currentSharing: boolean,
  result: OptOutResultInput
): SharingClientState {
  if (!currentSharing) {
    return { sharing: false, error: null };
  }
  return applyOptOutResult(result);
}

export function isSharingToggleDisabled(sharing: boolean): boolean {
  return sharing === false;
}
