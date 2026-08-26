/**
 * Client helpers for public-chat owner-sharing toggle.
 * The sharing endpoint accepts { shared: boolean }; 404 is local success
 * so the toggle can change before the first recorded turn (or after an
 * anonymous discard).
 */

export const SHARING_OPT_OUT_ERROR =
  "Could not turn off sharing. Please try again.";

export const SHARING_OPT_IN_ERROR =
  "Could not turn on sharing. Please try again.";

export type SharingRequest = {
  url: string;
  method: "POST";
  body: { shared: boolean };
};

export type OptOutResultInput =
  | { ok: true }
  | { ok?: false; error?: string };

export type SharingClientState = {
  sharing: boolean;
  error: string | null;
};

export function buildSharingRequest(
  sessionId: string,
  shared: boolean
): SharingRequest {
  return {
    url: `/api/sessions/${encodeURIComponent(sessionId)}/sharing`,
    method: "POST",
    body: { shared },
  };
}

/**
 * Map the sharing-endpoint HTTP status to a toggle result.
 * 2xx: session existed and the requested transition succeeded.
 * 404: no session row yet (toggle before the first recorded turn, or
 *      anonymous re-enable after discard) — local success so later chat
 *      turns send the live ownerSharing flag.
 * Other statuses (403/500/…) are real failures of an existing session.
 */
export function sharingResultFromHttpStatus(status: number): OptOutResultInput {
  if ((status >= 200 && status < 300) || status === 404) {
    return { ok: true };
  }
  return { ok: false };
}

/** @deprecated Use sharingResultFromHttpStatus. */
export function optOutResultFromHttpStatus(status: number): OptOutResultInput {
  return sharingResultFromHttpStatus(status);
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

export function applySharingResult(
  currentSharing: boolean,
  requested: boolean,
  result: OptOutResultInput
): SharingClientState {
  if ("ok" in result && result.ok === true) {
    return { sharing: requested, error: null };
  }
  return {
    sharing: currentSharing,
    error: requested ? SHARING_OPT_IN_ERROR : SHARING_OPT_OUT_ERROR,
  };
}

/**
 * Apply an off-transition. Failures while already off leave sharing off.
 */
export function applySharingTransition(
  currentSharing: boolean,
  result: OptOutResultInput
): SharingClientState {
  if (!currentSharing) {
    return { sharing: false, error: null };
  }
  return applyOptOutResult(result);
}

export function isSharingToggleDisabled(_sharing: boolean): boolean {
  return false;
}
